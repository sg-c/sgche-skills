---
name: resolve-tickets-codex
description: "Batch-close one GitHub parent issue and its linked sub-issues: use required parent target worktree for integration and dedicated child worktrees for parallel implementation. Require a parent plan, native parent-child links, and target worktree before changes; then use TDD, review, commits, comments, and closure. Explicit user invocation only: creates commits, GitHub comments, and closes issues."
---

# Resolve Tickets — Codex

Run only when user explicitly invokes `$resolve-tickets-codex`. Workflow changes code, commits, and GitHub state. Discover the target worktree from the parent issue. Use it only for integration and whole-plan repair; each child implementation uses its own worktree.

Input: exactly one open `parentIssue` number. Do not accept an issue list or worktree path. Root owns GitHub writes, target-branch integration, cleanup, and final result. Every child prompt includes the parent issue, child issue, relevant recorded plan section, child acceptance criteria, child start SHA, and absolute child-worktree path.

## Hard preflight gates

Run every check before creating worktrees, editing code, committing, commenting, closing issues, or spawning implementation agents. A failed gate stops immediately with its exact failed check. Do not infer missing data or substitute another batch.

1. From the invocation directory, require a Git worktree and determine its GitHub repository identity. Verify `gh auth status`; fetch the parent body, comments, state, native child links, and native blocking links from that repository. Parent must be open and reachable.
2. Require a parent metadata block created by `$prep-to-implement`: `Repository`, `Implementation plan`, `Target worktree`, `Target branch`, and `Base commit`. Reject missing, duplicated, malformed, or contradictory fields. `Repository` must match the invocation repository; `Implementation plan` must be repository-relative; `Target worktree` must be absolute; and `Base commit` must be a full commit SHA.
3. Set `targetWorktree`, `targetBranch`, `planPath`, `baseSha`, and repository identity from that metadata. Verify the path exists, is a Git worktree registered by `git worktree list --porcelain`, and is not its repository root checkout. Verify its symbolic branch exactly matches `targetBranch`; its `git status --porcelain=v1 -z --ignore-submodules=none` is empty, including untracked and submodule changes; and `baseSha` is an ancestor of its `HEAD`. Reject an active Git operation in that worktree before any mutation: detect rebase or `git am` from the existence of the Git-resolved `rebase-merge` or `rebase-apply` directory; detect merge, cherry-pick, and revert from `MERGE_HEAD`, `CHERRY_PICK_HEAD`, and `REVERT_HEAD`; and reject an existing Git-resolved `sequencer` directory. Do not infer an active rebase from `REBASE_HEAD`, which can be stale.
4. Derive `plan-slug` from `planPath`'s filename. Derive `repositoryWorktree` by removing `/.claude/worktrees/implement-<plan-slug>/target` from `targetWorktree`. Require the result to be an absolute, registered Git worktree path, and verify its GitHub repository identity matches the recorded repository. Require `targetWorktree` to equal `<repositoryWorktree>/.claude/worktrees/implement-<plan-slug>/target` and `targetBranch` to equal `implement/<plan-slug>`. This identifies the worktree from which `$prep-to-implement` created the batch and prevents a parent issue from selecting a different implementation batch.
5. Read the implementation plan from `<baseSha>:<planPath>`. The resolved path must stay inside the repository and file must contain actionable, non-empty steps. Record its exact text and title or slug. Only this Git object is authoritative: a plan body, issue comment, bare link, absolute path, or unreferenced local file fails.
6. Fetch every child from native parent-child links. Require at least one child. Each child must report this parent as its native parent; prose references, task lists, labels, or issue links do not count. Fail when relation missing, child inaccessible, or duplicated. Record already-closed children without editing them.
7. Build the dependency DAG only from each child's tracker-native blocking links, using relationships published and verified by `$mattpocock-skills:to-tickets`. Do not interpret textual dependency fields. Record external blockers. Fail when native blocking-link data is inaccessible or malformed, on cycles, when a linked in-batch child is omitted, or when an external blocker remains open.

Report `baseSha`, target branch/worktree, plan source, child numbers, and dependency levels. Only then start work.

## Child worktrees and implementation

`targetWorktree` is the parent integration worktree. Never edit child implementation code there. For each runnable child, root creates or reuses `<repositoryWorktree>/.claude/worktrees/implement-<plan-slug>/issue-<childIssue>` on `implement/<plan-slug>-issue-<childIssue>`. Immediately before a dependency level starts, create each level branch from current target `HEAD`; record that child start SHA. Reuse only a clean child worktree whose branch contains a child-only commit ahead of target. Never overwrite a dirty or ambiguous worktree.

Run a level only after every prerequisite has merged into target. Spawn no more than available slots minus root: one implementation agent and one child worktree per runnable child. Parallel agents never share a worktree. Root never edits child worktrees.

For each open child:

