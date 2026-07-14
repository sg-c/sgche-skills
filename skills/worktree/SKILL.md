---
name: worktree
description: Run the current task in a dedicated git worktree, reusing or creating the branch’s worktree and recording it in a ledger for cross-session resume.
disable-model-invocation: true
---

# Worktree

Run the accompanying work inside a dedicated **git worktree** so it never touches whatever branch is currently checked out. Reuse before creating; leave a ledger so the next session resumes in the right place.

Uses plain `git worktree`, not the harness's ephemeral worktrees — the point is persistent, cross-session state.

Assumes a git repo. If `git rev-parse --git-dir` fails, say so and stop.

## 1. Name the branch

If the task provides neither an issue nor a clear topic, ask before proceeding. Keep slugs slash-free.

Derive from the issue or task:

- Issue `#42` → `issue-42-<slug>` (slug from issue title).
- Feature/topic → `<slug>` of the topic.

## 2. Reuse or create

Check the ledger (§3) **and** `git worktree list --porcelain`. Reconcile before deciding:

- If a worktree for this branch exists on disk, `cd` into it. If the ledger has no row for it, add one.
- If the ledger has a row but the path no longer exists, remove the stale row and recreate the worktree.
- After reconciliation, the ledger is the source of truth.

Never create a duplicate.

If no worktree exists, add one at:

```
.claude/worktrees/<branch>
```

```bash
# new branch
git worktree add .claude/worktrees/<branch> -b <branch>
# existing branch
git worktree add .claude/worktrees/<branch> <branch>
```

Then `cd` into it and append a ledger row.

**Completion:** you are inside the worktree directory and the ledger contains an up-to-date row for this branch with `Status: active`.

## 3. Ledger

Keep one tracked file at `docs/worktrees.md`, creating `docs/` if it does not exist. One row per worktree:

| Branch | Path | Issue | Purpose | Created | Status |
|--------|------|-------|---------|---------|--------|

Valid status values:

- `active` — worktree exists and is in use.
- `merged` — work removed and branch merged; worktree removed.
- `removed` — worktree removed without merge (abandoned or superseded).

Rules:

- Add a row on creation with `Status: active`.
- When done, run `git worktree remove <path>` and set **Status** to `merged` or `removed`.
- If a row's path no longer exists, treat it as stale, remove the row, and recreate the worktree.

## Composes with

Drop it in front of any skill that operates on "the current branch":

- `sgche:worktree` + `/implement #42`
- `sgche:worktree` + `/implement #42` + `sgche:close-issue`
- `sgche:worktree` + `/refactor plan`
- `sgche:worktree` + any research/review/build skill
