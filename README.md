# sgche-skills

Composable workflow overlays, published as a single plugin named **`sgche`**. Each skill is a thin, generic overlay meant to be **combined** with other skills (e.g. the `ask-matt` family) in one prompt — composition, not inheritance. None of them modify the skills they compose with.

All three are **explicit-invoke only** (`disable-model-invocation: true`) so *you* control when they apply. Two of them have side effects (creating worktrees, closing issues), so they should never fire on their own.

| Skill | Fills the gap | Typical composition |
|-------|---------------|---------------------|
| `sgche:worktree` | Run any branch-based skill in a dedicated worktree instead of the current checkout. | `sgche:worktree` + `/implement #42` |
| `sgche:close-issue` | Issues get created but never closed (`/implement` commits; `/to-tickets` won't touch the parent). | `/implement #42` + `sgche:close-issue` |
| `sgche:fan-out` | No general directive to delegate work to subagents — you had to retype "fan out subagents". | `sgche:fan-out` + `/implement` |

Full loop example: `sgche:worktree` + `sgche:fan-out` + `/implement #42` + `sgche:close-issue`. `sgche:worktree` composes with any branch-based skill (build, review, research, refactor, etc.).

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
```
