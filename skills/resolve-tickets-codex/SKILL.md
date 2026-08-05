---
name: resolve-tickets-codex
description: "Batch-close GitHub issues through Codex's native collaboration workflow: dependency-aware parallel worktrees, focused TDD, review, conventional commits, serialized merges, GitHub comments, and issue closure. Use only when the user explicitly invokes $resolve-tickets-codex or asks to burn down a batch/list of GitHub issues end to end in Codex; it creates worktrees, commits, merges, comments, and closes issues."
---

# Resolve Tickets — Codex

Run this workflow only on the user's explicit request. It has side effects: creating worktrees, committing, merging, commenting on GitHub issues, and closing them. Do not use Claude's `Workflow` runtime or its `agent()`/`parallel()` APIs; they are unavailable in Codex.

Act as the orchestrator. Use Codex-native collaboration tools directly (never through `functions.exec`): `spawn_agent` for independent, bounded work, `followup_task` to continue an idle implementation agent after review, and `send_message` only for non-blocking clarification or status. Keep orchestration, integration, and all GitHub state changes in the root agent.

Every child prompt must include its absolute worktree path, issue number, and relevant prior report. Use `$mattpocock-skills:tdd` for implementation. Use `$mattpocock-skills:code-review` for review of an unstaged diff, composed with `$sgche:marc-andreessen-persona`; do not replace either with an ad hoc review.

## Inputs and preflight

Require an absolute `repoPath` and a non-empty issue list. Accept comma lists and inclusive ranges such as `42,43`, `42-44`, `42~44`, and `#42~#44`. Before changing anything, from `repoPath`:

1. Confirm the current branch, worktree, and `git status --short`; never assume the default branch.
2. Verify `gh` authentication and that every requested issue is reachable.
3. Read every issue body, comments, state, and native parent/sub-issue links. Batch independent `gh` reads in one CLI call where practical.
4. Build a DAG using only explicit `blocked by`, `depends on`, `requires`, `after`, reverse `blocks`, and parent/sub-issue relationships. Do not infer dependencies from issue order or overlapping files. Record in-batch prerequisites and open external blockers separately; fail fast on omitted nodes or cycles.

State the planned dependency levels and any external blockers before creating worktrees. Skip already closed issues. A blocked or failed ticket blocks all descendants; unrelated tickets may continue.

## Per-level workflow

Process a DAG level only after its prerequisite levels have merged successfully. Worktrees prevent concurrent agents from modifying the same checkout.

1. In the root agent, create or reuse one worktree per runnable issue at `<repoPath>/.claude/worktrees/issue-<n>` on `resolve-tickets-codex/issue-<n>`. Branch from the current target branch HEAD immediately before that level. Reuse a clean worktree whose branch is already ahead; do not overwrite dirty work. Treat the managed `.claude/worktrees` directory as workflow state, not issue code.
2. Spawn up to the available agent slots minus the root agent. Give each implementation agent exactly one issue and its absolute worktree path. Start another only when a slot is free.
3. Each implementation agent must first check `gh issue view <n> --json state -q .state` from `repoPath`; if closed, return `skipped-already-closed` and make no worktree changes. Otherwise it must work only in its assigned worktree, invoke `$mattpocock-skills:tdd`, read the issue and relevant code, use focused red-green TDD, run focused tests plus appropriate `ruff` and `ty` checks, and leave one cohesive uncommitted diff. Tests must be fast, isolated, repeatable, self-validating, timely, and release every acquired resource. Use modern Python 3.10+ native type syntax when Python changes are needed. Return `implemented`, `already-committed`, `needs-input`, or `blocked`, together with `codeFilesTouched`, summary, changed files, validation, commit SHA when present, and exact blocker/question when applicable.
4. When `codeFilesTouched` is true, spawn a fresh review agent with the issue, worktree, acceptance criteria, and implementation report. It must invoke `$mattpocock-skills:code-review` on the unstaged diff with `$sgche:marc-andreessen-persona`, and report only documented-standard or spec defects. It must not edit, commit, merge, or close issues. Skip review when no code files changed. If it finds hard defects, use `followup_task` on the now-idle implementation agent to make the targeted fix and revalidate. Do not fix subjective nits.
5. After review passes, use `followup_task` to ask the idle implementation agent to commit only its assigned diff. Require one conventional commit and a report containing issue number, commit SHA, changed files, validation run, and any blocker. Do not let implementation or review agents touch the root checkout, another worktree, GitHub comments, issue state, or branches outside their assignment.

Use focused, batched reads and cohesive patches. Do not repeat successful commands or run a full suite for a narrow change. Before diagnosing a seemingly unrelated failure, stash tracked and untracked local changes temporarily, rerun the affected test cleanly, then restore them.

## Integration and recovery

After every runnable ticket in a level has a validated commit, integrate serially in the root agent from `repoPath`, preserving the selected target branch:

1. Merge each issue branch with `git merge --no-edit` in deterministic issue-number order.
2. On a merge conflict, abort that merge, leave its branch and worktree intact, report `merge-conflict`, and continue the remaining entries. Never force-remove a worktree or branch.
3. For a successful merge, confirm the issue is still open, comment `Resolved by <sha>. <summary>.`, then close it with `gh issue close <n> --reason completed`.
4. Only after a successful merge and close, remove that worktree normally and delete its branch. Preserve failed integration artifacts for inspection.

If an agent needs a design decision that only the user can make, it must stop before editing and return the exact question. Relay it verbatim, do not guess, and keep dependents blocked. To resume, reuse the same worktree and branch after the user answers; re-check issue state and the existing commit before repeating work.

## Result contract and recovery

Return exactly `{ closed, levels, pendingQuestions, unresolved, results }`.

- `closed`: issue numbers closed after merge.
- `levels`: computed dependency levels, each an array of issue numbers.
- `pendingQuestions`: `{ issueNumber, question }` entries, with the question relayed verbatim.
- `unresolved`: every requested issue that did not close.
- `results`: per-step records, including planning, implementation, review, fix, commit, integration, skips, commit SHAs, validation, blockers, and preserved worktree paths.

On interruption, rerun the same request. Check issue state first; closed issues return `skipped-already-closed`. Reuse existing worktrees rather than recreating them. A clean issue worktree with commits ahead of the target branch returns `already-committed` and proceeds to integration. Leave blocked and merge-conflicted worktrees intact. Do not force-remove worktrees or branches. Do not push or open a pull request unless the user explicitly asks.

Do not guess at `needs-input`, retry a `blocked` step without addressing its reported cause, or assume the DAG detects unrecorded code overlap. A merge conflict preserves the issue branch and worktree; resolve it manually or in a later explicit run.