1. Agent re-checks child state from its child worktree; skip only if already closed before preflight. Read child requirements and relevant plan section, including its test surface. Derive a missing test surface from the acceptance criteria and relevant code. Return `needs-input` only when user-visible behavior remains ambiguous; block dependent children.
2. Invoke and follow `$mattpocock-skills:tdd` before editing. The plan's test surface is the confirmed public seam; settle any remaining technical detail from the codebase. Use red-green vertical slices: one confirmed seam, one failing behavior test, minimum passing code. Record seam and red/green command plus result for every slice.
3. Edit and validate only in child worktree. Run focused tests and applicable `ruff`/`ty`. Leave cohesive diff. Missing TDD evidence is incomplete.
4. Invoke `$mattpocock-skills:code-review` against changes since child start SHA, with child requirements as spec. Review must run before commit. Fix hard standards or spec defects through TDD in same child worktree; rerun affected validation and review. Subjective nits do not block.
5. Commit only child diff in child worktree: one conventional commit mentioning child issue. Confirm child worktree clean. Return commit SHA, validation, review, and TDD evidence. Implementation agents never merge, comment, close issues, or touch target worktree.

After every runnable child in level has a validated commit, root merges child branches serially by issue number in `targetWorktree`. Before each merge, verify target is clean and branch still points to the recorded child commit. On conflict, abort the merge and have that child agent update its branch from target, resolve only the conflict, validate, and commit; then retry. Preserve failed conflict artifacts. After a successful merge, root comments `Resolved by <sha>. <summary>.` and closes the child with `gh issue close <n> --reason completed`. Remove its clean merged worktree and branch only after closure.

Blocked, failed, or `needs-input` child blocks descendants; unrelated children continue. Never close a child without its validated commit and successful target merge, except a child verified closed before preflight. Never merge, commit child implementation, or perform normal code edits in target worktree.

## Whole-plan review and repair

After every child is closed, keep target worktree on target branch. Invoke `$mattpocock-skills:code-review` for `git diff <baseSha>...HEAD`, using full recorded parent plan as spec. This covers the complete plan; child reviews do not replace it.

If review reports hard standards or spec defects, invoke and follow `$mattpocock-skills:tdd` in `targetWorktree` to fix them. Derive the public seam from the parent plan and changed code; use red-green slices, focused validation, and conventional repair commits. Rerun whole-plan review against same `baseSha` until hard defects are zero. A finding requiring a product choice returns `needs-input`; do not close parent.

After whole-plan review passes, perform delivery cleanup before closing the parent or returning success:

1. Verify every native child is closed, the target worktree has no active Git operation, its `git status --porcelain=v1 -z --ignore-submodules=none` is empty, and the parent remains open. Locate the registered worktree checked out on `main`; require it to be distinct from `targetWorktree`, have no active Git operation, and return an empty `git status --porcelain=v1 -z --ignore-submodules=none`.
2. Fast-forward merge `targetBranch` into `main` from that main worktree with `git merge --ff-only <targetBranch>`. Record the resulting main SHA and verify it contains target `HEAD`. Do not push unless the user explicitly asks. If `main` is dirty, unavailable, or cannot fast-forward, stop with the exact blocker; leave parent open and preserve target worktree and branch.
3. Remove the clean target worktree with `git worktree remove <targetWorktree>`, then delete the merged target branch with `git branch -d <targetBranch>`. Confirm both are absent from `git worktree list --porcelain` and `git branch`. If either cleanup action fails, stop with the exact blocker; leave the parent open.
4. Comment on the parent with the child commits, whole-plan review result, final validation, and resulting main SHA; then close it with `gh issue close <parentIssue> --reason completed`.

## Recovery and result

On interruption, rerun the same parent issue. Re-run hard preflight gates and reconstruct state from Git and GitHub; never trust stale agent output. Preserve target worktree, child worktrees, and commits until delivery cleanup completes. Reuse only clean, unambiguous child worktrees. Never force-reset, stash, push, or open a PR unless user explicitly asks.

## Final report

Return a concise Markdown report, never a raw JSON object. Return a success report only after delivery cleanup completes. Keep detailed per-slice TDD, review, validation, and blocker records in working evidence; summarize them in the report unless the user asks for detail.

Use this shape, omitting rows that do not apply:

```markdown
## Resolved #<parentIssue> — <plan title or slug>

Completed and closed: #<child>, …, and parent #<parentIssue>.

| Dependency flow — completed issues | Issues |
|---|---|
| Level 1 | #<issue> (`<short SHA>`), … |
| Level 2 | #<issue> (`<short SHA>`), … |

| Verification | Result |
|---|---|
| TDD | <concise evidence summary> |
| Child reviews | <result> |
| Whole-plan review | <result> |
| Validation | <commands and concise results> |

| Delivery cleanup | Result |
|---|---|
| Integrated | `<targetBranch>` → `main` at `<short main SHA>` |
| Removed | Target worktree and implementation branch removed |
| GitHub closure | All child issues and parent issue closed |

No pending questions or unresolved issues.
```

For an incomplete run, return `## Blocked #<parentIssue>` followed by exact failed gate or blocker, closed and unresolved issue numbers, pending questions verbatim, and safe next action. Never describe delivery cleanup as complete until merge, worktree removal, and branch deletion are each verified.
