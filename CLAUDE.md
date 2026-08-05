# sgche-skills

Plugin repo, single plugin `sgche` — composable skill overlays for Claude Code and Codex. See README.md for the skill table and install steps.

## Layout

```
.claude-plugin/marketplace.json   # declares plugin `sgche` for Claude Code, lists skill dirs
.codex-plugin/plugin.json         # declares plugin `sgche` for Codex
skills/<skill-name>/SKILL.md      # Codex and shared skills
claude-skills/<skill-name>/       # Claude-only skills
```

Codex loads every skill under `skills/` through `.codex-plugin/plugin.json`; keep only Codex and shared skills there. Keep Claude-only skills under `claude-skills/` and list them in `.claude-plugin/marketplace.json`. Add shared skills to both locations: their files remain in `skills/`, and their paths are also listed in the Claude marketplace.

## SKILL.md frontmatter

```yaml
---
name: skill-name
description: long — states what it does AND when it should trigger (or not)
# Avoid `disable-model-invocation: true`; Codex plugin validation rejects it.
# Put explicit-invoke-only constraints in the description and body instead.
---
```

When a skill has side effects (commits, closes issues), state in both the description and body that it must never self-activate; user invokes explicitly (`/sgche:name`). Voice/tone overlays (e.g. `marc-andreessen-persona`) may self-trigger.

## Conventions

- Skills here are **composable overlays**, not standalone workflows — meant to combine with other skills in one prompt (e.g. `marc-andreessen-persona` + `deep-research`). Don't make a new skill assume it runs alone unless it's explicitly a workflow like `resolve-tickets`.
- A skill must not modify the skills it composes with.
- Claude workflow skills that shell out to `Workflow` (e.g. `claude-skills/resolve-tickets`) pass `repoPath` explicitly in `args` — each step runs in a fresh subagent process with no shared shell state, so nothing may rely on inherited `cd`.

## Testing a skill locally

```
/plugin marketplace add ~/Documents/src/github-proj/sgche-skills
/plugin install sgche@sgche-skills
```
