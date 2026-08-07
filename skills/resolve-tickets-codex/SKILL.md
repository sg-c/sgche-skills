---
name: resolve-tickets-codex
description: "Batch-close one GitHub parent issue and its linked sub-issues: use required parent target worktree for integration and dedicated child worktrees for parallel implementation. Require a parent plan, native parent-child links, and target worktree before changes; then use TDD, review, commits, comments, and closure. Explicit user invocation only: creates commits, GitHub comments, and closes issues."
---

# Resolve Tickets — Codex

Run only when user explicitly invokes `$resolve-tickets-codex`. Workflow changes code, commits, GitHub state. Use user-supplied target worktree only for integration and whole-plan work; use dedicated child worktrees only for child implementation.

Input: one open `parentIssue` number and absolute `targetWorktree` path. No issue list. Root owns GitHub writes, target branch integration, final result. Child prompts include parent issue, sub-issue number, plan, and absolute child-worktree path.

## Hard preflight gates

Run every check before creating worktree files, editing code, committing, commenting, closing issues, or spawning implementation agents. Any failed gate stops workflow immediately with exact failed check. Do not fall back, infer missing data, or ask later.

From `targetWorktree`:

1. Verify path is absolute, exists, is a Git worktree registered by `git worktree list --porcelain`, belongs to intended repository, and is not main/root checkout. Verify branch and `git status --short`; dirty target worktree fails. Capture target branch and `baseSha=$(git rev-parse HEAD)`.
2. Verify `gh auth status`; fetch parent issue body, comments, state, and native sub-issue links. Parent must be open and reachable.
3. Find implementation plan. Accept either actionable, non-empty implementation steps in parent body, or a local plan file explicitly referenced in parent body. For file plan: resolve path relative to repository root; file must exist, stay inside repository, and contain actionable, non-empty steps. Record plan source and exact plan text. A bare link, an issue comment, or an unreferenced local file fails.
4. Fetch every child from native parent-child links. Require at least one child. Each child must report this parent as its native parent; prose references, task lists, labels, or issue links do not count. Fail when relation missing, child inaccessible, or duplicated. Record already-closed children without editing them.
5. Build dependency DAG only from explicit `blocked by`, `depends on`, `requires`, `after`, reverse `blocks`, and native parent-child links among children. Record external blockers. Fail on cycles, omitted referenced in-batch child, or open external blocker.

Report `baseSha`, target branch/worktree, plan source, child numbers, and dependency levels. Only then start work.

## Child worktrees and implementation

`targetWorktree` is parent integration worktree. Never edit implementation code there until whole-plan repair. For each runnable child, root creates or reuses `<repoRoot>/.claude/worktrees/parent-<parentIssue>/issue-<childIssue>` on `resolve-tickets-codex/parent-<parentIssue>/issue-<childIssue>`. Create branch from target HEAD immediately before its dependency level. Reuse only clean child worktree whose branch is ahead of target; never overwrite dirty worktree.

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
