# sgche-skills

Composable workflow overlays, published as a single plugin named **`sgche`**. Each skill is a thin, generic overlay meant to be **combined** with other skills (e.g. the `ask-matt` family) in one prompt — composition, not inheritance. None of them modify the skills they compose with.

`marc-andreessen-persona` and `resolve-tickets` are intended to be **explicit-invoke only** so *you* control when they apply — they have side effects (committing) or a strong voice override, so they should never fire on their own.

| Skill | Fills the gap | Typical composition |
|-------|---------------|---------------------|
| `sgche:marc-andreessen-persona` | Answers default to hedged, validating, neutral-toned prose — no lever to force a blunt, unhedged, first-principles voice on top of any other skill's output. | `sgche:marc-andreessen-persona` + `deep-research`, or alone for opinion/analysis questions |
| `sgche:resolve-tickets` | Burning down a batch of issues means re-running `/tdd` → review → fix → close by hand for each one, with context bleeding between them. Runs each step as its own fresh subagent, sequential, resumable, stops and surfaces the exact question if a step needs a human call. | `sgche:resolve-tickets` over a batch of issue numbers |

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
skills/resolve-tickets/SKILL.md
skills/resolve-tickets/workflow.js
```
