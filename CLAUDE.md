# sgche-skills

Plugin repo, single plugin `sgche` — composable Claude Code skill overlays. See README.md for the skill table and install steps.

## Layout

```
.claude-plugin/marketplace.json   # declares plugin `sgche`, lists skill dirs
skills/<skill-name>/SKILL.md      # required, one per skill
skills/<skill-name>/scripts/      # optional — e.g. resolve-tickets/scripts/workflow.js
```

Adding a skill: create `skills/<name>/SKILL.md`, then add its path to `marketplace.json`'s `plugins[0].skills` array.

## SKILL.md frontmatter

```yaml
---
name: skill-name
description: long — states what it does AND when it should trigger (or not)
disable-model-invocation: true   # only for explicit-invoke-only skills
---
```

Set `disable-model-invocation: true` when the skill has side effects (commits, closes issues) — those must never self-activate; user invokes explicitly (`/sgche:name`). Voice/tone overlays (e.g. `marc-andreessen-persona`) may self-trigger.

## Conventions

- Skills here are **composable overlays**, not standalone workflows — meant to combine with other skills in one prompt (e.g. `marc-andreessen-persona` + `deep-research`). Don't make a new skill assume it runs alone unless it's explicitly a workflow like `resolve-tickets`.
- A skill must not modify the skills it composes with.
- Workflow-style skills that shell out to `Workflow` (e.g. `resolve-tickets`) pass `repoPath` explicitly in `args` — each step runs in a fresh subagent process with no shared shell state, so nothing may rely on inherited `cd`.

## Testing a skill locally

```
/plugin marketplace add ~/Documents/src/github-proj/sgche-skills
/plugin install sgche@sgche-skills
```
