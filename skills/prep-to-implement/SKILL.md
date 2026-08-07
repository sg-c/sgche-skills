---
name: prep-to-implement
description: "Prepare one approved local implementation plan for agent implementation: create its dedicated worktree and branch, then publish a GitHub parent issue with native child issues. Use only when the user explicitly invokes $prep-to-implement with a local plan path and `fine` or `coarse` sub-ticket granularity. Never self-activate: this workflow creates Git worktrees, branches, and GitHub issues."
---

# Prep To Implement

Run only on an explicit invocation in this exact form:

```text
$prep-to-implement <local-plan-path> <fine|coarse>
```

Both arguments are required. Do not infer either one. `local-plan-path` must resolve to a regular, non-empty local file. `fine` and `coarse` are the only accepted values. On any invalid or missing input, stop before creating a worktree, branch, or GitHub issue.

This workflow creates Git and GitHub state. Never self-activate it.

## Preflight

Before any mutation:

1. Resolve the plan path to an absolute path. Require a regular, readable, non-empty file using metadata or byte count; do not read its contents yet.
2. Find the repository root with `git rev-parse --show-toplevel`. Require a normal Git worktree, a symbolic current branch, no merge/rebase/cherry-pick in progress, and working GitHub authentication via `gh auth status`.
3. Derive `plan-slug` from the plan filename: lowercase ASCII hyphen-case, omitting its extension. Require a non-empty slug.
4. Set `targetWorktree` to `<repoRoot>/.claude/worktrees/<plan-slug>` and `targetBranch` to exactly `<plan-slug>`.
5. Fail if the target path already exists, the branch already exists, or `git worktree list --porcelain` already registers either path. Do not reuse an existing worktree or branch.
6. Determine the GitHub repository identity with `gh repo view --json nameWithOwner`. Stop if it cannot be resolved.

Do not require the source worktree to be clean: the new worktree is created from its current `HEAD`, not from uncommitted changes. Report that base SHA and source branch.

## Create implementation space first

Create exactly one worktree and branch before drafting or publishing tickets:

```bash
git -C "<repoRoot>" worktree add -b "<plan-slug>" \
  "<repoRoot>/.claude/worktrees/<plan-slug>" HEAD
```

Verify the registered worktree, branch, `HEAD`, and clean status. All later plan exploration and implementation belong in this target worktree. Never create another implementation worktree in this workflow.

If a later step fails, preserve this newly created implementation space and report its absolute path and branch. Do not silently delete it.

## Break down the plan

From `targetWorktree`, read the implementation plan, then invoke and follow `$mattpocock-skills:to-tickets` with its text. Treat GitHub as the configured tracker. Create no issues during drafting. Do not inspect repository source code, tests, configuration, or history: this workflow decomposes the plan only.

Use its tracer-bullet, dependency, and user-approval requirements. Show the proposed breakdown and wait for explicit approval before publishing.

For `coarse`, use the resulting breakdown without forced extra splitting.

For `fine`, audit every proposed ticket after `to-tickets` finishes. Split it repeatedly until every child is the smallest independently completable and verifiable agent task. A fine ticket has one narrow outcome, explicit acceptance criteria, and no unrelated concern. Do not split atomic changes whose correctness requires them together. Recheck all dependency edges after each split. This override is required because large slices risk exceeding an implementation agent's context window.

Keep one root agent responsible for the worktree, final breakdown, approval, and every GitHub write. For a plan too large for one context, delegate only independent, read-only plan-section analysis and an optional fine-granularity audit. Give each delegate a bounded plan area and require candidate vertical slices and dependencies. Reconcile their findings in the root before presenting one coherent breakdown. Delegates never inspect source code or create worktrees, branches, issues, or approval prompts.

Every issue must include `Implementation plan: <absolute-plan-path>`. Keep child descriptions concise: include only `What to build`, `Acceptance criteria`, the plan path, parent issue reference, and blockers. Child implementation agents may read the original plan.

## Publish GitHub issues

Only after approval, publish in this order:

1. Create one open parent issue titled `Implement: <plan-slug>`. Its description must record:
   - `Implementation plan: <absolute-plan-path>`
   - `Target worktree: <absolute-target-worktree>`
   - `Target branch: <plan-slug>`
   - Base commit SHA and the approved ticket summary.
2. Never embed or repeat the implementation plan's contents in an issue description.
3. Create every child issue after the parent, in dependency order. Use the concise child description above. Each child explicitly names and links its parent and lists all blockers by issue number and URL, or states `None — can start immediately`.
4. Attach each child to the parent using GitHub's native sub-issue relationship. For GitHub CLI environments without a dedicated sub-issue command, use the GitHub REST API through `gh api` rather than a task-list-only convention. Verify every child reports the parent through GitHub's native relationship.
5. Update the parent description with a linked child-issue list, each child's blockers, and its native-parent relationship. Verify the parent and every child remain open and readable.

Do not apply labels, close issues, push, or create pull requests unless the user separately requests them.

## Rejection and recovery

If the user rejects or abandons the proposed breakdown, ask whether to delete the target worktree and branch. Delete them only after an explicit yes. First verify exact paths and branch; use `git worktree remove <targetWorktree>` and then `git branch -d <plan-slug>`. If either operation cannot safely complete, stop and report why.

Return the parent number and URL, child numbers and URLs, dependency graph, target worktree, target branch, base SHA, and any unresolved question or failure. On interruption, preserve the implementation space and already-created issues; resume by inspecting actual Git and GitHub state, never by assuming a partial step succeeded.
