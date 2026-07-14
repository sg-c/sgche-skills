---
name: close-issue
description: Close a resolved GitHub issue after verifying the fix is merged, and leave a closing comment. Use after /implement or /to-tickets.
disable-model-invocation: true
---

# Close Issue

A composable overlay that seals the issue `/implement` and `/to-tickets` deliberately leave open. Uses the `gh` CLI against the current repo (`gh repo view --json nameWithOwner`). Never hard-code a repo.

## 1. Identify the issue

Resolve in this order:

1. Issue number the user gave.
2. Current branch name (`issue-42-…`).
3. `Closes #n` / `#n` in the last 20 commits.

If none resolves, ask which issue — don't guess.

*Done when:* I can state the issue number out loud.

## 2. Verify the work landed

- Working tree is clean, or leftover changes are unrelated to this issue.
- If a PR exists for this branch, it is merged (`gh pr view --json state,mergedAt`).
- If no PR exists, the resolving commit is on the default branch (`git branch --contains <sha>`).
- If the issue is already closed (e.g. `Closes #n` in a merged PR), say so and stop.

*Done when:* I can point to the merged PR or reachable commit that resolves the issue.

## 3. Close it

Leave a closing comment, then close:

```bash
gh issue comment <n> --body "Resolved by <commit-sha-or-PR-url>. <one-line summary of what shipped>."
gh issue close <n> --reason completed
```

Use `--reason "not planned"` only when dropping the issue — and say why in the comment.

*Done when:* the issue is `closed` and the closing comment is visible.

## Branches

- **Merged-PR path** — link the PR URL; require `mergedAt` is set.
- **Direct-commit path** — link the commit SHA; require it is on the default branch.
- **Won’t-fix / drop path** — close with `--reason not planned` and explain why.

## Failure modes

- **Premature completion** — closing before the fix is merged or reachable. Defence: satisfy the step-2 *Done when* before running `gh issue close`.
- **Wrong issue** — guessing when the source is ambiguous. Defence: ask; never default.
- **Already closed** — commenting on an issue a merged PR already closed. Defence: check `gh issue view <n> --json state` before commenting.

## Composes with

- `/implement #42` + `sgche:close-issue`
- `sgche:worktree` + `/implement #42` + `sgche:close-issue`
