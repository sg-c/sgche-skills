# sgche-skills

Composable workflow overlays, published as a single plugin named **`sgche`**. Each skill is a thin, generic overlay meant to be **combined** with other skills (e.g. the `ask-matt` family) in one prompt — composition, not inheritance. None of them modify the skills they compose with.

`marc-andreessen-persona`, `resolve-tickets`, `review-plan`, and `prep-to-implement` are intended to be **explicit-invoke only** so *you* control when they apply — they have side effects (committing, creating worktrees, or creating issues) or a strong voice override, so they should never fire on their own.

| Platform | Skill | Typical composition |
|----------|-------|---------------------|
| Codex + Claude Code | `sgche:marc-andreessen-persona` | `sgche:marc-andreessen-persona` + `deep-research`, or alone for opinion/analysis questions |
| Codex | `sgche:auto-prod-grilling` | `sgche:auto-prod-grilling` to turn a product goal into a decision-complete implementation plan |
| Codex | `sgche:resolve-tickets-codex` | `sgche:resolve-tickets-codex` with one parent issue and its target worktree |
| Codex | `sgche:prep-arch-improvement` | `sgche:prep-arch-improvement` to prepare one reviewed architecture-improvement plan |
| Codex | `sgche:review-plan` | `sgche:review-plan` to review, revise, and commit a plan twice |
| Codex + Claude Code | `sgche:prep-to-implement` | `sgche:prep-to-implement /absolute/path/to/plan.md fine` to create an implementation worktree and GitHub ticket hierarchy |
| Claude Code | `sgche:resolve-tickets-optim` | `sgche:resolve-tickets-optim` over a batch of issue numbers |
| Claude Code | `sgche:resolve-tickets` | `sgche:resolve-tickets` over a batch of issue numbers |

`sgche:marc-andreessen-persona` is orthogonal to `sgche:resolve-tickets` — it's a voice overlay, not a workflow step, so drop it into any prompt where you want blunter, unhedged prose.

## Install

### Claude Code

```
/plugin marketplace add ~/Documents/src/github-proj/sgche-skills
/plugin install sgche@sgche-skills
```

To publish and install from GitHub instead, push this directory to `sg-c/sgche-skills`, then
`/plugin marketplace add sg-c/sgche-skills`.

### Codex

After pushing this repo, install it as a Codex plugin marketplace:

```
codex plugin marketplace add sg-c/sgche-skills
codex plugin add sgche@sgche-skills
```

## Layout

```
.claude-plugin/marketplace.json   # declares the `sgche` plugin for Claude Code
.codex-plugin/plugin.json         # declares the `sgche` plugin for Codex
skills/marc-andreessen-persona/SKILL.md
skills/auto-prod-grilling/SKILL.md
skills/resolve-tickets-codex/SKILL.md
skills/prep-arch-improvement/SKILL.md
skills/review-plan/SKILL.md
skills/prep-to-implement/SKILL.md
claude-skills/resolve-tickets/SKILL.md
claude-skills/resolve-tickets-optim/SKILL.md
```
