---
name: resolve-tickets
description: Batch-close a list of GitHub issues one at a time — TDD implementation, optional code review under the marc-andreessen-persona, optional fix pass, then commit and close. Every step runs in its own fresh subagent, strictly sequential across issues, resumable (already-closed issues are skipped automatically). Explicit invoke only — trigger via /sgche:resolve-tickets or when the user asks to work through, burn down, or close out a batch/list of GitHub issues end to end without merging or opening PRs.
disable-model-invocation: true
---

# resolve-tickets

Runs `workflow.js` in this skill's directory via the `Workflow` tool. For a batch of issues, in order, each issue gets:

1. **tdd** — `/mattpocock-skills:tdd` against the issue.
2. **review** — `/mattpocock-skills:code-review unstaged` with `/sgche:marc-andreessen-persona`, skipped if step 1 touched no code files (docs-only issue).
3. **fix** — apply the review's hard issues only, skipped if the review found none.
4. **commit + close** — conventional-commit the changes. Verify the resolving commit is reachable on the default branch (`git branch --contains <sha>`) and the issue isn't already closed (`gh issue view <n> --json state`), then `gh issue comment <n> --body "Resolved by <commit-sha>. <one-line summary of what shipped>."` and `gh issue close <n> --reason completed`. No merge, no PR.

Each of the four steps is its own `agent()` call — a fresh subagent with no memory of the previous step, so its prompt carries everything it needs (issue number, prior report text, etc). That's deliberate: it's what keeps a long batch from drowning any one step in accumulated context.

## Precondition

Run this from the repo's **default branch**, checked out directly — no worktree, no per-issue branch. Step 4 closes issues on the direct-commit path, which requires the resolving commit to already be reachable from the default branch with no PR/merge involved. If the user wants isolation or a shared worktree for the batch, that's a different shape than this skill — set the worktree up yourself before invoking this.

## Invocation

```
Workflow({
  scriptPath: "<this skill's directory>/workflow.js",
  args: {
    repoPath: "/abs/path/to/repo",   // must already be checked out on the default branch
    issues: [42, 43, 44]             // also accepts "42,43", "42-44", "42~44", "#42~#44"
  }
})
```

Resolve `<this skill's directory>` from wherever this SKILL.md was loaded from — it sits next to `workflow.js`. `repoPath` is required and must be absolute: each of the four steps is a fresh subagent process with no shared shell state, so the working directory has to be passed explicitly rather than inherited from wherever you happen to be `cd`'d (same reasoning `sgche`'s `close-issues-batch` workflow uses for its `worktreePath` arg).

The workflow runs in the background; you get a `<task-notification>` when it returns. Report the result to the user — don't guess at it before the notification lands.

## When a step needs a human decision

`/mattpocock-skills:tdd` normally confirms test seams with the user before writing tests ("What's the public interface, and which seams should we test?"), and may hit other ambiguous, only-the-user-can-decide forks. A background subagent can't ask a live question mid-run, so the workflow's tdd step is instructed: if it would need to ask the user something, stop immediately, don't guess, and report `status: "needs-input"` with the question verbatim. When that happens, the whole batch stops right there — `pendingQuestion: { issueNumber, question }` comes back in the result, and every issue after it in the list is left untouched.

Your job when you see `pendingQuestion`:

1. Relay the question to the user **verbatim** and wait for their real answer — don't answer it yourself, don't paraphrase away nuance, and don't proceed on a guess.
2. Once they answer, re-invoke with `resumeFromRunId` (from the first run's result) and the same `args.issues`, plus `clarifications`:
   ```
   Workflow({
     scriptPath: "<...>/workflow.js",
     resumeFromRunId: "<runId from the stopped run>",
     args: { repoPath: "/abs/path/to/repo", issues: [42, 43, 44], clarifications: { 42: "<the user's exact answer>" } }
   })
   ```
   Issues already closed before the stop replay from cache instantly; issue #42 reruns its tdd step with the clarification folded into the prompt so it doesn't ask again.

Do not paper over a `needs-input` stop by picking an answer yourself, and do not silently skip ahead to the next issue — the batch is sequential specifically so this can't happen out of order.

## Resuming after any interruption

Every tdd-step prompt opens by checking `gh issue view <n> --json state`. If an issue is already `CLOSED`, that step reports `skipped-already-closed` immediately and does nothing else — so re-running the same `resolve-tickets` call (with or without `resumeFromRunId`) after a crash, a quota cutoff, or a `blocked`/`close-failed` stop always picks up correctly: issues already closed in an earlier partial run are skipped, not redone.

## Failure modes

- **Guessing at a `needs-input` stop.** The whole point of the fresh-subagent-per-step design is that nothing downstream commits to an unconfirmed choice. Defence: always relay verbatim, always wait for the real answer.
- **Treating `blocked` as retryable without looking.** `blocked` means something is actually wrong with the work (failing loop, unresolved review finding) — re-running blindly just repeats the failure. Defence: read `blockerReason`, fix the underlying issue or ask the user, then resume.
- **Running off a feature branch.** The direct-commit close path silently fails (or worse, closes against a commit that never reaches the default branch) if this isn't run from it. Defence: check the current branch before invoking.
- **Losing the `runId`.** Without it, resuming after a `needs-input` stop re-runs every step from scratch instead of hitting cache. Defence: hold onto the `Workflow` tool result's `runId` until the batch fully closes.

## Composes with

- `sgche:marc-andreessen-persona` is already wired into the review step by the workflow script itself — no need to add it again when invoking this skill.
