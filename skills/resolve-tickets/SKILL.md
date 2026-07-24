---
name: resolve-tickets
description: Batch-close a list of GitHub issues one at a time — TDD implementation, optional code review under the marc-andreessen-persona, optional fix pass, then commit and close. Every step runs in its own fresh subagent, strictly sequential across issues, resumable (already-closed issues are skipped automatically). Explicit invoke only — trigger via /sgche:resolve-tickets or when the user asks to work through, burn down, or close out a batch/list of GitHub issues end to end without merging or opening PRs.
disable-model-invocation: true
---
# resolve-tickets

Run `scripts/workflow.js` in skill dir via `Workflow` tool. Batch of issues, in order, each get:

1. **tdd** — `/mattpocock-skills:tdd` against issue.
2. **review** — `/mattpocock-skills:code-review unstaged` w/ `/sgche:marc-andreessen-persona`, skip if step 1 touch no code files (docs-only issue).
3. **fix** — apply review's hard issues only, skip if review found none.
4. **commit + close** — conventional-commit changes, no test/lint/type-check run here (tdd step already covered it, PR hook re-verifies later — keeps this step single-responsibility and fast). Verify resolving commit reachable on default branch (`git branch --contains <sha>`) and issue not already closed (`gh issue view <n> --json state`), then `gh issue comment <n> --body "Resolved by <commit-sha>. <one-line summary of what shipped>."` and `gh issue close <n> --reason completed`. No merge, no PR.

Each of four steps own `agent()` call — fresh subagent, no memory of prior step, so prompt carries everything needed (issue number, prior report text, etc). Deliberate: keeps long batch from drowning one step in accumulated context.

## Precondition

Run from repo's **default branch**, checked out directly — no worktree, no per-issue branch. Step 4 close issues on direct-commit path, needs resolving commit already reachable from default branch, no PR/merge involved. Want isolation or shared worktree for batch? Different shape than this skill — set worktree up yourself before invoking.

## Invocation

```
Workflow({
  scriptPath: "<this skill's directory>/scripts/workflow.js",
  args: {
    repoPath: "/abs/path/to/repo",   // must already be checked out on the default branch
    issues: [42, 43, 44]             // also accepts "42,43", "42-44", "42~44", "#42~#44"
  }
})
```

Resolve `<this skill's directory>` from wherever this SKILL.md loaded from — `workflow.js` sits in its `scripts/` subdir. `repoPath` required, must be absolute: each of four steps fresh subagent process, no shared shell state, working directory must pass explicit rather than inherit from wherever you happen `cd`'d (same reasoning `sgche`'s `close-issues-batch` workflow use for `worktreePath` arg).

Workflow run in background; get `<task-notification>` when returns. Report result to user — don't guess before notification lands.

## When step needs human decision

`/mattpocock-skills:tdd` normally confirms test seams w/ user before writing tests ("What's the public interface, and which seams should we test?"), may hit other ambiguous, only-user-can-decide forks. Background subagent can't ask live question mid-run, so workflow's tdd step instructed: if would need ask user something, stop immediately, don't guess, report `status: "needs-input"` w/ question verbatim. When happens, whole batch stop right there — `pendingQuestion: { issueNumber, question }` come back in result, every issue after it in list left untouched.

Job when see `pendingQuestion`:

1. Relay question to user **verbatim**, wait for real answer — don't answer yourself, don't paraphrase away nuance, don't proceed on guess.
2. Once they answer, re-invoke w/ `resumeFromRunId` (from first run's result) and same `args.issues`, plus `clarifications`:

```
Workflow({
  scriptPath: "<...>/scripts/workflow.js",
  resumeFromRunId: "<runId from the stopped run>",
  args: { repoPath: "/abs/path/to/repo", issues: [42, 43, 44], clarifications: { 42: "<the user's exact answer>" } }
})
```

Issues already closed before stop replay from cache instantly; issue #42 rerun tdd step w/ clarification folded into prompt so don't ask again.

Don't paper over `needs-input` stop by picking answer yourself, don't silently skip ahead to next issue — batch sequential specifically so this can't happen out of order.

## Resuming after any interruption

Every tdd-step prompt opens checking `gh issue view <n> --json state`. Issue already `CLOSED`? Step report `skipped-already-closed` immediately, does nothing else — so re-running same `resolve-tickets` call (with or without `resumeFromRunId`) after crash, quota cutoff, or `blocked`/`close-failed` stop always pick up correctly: issues already closed in earlier partial run skipped, not redone.

## Failure modes

- **Guessing at `needs-input` stop.** Whole point of fresh-subagent-per-step design: nothing downstream commits to unconfirmed choice. Defence: always relay verbatim, always wait for real answer.
- **Treating `blocked` as retryable without looking.** `blocked` means something actually wrong w/ work (failing loop, unresolved review finding) — re-running blindly just repeats failure. Defence: read `blockerReason`, fix underlying issue or ask user, then resume.
- **Running off feature branch.** Direct-commit close path silently fails (or worse, closes against commit that never reaches default branch) if not run from it. Defence: check current branch before invoking.
- **Losing `runId`.** Without it, resuming after `needs-input` stop re-runs every step from scratch instead of hitting cache. Defence: hold onto `Workflow` tool result's `runId` until batch fully closes.

## Composes with

- `sgche:marc-andreessen-persona` already wired into review step by workflow script itself — no need add again when invoking this skill.