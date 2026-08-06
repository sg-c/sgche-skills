---
name: resolve-tickets-codex
description: "Batch-close GitHub issues in Codex: dependency-aware worktrees, mandatory TDD, review, conventional commits, serialized merges, comments, and closure. Use only when the user explicitly invokes $resolve-tickets-codex or requests end-to-end resolution of a batch/list of GitHub issues; it creates worktrees, commits, merges, comments, and closes issues."
---

# Resolve Tickets — Codex

Run only on explicit user request. This workflow creates worktrees, commits, merges, GitHub comments, and closes issues. Do not use Claude `Workflow`, `agent()`, or `parallel()` APIs.

Root agent orchestrates and owns integration and all GitHub state changes. Use Codex collaboration tools directly: `spawn_agent` for bounded independent work, `followup_task` for idle implementation agents, and `send_message` only for non-blocking status or clarification.

Every child prompt includes absolute worktree path, issue number, and relevant prior report. Every implementation prompt explicitly invokes `$mattpocock-skills:tdd` and requires compliance throughout; an orchestrator-level TDD reference is insufficient. Review invokes `$mattpocock-skills:code-review`, composed with `$sgche:marc-andreessen-persona`; never replace either skill with an ad hoc equivalent.

## Preflight

Require absolute `repoPath` and non-empty issue list. Accept `42,43`, `42-44`, `42~44`, and `#42~#44`. Before changes, from `repoPath`:

1. Confirm branch, worktree, and `git status --short`; never assume default branch.
2. Verify `gh` auth and every requested issue is reachable.
3. Read bodies, comments, states, and native parent/sub-issue links; batch independent `gh` reads where practical.
4. Build a DAG only from explicit `blocked by`, `depends on`, `requires`, `after`, reverse `blocks`, and parent/sub-issue links. Record in-batch prerequisites and open external blockers. Fail on omitted nodes or cycles; never infer dependencies from order or file overlap.

Report dependency levels and external blockers before worktrees. Skip closed issues. Blocked or failed tickets block descendants; unrelated tickets continue.

## Per-level workflow

Run a level only after all prerequisites merge. Worktrees isolate concurrent changes.

1. Root creates or reuses `<repoPath>/.claude/worktrees/issue-<n>` on `resolve-tickets-codex/issue-<n>` for each runnable issue. Branch from target HEAD immediately before level. Reuse only clean worktrees whose branch is ahead; never overwrite dirty work. `.claude/worktrees` is workflow state, not issue code.
2. Spawn at most available slots minus root. One issue and worktree per implementation agent. Prompt must state: “Invoke and follow `$mattpocock-skills:tdd` before editing. Use red-green vertical slices: one confirmed public seam and one failing test before each minimal implementation.” Start another agent only when a slot is free.
3. Agent first runs `gh issue view <n> --json state -q .state` from `repoPath`. If closed, return `skipped-already-closed` and make no worktree changes. Otherwise work only in assigned worktree. Invoke TDD before editing; read issue and code; confirm public seams against acceptance criteria, or return `needs-input` before editing. For every slice, run one failing behavior-level test, then add only code needed to pass it. Run focused tests and applicable `ruff`/`ty`; leave one cohesive uncommitted diff. Tests are fast, isolated, repeatable, self-validating, timely, and release resources. Python uses 3.10+ native types. Return `implemented`, `already-committed`, `needs-input`, or `blocked`, plus `codeFilesTouched`, summary, changed files, validation, `tddEvidence` (confirmed seams; red and green command/result for every slice), commit SHA when present, and exact blocker/question. Missing TDD evidence is incomplete: no review or commit.
4. If `codeFilesTouched`, spawn fresh review agent with issue, worktree, acceptance criteria, and implementation report. It invokes required review/persona skills on unstaged diff and reports only documented-standard or spec defects. It never edits, commits, merges, or closes issues. Skip when no code files changed. Hard defects: `followup_task` idle implementation agent for targeted fix and revalidation. Ignore subjective nits.
5. After passing review, `followup_task` idle implementation agent to commit only assigned diff. Require one conventional commit and issue number, commit SHA, changed files, validation, and blocker report. Implementation/review agents never touch root checkout, another worktree, GitHub comments/state, or other branches.

Use focused batched reads and cohesive patches. Do not repeat successful commands or run full suite for narrow change. Before diagnosing unrelated failure, temporarily stash tracked and untracked local changes, rerun affected test cleanly, then restore them.

## Integration and recovery

After every runnable ticket in a level has a validated commit, root integrates serially from `repoPath` on selected target branch:

1. `git merge --no-edit` each issue branch in issue-number order.
2. Conflict: abort merge, then `followup_task` issue implementation agent. In assigned worktree, it updates issue branch with current target, resolves only resulting conflicts, runs affected validation, and creates conventional resolution commit. It reports SHA, resolved files, and validation; root retries merge. Non-code blocker becomes `merge-conflict-blocked`; preserve branch/worktree and continue remaining entries. Never force-remove worktree/branch or ask user to resolve code conflict.
3. Successful merge: confirm issue remains open, comment `Resolved by <sha>. <summary>.`, then `gh issue close <n> --reason completed`.
4. Only after merge and close, normally remove worktree and delete branch. Preserve failed integration artifacts.

Design decision requiring user choice: agent stops before editing and returns exact question. Relay verbatim; do not guess; block dependents. After answer, reuse worktree/branch, re-check issue state and existing commit, then resume.

## Result and reruns

Return exactly `{ closed, levels, pendingQuestions, unresolved, results }`.

- `closed`: issue numbers closed after merge.
- `levels`: computed dependency levels, each an issue-number array.
- `pendingQuestions`: `{ issueNumber, question }`, relayed verbatim.
- `unresolved`: every requested issue not closed.
- `results`: planning, implementation, review, fix, commit, integration, skip, SHA, validation, blocker, and preserved-worktree records.

On interruption, rerun same request. Check state first: closed returns `skipped-already-closed`. Reuse existing worktrees. Clean worktree whose branch is ahead returns `already-committed` then integrates. Preserve blocked and `merge-conflict-blocked` worktrees. Do not push or open PR unless user explicitly asks.

Never guess at `needs-input`, retry `blocked` without resolving reported cause, or treat DAG as proof of no unrecorded code overlap. Preserve merge-conflict branch/worktree until implementation agent resolves, validates, and commits; preserve `merge-conflict-blocked` artifacts for a later explicit run.
