---
name: prep-to-implement
description: "Prepare one approved local implementation plan for agent implementation: create its dedicated worktree and branch, then publish a GitHub parent issue with native child issues. Use only when the user explicitly invokes $prep-to-implement with a local plan path and optional `fine` granularity. Never self-activate: this workflow creates Git worktrees, branches, and GitHub issues."
---

# Prep To Implement

Run only on an explicit invocation in this exact form:

```text
$prep-to-implement <local-plan-path> [fine]
```

`local-plan-path` is required; `fine` is the only optional granularity argument. Do not infer either one. `local-plan-path` must resolve to a regular, non-empty local file. With no granularity argument, use the default `$mattpocock-skills:to-tickets` breakdown unchanged. On any invalid or missing plan path or unsupported granularity, stop before creating a worktree, branch, or GitHub issue.

This workflow creates Git and GitHub state. Never self-activate it.

## Preflight

Before any mutation:

1. Resolve the plan path to an absolute path. Require a regular, readable, non-empty file using metadata or byte count; do not read its contents yet.
2. Find the repository root with `git rev-parse --show-toplevel`. Require a normal Git worktree, a symbolic current branch, no merge/rebase/cherry-pick in progress, and working GitHub authentication via `gh auth status`.
3. Require the resolved plan path to be inside `repoRoot`. Record its repository-relative path as `planPath`; do not permit `..` traversal or a symlink escape. Require it to exist in `HEAD` and have no staged or unstaged changes relative to `HEAD`, so the target worktree and recorded base commit contain the approved plan.
4. Derive `plan-slug` from the plan filename: lowercase ASCII hyphen-case, omitting its extension. Require a non-empty slug.
5. Set `worktreeRoot` to `<repoRoot>/.claude/worktrees/implement-<plan-slug>`, `targetWorktree` to `<worktreeRoot>/target`, and `targetBranch` to exactly `implement/<plan-slug>`.
6. Fail if the target path already exists, the branch already exists, or `git worktree list --porcelain` already registers either path. Do not reuse an existing worktree or branch.
7. Determine the GitHub repository identity with `gh repo view --json nameWithOwner`. Stop if it cannot be resolved.

Do not require the source worktree to be clean: the new worktree is created from its current `HEAD`, not from uncommitted changes. Report that base SHA and source branch.

## Create implementation space first

Create exactly one worktree and branch before drafting or publishing tickets:

```bash
git -C "<repoRoot>" worktree add -b "implement/<plan-slug>" \
  "<repoRoot>/.claude/worktrees/implement-<plan-slug>/target" HEAD
```

Verify the registered worktree, branch, `HEAD`, and clean status. All later plan exploration and implementation belong in this target worktree. Never create another implementation worktree in this workflow.

If a later step fails, preserve this newly created implementation space and report its absolute path and branch. Do not silently delete it.

## Break down the plan

From `targetWorktree`, read the implementation plan, then invoke and follow `$mattpocock-skills:to-tickets` with its text. Treat GitHub as the configured tracker. Create no issues during drafting. Do not inspect repository source code, tests, configuration, or history: this workflow decomposes the plan only.

Use its tracer-bullet, dependency, and user-approval requirements. With no granularity argument, preserve its resulting breakdown; do not merge, reduce, or otherwise reinterpret its tracer-bullet slices. Show the proposed breakdown and wait for explicit approval before publishing.

For `fine`, audit every proposed ticket after `to-tickets` finishes. Split it repeatedly until every child is the smallest independently completable and verifiable agent task. A fine ticket has one narrow outcome, explicit acceptance criteria, and no unrelated concern. Do not split atomic changes whose correctness requires them together. Recheck all dependency edges after each split. This post-pass is required because large slices risk exceeding an implementation agent's context window.

Keep one root agent responsible for the worktree, final breakdown, approval, and every GitHub write. For a plan too large for one context, delegate only independent, read-only plan-section analysis and an optional fine-granularity audit. Give each delegate a bounded plan area and require candidate vertical slices and dependencies. Reconcile their findings in the root before presenting one coherent breakdown. Delegates never inspect source code or create worktrees, branches, issues, or approval prompts.

Every issue must include `Implementation plan: <planPath>`. Keep child descriptions concise: include only `What to build`, `Acceptance criteria`, the plan path, parent issue reference, and `Blocked by: <issue numbers|None>`. Child implementation agents may read the original plan.

## Publish GitHub issues

Only after approval, publish in this order:

1. Create one open parent issue titled `Implement: <plan-slug>`. Its description must record:
   - `Repository: <owner>/<repo>`
   - `Implementation plan: <planPath>`
   - `Target worktree: <absolute-target-worktree>`
   - `Target branch: implement/<plan-slug>`
   - `Base commit: <baseSha>`
   - the approved ticket summary.
2. Never embed or repeat the implementation plan's contents in an issue description.
3. Create every child issue after the parent, in dependency order. Use the concise child description above. Each child explicitly names and links its parent and uses exactly `Blocked by: #<issue>, ...` or `Blocked by: None`.
4. Attach each child to the parent using GitHub's native sub-issue relationship. For GitHub CLI environments without a dedicated sub-issue command, use the GitHub REST API through `gh api` rather than a task-list-only convention. Verify every child reports the parent through GitHub's native relationship.
5. Update the parent description with a linked child-issue list, each child's exact `Blocked by` value, and its native-parent relationship. Verify the parent and every child remain open and readable.

Do not apply labels, close issues, push, or create pull requests unless the user separately requests them.

## Rejection and recovery

If the user rejects or abandons the proposed breakdown, ask whether to delete the target worktree and branch. Delete them only after an explicit yes. First verify exact paths and branch; use `git worktree remove <targetWorktree>` and then `git branch -d implement/<plan-slug>`. If either operation cannot safely complete, stop and report why.

Return the parent number and URL, child numbers and URLs, dependency graph, target worktree, target branch, base SHA, and any unresolved question or failure. On interruption, preserve the implementation space and already-created issues; resume by inspecting actual Git and GitHub state, never by assuming a partial step succeeded.
