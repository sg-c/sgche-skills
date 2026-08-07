---
name: resolve-tickets-codex
description: "Batch-close one GitHub parent issue and its linked sub-issues: use required parent target worktree for integration and dedicated child worktrees for parallel implementation. Require a parent plan, native parent-child links, and target worktree before changes; then use TDD, review, commits, comments, and closure. Explicit user invocation only: creates commits, GitHub comments, and closes issues."
---

# Resolve Tickets — Codex

Run only when user explicitly invokes `$resolve-tickets-codex`. Workflow changes code, commits, GitHub state. Discover the target worktree from the parent issue; use it only for integration and whole-plan work, and use dedicated child worktrees only for child implementation.

Input: one open `parentIssue` number. No issue list or worktree path. Root owns GitHub writes, target branch integration, final result. Child prompts include parent issue, sub-issue number, plan, and absolute child-worktree path.

## Hard preflight gates

Run every check before creating worktree files, editing code, committing, commenting, closing issues, or spawning implementation agents. Any failed gate stops workflow immediately with exact failed check. Do not fall back, infer missing data, or ask later.

1. From the invocation directory, require a Git worktree and determine its GitHub repository identity. Verify `gh auth status`; fetch the parent issue body, comments, state, and native sub-issue links from that repository. Parent must be open and reachable.
2. Require a parent metadata block created by `$prep-to-implement`: `Repository`, `Implementation plan`, `Target worktree`, `Target branch`, and `Base commit`. Reject missing, duplicated, malformed, or contradictory fields. `Repository` must match the invocation repository; `Implementation plan` must be repository-relative; `Target worktree` must be absolute; and `Base commit` must be a full commit SHA.
3. Set `targetWorktree`, `targetBranch`, `planPath`, `baseSha`, and repository identity from that metadata. Verify the path exists, is a Git worktree registered by `git worktree list --porcelain`, and is not its repository root checkout. Verify its branch exactly matches `targetBranch`, it is clean, and `baseSha` is an ancestor of its `HEAD`.
4. Derive `plan-slug` from `planPath`'s filename. Derive `repositoryWorktree` by removing `/.claude/worktrees/implement-<plan-slug>/target` from `targetWorktree`. Require the result to be an absolute, registered Git worktree path, and verify its GitHub repository identity matches the recorded repository. Require `targetWorktree` to equal `<repositoryWorktree>/.claude/worktrees/implement-<plan-slug>/target` and `targetBranch` to equal `implement/<plan-slug>`. This identifies the worktree from which `$prep-to-implement` created the batch and prevents a parent issue from selecting a different implementation batch.
5. Read the implementation plan from `<baseSha>:<planPath>`. The path must stay inside the repository after resolution and the file must contain actionable, non-empty steps. Record the exact plan text. A plan body, issue comment, bare link, absolute path, or unreferenced local file fails.
6. Fetch every child from native parent-child links. Require at least one child. Each child must report this parent as its native parent; prose references, task lists, labels, or issue links do not count. Fail when relation missing, child inaccessible, or duplicated. Record already-closed children without editing them.
7. Build the dependency DAG only from each child's exact `Blocked by: #<issue>, ...` or `Blocked by: None` field. Record external blockers. Fail on malformed or missing fields, cycles, omitted referenced in-batch child, or an open external blocker.

Report `baseSha`, target branch/worktree, plan source, child numbers, and dependency levels. Only then start work.

## Child worktrees and implementation

`targetWorktree` is parent integration worktree. Never edit implementation code there until whole-plan repair. For each runnable child, root creates or reuses `<repositoryWorktree>/.claude/worktrees/implement-<plan-slug>/issue-<childIssue>` on `implement/<plan-slug>-issue-<childIssue>`. Create branch from target HEAD immediately before its dependency level. Reuse only clean child worktree whose branch is ahead of target; never overwrite dirty worktree.

Run a level only after prerequisites merge into target. Spawn at most available slots minus root: one implementation agent and one child worktree per runnable child. Parallel agents never share a worktree. Root never edits child worktrees.

For each open child:

1. Agent re-checks child state from its child worktree; skip only if already closed before preflight. Read child requirements and relevant plan section. If child has design question, return `needs-input` before editing; block dependent children.
2. Invoke and follow `$mattpocock-skills:tdd` before editing. Confirm public test seams against child acceptance criteria. If seams need user confirmation, return `needs-input` before writing tests. Use red-green vertical slices: one confirmed seam, one failing behavior test, minimal passing code. Record seam plus red/green command and result for every slice.
3. Edit and validate only in child worktree. Run focused tests and applicable `ruff`/`ty`. Leave cohesive diff. Missing TDD evidence is incomplete.
4. Invoke `$mattpocock-skills:code-review` against changes since child start SHA, with child requirements as spec. Review must run before commit. Fix hard standards or spec defects through TDD in same child worktree; rerun affected validation and review. Subjective nits do not block.
5. Commit only child diff in child worktree: one conventional commit mentioning child issue. Confirm child worktree clean. Return commit SHA, validation, review, and TDD evidence. Implementation agents never merge, comment, close issues, or touch target worktree.

After every runnable child in level has validated commit, root merges child branches serially by issue number in `targetWorktree`. On conflict, abort merge and have that child agent update its child branch from target, resolve only conflict, validate, and commit; retry merge. Preserve failed conflict artifacts. After successful merge, root comments `Resolved by <sha>. <summary>.` and closes child with `gh issue close <n> --reason completed`. Remove clean merged child worktrees and branches only after close.

Blocked, failed, or `needs-input` child blocks descendants. Unrelated children continue. Never close child without validated commit and successful target merge, except child verified closed before preflight. Never merge, commit child implementation, or perform normal code edits in target worktree.

## Whole-plan review and repair

After every child is closed, keep target worktree checked out on target branch. Invoke `$mattpocock-skills:code-review` for `git diff <baseSha>...HEAD`, using full recorded parent plan as spec. This review covers all target-worktree code changes for entire plan, not child reviews alone.

If review reports hard standards or spec defects, invoke and follow `$mattpocock-skills:tdd` in `targetWorktree` to fix them. Confirm seams against parent plan before test work; use red-green slices, focused validation, and conventional repair commits. Rerun whole-plan review against same `baseSha`. Repeat until hard defects are zero. A review finding requiring product/design choice returns `needs-input`; do not close parent.

Only after whole-plan review passes, verify all native children closed, target worktree clean, and parent still open. Comment on parent with child commit SHAs, whole-plan review result, and final validation; then close parent with `gh issue close <parentIssue> --reason completed`.

## Recovery and result

On interruption, rerun same parent issue and target worktree. Re-run hard preflight gates. Preserve target worktree, child worktrees, and commits. Reuse clean child worktrees whose branch is ahead. Never force-reset, stash, push, or open PR unless user explicitly asks.

Return exactly `{ parentIssue, targetWorktree, baseSha, planSource, levels, closed, pendingQuestions, unresolved, results }`.

- `closed`: closed child numbers, then parent number only after whole-plan pass.
- `pendingQuestions`: `{ issueNumber, question }` relayed verbatim.
- `unresolved`: parent or child numbers not closed.
- `results`: gate evidence, implementation, TDD evidence, review, fixes, commits, validation, comments, closure, and blocker records.
