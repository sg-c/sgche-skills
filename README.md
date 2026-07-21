# sgche-skills

Composable workflow overlays, published as a single plugin named **`sgche`**. Each skill is a thin, generic overlay meant to be **combined** with other skills (e.g. the `ask-matt` family) in one prompt — composition, not inheritance. None of them modify the skills they compose with.

`worktree`, `close-issue`, and `fan-out` are **explicit-invoke only** (`disable-model-invocation: true`) so *you* control when they apply — two of them have side effects (creating worktrees, closing issues), so they should never fire on their own. `issue-break-up` auto-triggers when a GitHub issue looks too big for one shot.

| Skill | Fills the gap | Typical composition |
|-------|---------------|---------------------|
| `sgche:worktree` | Run branch-based work in a dedicated worktree, tag every ticket in a batch with it so later sessions never guess, then merge-and-clean-up on request. | `sgche:worktree` + `/to-tickets "<topic>"`, later `sgche:worktree` + `/implement #57` |
| `sgche:close-issue` | Issues get created but never closed (`/implement` commits; `/to-tickets` won't touch the parent). | `/implement #42` + `sgche:close-issue` |
| `sgche:fan-out` | No general directive to delegate work to subagents — you had to retype "fan out subagents". Checkpoints unit progress to disk so an interrupted run (quota, context limit, closed session) resumes instead of restarting. | `sgche:fan-out` + `/implement` |
| `sgche:issue-break-up` | Complex issues stay one giant blob — no split into independently implementable, context-sized subtasks. | `sgche:issue-break-up` on #57, then `/implement` each subtask |

Full loop example: `sgche:worktree` + `sgche:fan-out` + `/implement #42` + `sgche:close-issue`. `sgche:worktree` is ticket-scoped — it composes with `/to-tickets` and `/implement`, not with ticketless work.

## Install

```
/plugin marketplace add ~/Documents/src/github-proj/sgche-skills
/plugin install sgche@sgche-skills
```

To publish and install from GitHub instead, push this directory to `sg-c/sgche-skills`, then
`/plugin marketplace add sg-c/sgche-skills`.

## Layout

```
.claude-plugin/marketplace.json   # declares the `sgche` plugin
skills/worktree/SKILL.md
skills/close-issue/SKILL.md
skills/fan-out/SKILL.md
skills/issue-break-up/SKILL.md
```
