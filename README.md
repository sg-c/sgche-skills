# sgche-skills

Composable workflow overlays, published as a single plugin named **`sgche`**. Each skill is a thin, generic overlay meant to be **combined** with other skills (e.g. the `ask-matt` family) in one prompt — composition, not inheritance. None of them modify the skills they compose with.

`worktree`, `close-issue`, `fan-out`, `marc-andreessen-persona`, and `resolve-tickets` are **explicit-invoke only** (`disable-model-invocation: true`) so *you* control when they apply — they have side effects (creating worktrees, closing issues, committing) or a strong voice override, so they should never fire on their own. `issue-break-up` auto-triggers when a GitHub issue looks too big for one shot.

| Skill | Fills the gap | Typical composition |
|-------|---------------|---------------------|
| `sgche:worktree` | Run branch-based work in a dedicated worktree, tag every ticket in a batch with it so later sessions never guess where to work, then merge-and-clean-up on request. | `sgche:worktree` + `/to-tickets "<topic>"`, later `sgche:worktree` + `/implement #57` |
| `sgche:close-issue` | Issues get created but never closed (`/implement` commits; `/to-tickets` won't touch the parent). | `/implement #42` + `sgche:close-issue` |
| `sgche:fan-out` | No general directive to delegate work to subagents — you had to retype "fan out subagents". Checkpoints unit progress to disk so an interrupted run (quota, context limit, closed session) resumes instead of restarting. | `sgche:fan-out` + `/implement` |
| `sgche:issue-break-up` | Complex issues stay one giant blob — no split into independently implementable, context-sized subtasks. | `sgche:issue-break-up` on #57, then `/implement` each subtask |
| `sgche:marc-andreessen-persona` | Answers default to hedged, validating, neutral-toned prose — no lever to force a blunt, unhedged, first-principles voice on top of any other skill's output. | `sgche:marc-andreessen-persona` + `deep-research`, or alone for opinion/analysis questions |
| `sgche:resolve-tickets` | Burning down a batch of issues means re-running `/tdd` → review → fix → close by hand for each one, with context bleeding between them. Runs each step as its own fresh subagent, sequential, resumable, stops and surfaces the exact question if a step needs a human call. | `sgche:issue-break-up` on #57, then `sgche:resolve-tickets` over the resulting subtask numbers |

Full loop example: `sgche:issue-break-up` #42 + `sgche:worktree` + `sgche:fan-out` + `/implement` + `sgche:close-issue`. `sgche:worktree` is ticket-scoped — it composes with `/to-tickets` and `/implement`, not with ticketless work. `sgche:marc-andreessen-persona` is orthogonal to all of the above — it's a voice overlay, not a workflow step, so drop it into any prompt where you want blunter, unhedged prose.

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
skills/marc-andreessen-persona/SKILL.md
skills/resolve-tickets/SKILL.md
skills/resolve-tickets/workflow.js
```
