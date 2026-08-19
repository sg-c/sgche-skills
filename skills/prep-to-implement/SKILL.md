---
name: prep-to-implement
description: "Prepare a local implementation plan for agent implementation: create its dedicated worktree and branch, compare several ticket breakdowns, recommend one, then publish approved GitHub parent and native child issues. Use only when the user explicitly invokes $prep-to-implement with a local plan path and optional `fine` granularity. Never self-activate: this workflow creates Git worktrees, branches, and GitHub issues."
---

# Prep To Implement

Run only when explicitly invoked:

```text
$prep-to-implement <local-plan-path> [fine]
```

`local-plan-path` is required; `fine` is the only option. Resolve it to a regular, readable, non-empty file. Otherwise stop before any Git or GitHub write. This workflow creates worktrees, branches, and issues; never self-activate.

## Preflight

Before mutation:

1. Find `repoRoot` with `git rev-parse --show-toplevel`. Require a normal worktree, symbolic branch, and empty `git status --porcelain=v1 -z --ignore-submodules=none`.
2. Reject active rebase, `git am`, merge, cherry-pick, revert, or sequencer state. Use Git-resolved `rebase-merge`, `rebase-apply`, `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, and `sequencer`; do not gate on stale `REBASE_HEAD`.
3. Require working `gh auth status`. Require plan inside `repoRoot`, with no symlink escape or `..` traversal, present and unchanged in `HEAD`. Record its repo-relative `planPath`.
4. Derive non-empty lowercase ASCII hyphen-case `plan-slug` from plan filename. Set `targetBranch` to `implement/<plan-slug>` and `targetWorktree` to `<repoRoot>/.claude/worktrees/implement-<plan-slug>/target`.
5. Reject an existing target path, branch, or registered worktree. Resolve `<owner>/<repo>` with `gh repo view --json nameWithOwner`.

Report source branch and base SHA. Target always starts at this clean `HEAD`.

## Create target worktree

Create exactly one target before drafting or publishing:

```bash
git -C "<repoRoot>" worktree add -b "implement/<plan-slug>" \
  "<repoRoot>/.claude/worktrees/implement-<plan-slug>/target" HEAD
```

Verify registered path, symbolic branch, exact `HEAD`, clean status, and no active operation. All later work uses this target. On later failure, preserve it and report its path and branch.

## Propose breakdowns

Read plan in target; invoke `$mattpocock-skills:to-tickets` with plan text and GitHub tracker. Do not inspect source, tests, configuration, or history, and create no issues while drafting.

Produce 2–4 material alternatives, differing in slices, sequence, or dependency boundaries. Each follows `to-tickets` tracer-bullet, dependency, and approval rules. Default granularity preserves its slices. For `fine`, split each ticket until it is smallest independent, verifiable task; keep atomic changes together and recheck dependencies.

Show each candidate’s tickets, graph, sequence, benefits, and tradeoffs. Compare plan fidelity, verifiable progress, dependency complexity, and agent-context fit. Recommend one, then wait for explicit approval. Publish only approved candidate; user may instead approve another candidate.

One root agent owns worktree, synthesis, approval, and GitHub writes. For oversized plans, delegates may only analyze bounded plan sections read-only; root reconciles their slices and dependencies.

## Publish and verify

After approval, create relationship ledger before any issue: stable key per child, expected parent, and directed blocking edges. Ledger is source of truth; issue prose, task lists, and visual page never substitute for native links.

1. Create open parent `Implement: <plan-slug>` with `umbrella` label. Description records repository, `planPath`, absolute target worktree, target branch, base SHA, and approved ticket summary; never embed plan contents.
2. Create children under `to-tickets` rules for content, labels, and acceptance criteria. Record each issue number, URL, and node ID in ledger.
3. Relationship gate, before parent update or success:
   - Create every native parent–child edge. Use `gh api` REST when CLI lacks sub-issue command.
   - Create every native blocking edge. Never use “blocked by” prose as substitute.
   - Read GitHub state for every child; compare actual parents and blockers with ledger. Command success alone is insufficient.
   - Retry only missing edges, then read again. Never recreate issues or alter approved graph during repair.
   - If any edge remains unverified, stop and report failure. Do not update parent description, claim success, or start implementation.
4. After gate passes, update parent with linked children and native-parent relationships. Verify `umbrella` label; parent and children remain open and readable.

Do not close issues, push, or create PRs unless separately requested.

## Recovery and handoff

If breakdown rejected or abandoned, ask whether to delete target worktree and branch. Delete only after yes, verifying exact paths first: `git worktree remove <targetWorktree>`, then `git branch -d <targetBranch>`.

Return parent and child numbers/URLs, verified relationship ledger, dependency graph, target worktree/branch, base SHA, and unresolved failure or question. On interruption, preserve worktree and issues; resume from actual Git and GitHub state against ledger.
