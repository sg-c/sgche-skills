---
name: resolve-tickets-optim
description: Batch-close GitHub issues with dependency-aware parallel worktrees while minimizing agent and tool round trips. Use only when the user explicitly invokes /sgche:resolve-tickets-optim or asks to burn down a batch/list of GitHub issues end to end and prioritizes fast execution; it creates worktrees, commits, merges, comments on, and closes issues.
---

# resolve-tickets-optim

Run `scripts/workflow.js` through `Workflow`.

Do not invoke automatically. This workflow has side effects: worktrees, commits, merges, GitHub comments, and issue closures.

## Shape

1. Plan explicit GitHub issue dependencies into DAG levels. Independent issues run in parallel.
2. Per issue: optimized TDD in an isolated worktree, optional standards/spec review, targeted fix, conventional commit.
3. Per DAG level: serialize merge, GitHub comment/close, and worktree cleanup.

Every step runs in a fresh agent. Pass paths and prior reports explicitly; never rely on inherited shell state.

## Optimized TDD contract

The TDD agent must retain red-green discipline while treating each tool invocation as expensive:

- Perform closed-issue check first and alone. After it is open, combine worktree creation/reuse, branch-commit, and status checks into one shell invocation.
- Read the issue then map implementation, declarations, fakes, and target tests with a small number of batched contextual reads. Use `rg -n -C` or bounded file slices; do not serially read files or re-read a successful edit.
- Use cohesive patches. Add one complete test slice per edit and implement one complete source slice per edit; avoid import-only, append-only, or corrective micro-edits.
- Run focused red, then focused green. Combine already-agreed seams into the same test file/change when they exercise the same public path. Do not rerun a test only to prove an unchanged consequence.
- Use test doubles with fixture/monkeypatch cleanup. Never persist global registry, environment, or subscription state across tests.
- Run independent lint/type checks concurrently, or collect both failures in one command. Do not short-circuit type checking behind lint with `&&`.
- For narrow changes, finish with touched tests plus direct consumers/importers. Reserve full suite for wide public/shared changes.

## Invocation

```
Workflow({
  scriptPath: "<this skill's directory>/scripts/workflow.js",
  args: {
    repoPath: "/abs/path/to/repo",
    issues: [42, 43, 44],
    model: "opus",       // optional implementation/review override
    effort: "high"        // optional reasoning override
  }
})
```

`issues` also accepts `"42,43"`, `"42-44"`, `"42~44"`, or `"#42~#44"`. `repoPath` must be absolute and already checked out on target branch. Commit and integrate agents stay on `sonnet`; their work is mechanical.

Workflow runs in background. Wait for task notification, then report returned `{ closed, levels, pendingQuestions, unresolved, results }`.

## Decisions, resume, and failure

If TDD needs a human design decision, it reports `needs-input` with question verbatim, makes no code change, and blocks dependents. Relay answer verbatim, then rerun with prior `resumeFromRunId` and `clarifications: { issueNumber: "answer" }`.

Already-closed issues skip before worktree creation. Existing clean issue worktrees with commits ahead of base report `already-committed` and proceed to integration. Merge conflicts leave branch/worktree intact; do not force-remove either.

Before investigating a seemingly unrelated test failure, use a temporary stash (include `-u` when needed), rerun affected test in clean state, then restore it.

## Composes with

`sgche:marc-andreessen-persona` is applied to code review by workflow script.
