---
name: resolve-tickets
description: Batch-close a list of GitHub issues — a planning pass reads each issue's blocked-by/blocking links to build a dependency DAG, then independent issues run in parallel (one git worktree each) while dependent ones wait for their blockers to merge. Per issue - TDD implementation, optional code review under the marc-andreessen-persona, optional fix pass, commit; then a serialized per-level step merges each branch into the base branch and closes the issue. Every step runs in its own fresh subagent, resumable (already-closed issues are skipped automatically). Explicit invoke only — trigger via /sgche:resolve-tickets or when the user asks to work through, burn down, or close out a batch/list of GitHub issues end to end without merging or opening PRs.
disable-model-invocation: true
---
# resolve-tickets

Run `scripts/workflow.js` in skill dir via `Workflow` tool.

## Shape

1. **Plan DAG** — one agent reads every issue in batch (body, comments, sub-issue links), extracts *explicit* dependency statements ("blocked by #N", "depends on #N", "blocks #N", parent/sub-issue), returns per-issue `blockedBy` (in-batch) + `externalBlockers` (open blockers outside batch). No inference from vibes — same-file overlap and issue-number order are not dependencies. If the planner can't return a complete node list, the workflow fails fast so the GitHub issue relationships can be clarified.
2. Script topologically sorts (Kahn) into **levels**. Level N depends only on levels < N, so a whole level runs in parallel. Cycle detected — fail fast so the GitHub issue relationships can be clarified.
3. **Process tickets** — per issue in level, in parallel, own worktree: **tdd** (`/mattpocock-skills:tdd`) → **review** (`/mattpocock-skills:code-review unstaged` w/ `/sgche:marc-andreessen-persona`, skipped if tdd touched no code files) → **fix** (review's hard issues only, skipped if none) → **commit** (conventional commit on issue branch, no test/lint run — tdd already covered, PR hook re-verifies later).
4. **Integrate** — one serialized agent per level: merge each issue branch into base branch in order, comment `Resolved by <sha>. <summary>.`, `gh issue close --reason completed`, remove worktree + delete branch. Merge conflict — abort merge, mark issue `merge-conflict`, leave its worktree for user, carry on with rest of level.

Each step own `agent()` call — fresh subagent, no memory of prior step, so prompt carries everything needed (issue number, worktree path, prior report text). Deliberate: keeps long batch from drowning one step in accumulated context.

## Why worktrees

Parallel issues can't share one working tree — tdd leaves changes uncommitted, so two concurrent issues would clobber each other's diff and each other's review. Each issue gets `<repoPath>/.claude/worktrees/issue-<n>` on branch `resolve-tickets/issue-<n>`, branched from base-branch HEAD at the moment its level starts. So a level-2 issue branches from a HEAD that already contains its level-1 blockers' merges — dependency semantics fall out of the level ordering for free.

Merging is serialized (one agent per level, issues in order) because every branch in a level merges into the same base branch in the shared checkout. Merge, never rebase — rebase rewrites the sha that gets reported on the issue.

Steps other than Integrate must never touch `repoPath`'s working tree; prompts say so explicitly.

## Precondition

Run from whatever branch/worktree already checked out — default branch, feature branch, any. Skill doesn't enforce or care which. Merges land directly on current branch, issues close against merged commit (no PR/merge-request step). User handles branch management, pushing, and getting work onto default branch offline, afterward.

## Invocation

```
Workflow({
  scriptPath: "<this skill's directory>/scripts/workflow.js",
  args: {
    repoPath: "/abs/path/to/repo",   // must already be checked out on whichever branch you want the commits on
    issues: [42, 43, 44],            // also accepts "42,43", "42-44", "42~44", "#42~#44"
    model: "opus",                   // optional — override agent model on every step
    effort: "high"                   // optional — override agent reasoning effort on every step
  }
})
```

`model` and `effort` both optional and independent — either, both, or neither. When set, override corresponding `agent()` opt; when absent, opt omitted so agent inherits session default.

Exception: commit step and Integrate step always run `model: "sonnet"`, ignore `args.model`. Both mechanical (commit message, `git merge`, `gh` comment/close) — bigger model buys nothing. `effort` still applies.

Resolve `<this skill's directory>` from wherever this SKILL.md loaded from — `workflow.js` sits in its `scripts/` subdir. `repoPath` required, must be absolute: every step is a fresh subagent process, no shared shell state, working directory must pass explicit rather than inherit from wherever you happen `cd`'d.

Workflow runs in background; get `<task-notification>` when returns. Report result to user — don't guess before notification lands.

## Result shape

`{ closed, levels, pendingQuestions, unresolved, results }`. `levels` is the computed execution plan (array of arrays). `unresolved` is every issue that didn't close, whatever the cause.

## When step needs human decision

`/mattpocock-skills:tdd` normally confirms test seams w/ user before writing tests ("What's the public interface, and which seams should we test?"), may hit other ambiguous, only-user-can-decide forks. Background subagent can't ask live question mid-run, so tdd step instructed: if would need ask user something, stop immediately, don't guess, report `status: "needs-input"` w/ question verbatim.

That issue stops there and every issue transitively blocked by it is skipped (`skipped-blocked-by-failure`). Independent issues keep going — parallelism means one stuck ticket no longer freezes the batch. Questions come back as `pendingQuestions: [{ issueNumber, question }]`.

Job when `pendingQuestions` non-empty:

1. Relay each question to user **verbatim**, wait for real answer — don't answer yourself, don't paraphrase away nuance, don't proceed on guess.
2. Once they answer, re-invoke w/ `resumeFromRunId` (from first run's result) and same `args.issues`, plus `clarifications`:

```
Workflow({
  scriptPath: "<...>/scripts/workflow.js",
  resumeFromRunId: "<runId from the stopped run>",
  args: { repoPath: "/abs/path/to/repo", issues: [42, 43, 44], clarifications: { 42: "<the user's exact answer>" } }
})
```

Issues already closed replay from cache instantly; #42 reruns tdd w/ clarification folded into prompt so doesn't ask again.

Don't paper over `needs-input` by picking answer yourself.

## Resuming after any interruption

Every tdd-step prompt opens checking `gh issue view <n> --json state`. Issue already `CLOSED`? Step reports `skipped-already-closed` immediately, creates no worktree — so re-running same call (with or without `resumeFromRunId`) after crash, quota cutoff, or `blocked` stop picks up correctly.

Worktrees are reused, not recreated: tdd prompt tells the subagent to reuse an existing `resolve-tickets/issue-<n>` worktree/branch and not redo work already committed on it. If that branch is clean and already has commits ahead of the base checkout, the issue skips straight to Integrate on rerun. Left-behind worktrees from a failed run (merge conflict, blocked step) are therefore safe on rerun — and safe to inspect or `git worktree remove` by hand.

## Investigating unrelated-looking failures

tdd step's prompt tells subagent: before single-test forensics on failure that looks unrelated to the issue, cheaply rule out "pre-existing" first — `git stash` (`-u` if untracked), rerun affected test file, `git stash pop`. ~10s round trip beats minutes of investigation.

(General test-runner tooling guidance, e.g. `rtk` usage, lives in `~/.claude/RTK.md` — global, applies beyond this skill, not duplicated here.)

## Test scope in tdd step

Once red-green loop closes, tdd step skips full-suite re-run when scope narrow and `ruff`/`ty`/scoped tests already pass — runs only files touched plus files importing the changed symbol. Full suite costs minutes, repeats once per issue; PR hook re-verifies everything later anyway. Wide-blast-radius change (shared util, public interface many files depend on) — subagent uses judgement, full suite worth it there.

## Failure modes

- **Guessing at `needs-input`.** Whole point of fresh-subagent-per-step design: nothing downstream commits to unconfirmed choice. Defence: always relay verbatim, always wait for real answer.
- **Planner can't build a complete DAG.** Don't guess an order. Defence: make the dependency statements explicit in GitHub issue text/relationships, then rerun.
- **Treating `blocked` as retryable without looking.** `blocked` means something actually wrong w/ work (failing loop, unresolved review finding) — re-running blindly repeats failure. Defence: read `blockerReason`, fix underlying issue or ask user, then resume.
- **Assuming DAG caught a real dependency.** Planner only reads *explicit* statements. Two issues that quietly touch the same function land in the same level, run in parallel, and surface as a merge conflict at Integrate — recoverable, but if you already know two tickets collide, run them in separate invocations.
- **Reading `merge-conflict` as "work lost".** Commit still exists on `resolve-tickets/issue-<n>`, worktree still there, issue still open. Defence: resolve by hand, merge, close — or fix and rerun.
- **Forgetting issues close against whatever branch is current.** No PR — if current branch isn't default, closed issues reference a commit not on default until user merges it. Expected, not a bug.
- **Losing `runId`.** Without it, resuming after `needs-input` re-runs every step from scratch instead of hitting cache. Defence: hold onto `Workflow` result's `runId` until batch fully closes.

## Composes with

- `sgche:marc-andreessen-persona` already wired into review step by workflow script — no need add again when invoking this skill.
