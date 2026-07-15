---
name: worktree
description: Create or reuse a git worktree+branch pair for a batch of tickets, tag each ticket with it so later sessions never guess where to work, then merge to main and clean up on request.
disable-model-invocation: true
---

# Worktree

Run the accompanying work inside a dedicated **git worktree** so it never touches whatever branch is currently checked out. Reuse before creating; leave a note on every ticket so any session — this one or a future agent picking up a single ticket — resumes in the right place.

Uses plain `git worktree`, not the harness's ephemeral worktrees — the point is persistent, cross-session state. Ticket-scoped only: every worktree this skill touches belongs to one or more GitHub tickets. It does not track worktrees for ticketless work.

Assumes a git repo. If `git rev-parse --git-dir` fails, say so and stop.

## 1. Resolve the worktree

Resolve identity in this order — first match wins:

- **a. Ticket says so.** If the task references a ticket that already carries a `Worktree:` note (check the issue body and comments), that branch/path *is* the answer. Reuse it exactly — do not create a new worktree, do not derive a name, do not fall through to the rules below.
- **b. Filing a batch.** Paired with `/to-tickets`: derive a slug from the batch's topic — the subject of the prompt or doc being turned into tickets — since no ticket numbers exist yet.
- **c. Single ticket, first touch.** Issue `#42` with no `Worktree:` note yet → `issue-42-<slug>` (slug from issue title); this run creates it.

If none of these resolve, ask before proceeding. Keep slugs slash-free.

*Done when:* a single branch name is settled, tagged with which rule resolved it (a/b/c).

## 2. Reuse or create

Check `git worktree list --porcelain` for a worktree already tracking this branch — it's always live, so there's nothing to reconcile against a stale cache:

- If one exists, `cd` into it.
- Otherwise create it. Never create a duplicate.

**Invariant: one worktree, one branch, created together.** A worktree is never pointed at a pre-existing branch it didn't create, except when reusing per §1a — that branch was created by *this* worktree the first time it was made.

```bash
git worktree add .claude/worktrees/<branch> -b <branch>
```

Then `cd` into it.

**Completion:** you are inside the worktree directory for `<branch>`.

## 3. Ticket notes

Durable, travels with the work — the one record of where this branch lives.

When filing or reusing a worktree for a `/to-tickets` batch, comment on **every** ticket in that batch — not just the first. The note must tell any reader, not just this skill, to verify before trusting it:

```bash
gh issue comment <n> --body "Worktree: \`<branch>\` at \`<path>\`. Before working, verify it exists (\`git worktree list\`). If it doesn't, stop and tell the user to run \`/sgche:worktree\` to (re)create it — don't create a new worktree yourself, don't work in main."
```

*Done when:* every ticket in the batch carries this note.

## 4. Finish (only when asked)

Never run this speculatively — only on explicit request ("merge and clean up", "finish this worktree").

1. Worktree must be clean (`git status --porcelain` empty in it). Dirty → stop, report, do not proceed.
2. From the main checkout (not this worktree), merge locally, no PR: `git merge --no-ff <branch>` into `main`.
   - Conflicts → stop, report, leave the branch and worktree intact.
3. On a clean merge: `git worktree remove <path>`, then `git branch -d <branch>` — `-d`, not `-D`, so an unmerged branch refuses to delete instead of silently losing commits.

**Completion:** the branch's commits are reachable from `main`, and the worktree directory and the branch are both gone.

## Failure modes

- **Wrong worktree** — starting on a ticket without checking its `Worktree:` note first, landing on `main` or spinning up a duplicate. Defence: §1a is checked before any derivation, every time a ticket number is in hand.
- **Stale note** — the note points at a worktree that's since been removed, merged, or never existed on this machine, and the reader trusts it blindly. Defence: the note itself demands an existence check and a stop-and-ask, not a silent fallback to `main` or a freshly invented worktree.
- **Undocumented ticket** — a `/to-tickets` batch ships with some tickets missing their note. Defence: §3's *Done when* covers every ticket in the batch, not the first one you touch.
- **Merging dirty or conflicted work.** Defence: §4 steps 1–2 hard-stop before touching branches.
- **Losing unmerged commits on cleanup** — deleting a branch that wasn't actually merged. Defence: `git branch -d`, never `-D`.

## Composes with

- `sgche:worktree` + `/to-tickets "<topic>"` — one worktree for the whole batch, every filed ticket gets a `Worktree:` note.
- `sgche:worktree` + `/implement #57` — §1a finds the note `/to-tickets` left and reuses that worktree.
- `sgche:worktree` + `/implement #42` + `sgche:close-issue`
- `sgche:worktree` (finish) — merge to `main` and delete both worktree and branch, on request.
