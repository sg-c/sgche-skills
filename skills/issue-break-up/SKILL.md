---
name: issue-break-up
description: Break a complex GitHub issue into small, independently implementable subtasks documented in docs/break-up/. Use whenever a GitHub issue touches many files, spans multiple modules, has explicit dependencies, or the user says the issue is too big, hits context limits, wants it split, broken into pieces, or divided into smaller tasks. Also use when an issue references multiple plan documents or acceptance criteria lists that clearly map to distinct file groups.
compatibility: Requires GitHub MCP or gh CLI access to read issues. Expects a git repo with a docs/ directory.
---

# issue-break-up

Split a complex GitHub issue into small subtasks so each one fits in context and can be implemented independently.

## When this skill triggers

Use this skill when the user points at a GitHub issue and the work is too large to implement in one shot. Signals:

- User says "break this up", "split into smaller tasks", "too big", "context window", "divide and conquer".
- The issue touches files across multiple modules (models, routers, services, workflows, tests, migrations).
- The issue references multiple plan documents or has a long acceptance-criteria list.
- The issue has a "Blocked by" or dependency chain.
- The issue would clearly benefit from staged implementation.

If the issue is small (≤3 production files, trivial tests), do **not** use this skill. Just implement it.

## Goal

Produce a set of markdown files under `docs/break-up/<issue-number>/`:

- One index file: `docs/break-up/<issue-number>/index.md`
- One subtask file per chunk: `docs/break-up/<issue-number>/<task-index>-<subtask-slug>.md`

Each subtask file must contain enough context that a future agent (or you, later) can implement it without re-reading the entire issue or plan.

## Constraints

- Each subtask covers at most **3 production files**.
- Tests related to those production files are listed and tracked, but do not count toward the 3-file limit.
- Each subtask must have clear acceptance criteria.
- Subtasks should minimize cross-file edits within a single subtask. Prefer vertical slices over horizontal layers when they are clean.
- If a subtask depends on another subtask landing first, record that in `blocked_by` frontmatter.
- Do not implement the subtasks unless the user explicitly asks. This skill produces the plan.

## Workflow

### Step 1 — Fetch and parse the issue

Read the issue body using the GitHub MCP or `gh issue view <number> --json number,title,body,labels,comments`.

Extract:

- Issue number and title.
- "What to build" / high-level goal.
- "Scope" section: bullet list of changes.
- "Acceptance criteria" section.
- "Blocked by" / "Blocks" / dependency references.
- Links to plan documents (e.g., `plans/YYYY-MM-DD-topic/NN-name.md`).
- Links to protocol/docs files (e.g., `PROTOCOL.md`, `CONTEXT-MAP.md`).

### Step 2 — Read linked context

Read every plan document, protocol file, or design doc linked from the issue. These contain the code-level details needed to group files correctly.

If a plan file is large, read the whole thing. Do not skim; the grouping depends on understanding which files each section touches.

### Step 3 — Build a file inventory

From the issue and linked plans, list every file that will change. Include:

- Production Python files.
- Test files.
- Migration files.
- Documentation files (only if the issue explicitly asks to edit them).

For each file, note what change it needs in 1–2 sentences.

### Step 4 — Group files into subtasks

Group the inventory into subtasks. Follow these heuristics in order:

1. **One logical concern per subtask.** A subtask should implement one coherent change (e.g., "add `kind` column to events and SSE formatting", "migrate web_collector emissions to new registry").
2. **Minimize file count.** Aim for 1–2 production files per subtask. Never exceed 3 without a strong reason documented in the subtask.
3. **Keep dependencies explicit.** If subtask B needs a model/schema from subtask A, put B after A and record `blocked_by: [<A-slug>]`.
4. **Tests follow production files.** Tests for a production file belong in the same subtask as that file. They do not count toward the 3-file limit.
5. **Migrations stand alone.** A new Alembic migration usually deserves its own subtask because it must land before code that depends on the column.
6. **Delete-and-rename clusters stay together.** If a change deletes several closely related models and replaces them with new ones, keep them in one subtask even if it touches slightly more files; document why.

For each subtask, pick a short kebab-case slug that describes the change.

### Step 5 — Write subtask files

Create `docs/break-up/<issue-number>/<task-index>-<subtask-slug>.md` for each subtask, where `<task-index>` is the subtask's 1-based order (matches the `Order` column in the index table).

Frontmatter:

```markdown
---
issue: <number>
subtask: <subtask-slug>
title: <short human title>
files:
  - <relative/path/to/file1.py>
  - <relative/path/to/file2.py>
  - <relative/path/to/file3.py>
tests:
  - <relative/path/to/test1.py>
  - <relative/path/to/test2.py>
blocked_by: []
---
```

`files` must contain 1–3 production files. `tests` lists related tests. `blocked_by` is a list of sibling subtask slugs; empty if none.

Body template:

```markdown
## Context

2–4 sentences explaining why this subtask exists and how it fits into the larger issue.

## Goal

One sentence: what concrete change this subtask makes.

## Files to change

### `<file1.py>`

- Specific change 1.
- Specific change 2.

### `<file2.py>`

- Specific change 1.

## Acceptance criteria

- [ ] Criterion 1.
- [ ] Criterion 2.
- [ ] Criterion 3.

## Notes / risks

Any ambiguity, shape question, or decision the implementer must resolve.
```

Write enough detail that an implementer does not need to re-read the full issue or plan. Quote relevant acceptance criteria verbatim when useful.

### Step 6 — Write the index file

Create `docs/break-up/<issue-number>/index.md`.

Frontmatter:

```markdown
---
issue: <number>
title: <issue title>
source: <issue html_url>
status: broken-up
---
```

Body:

```markdown
## Summary

1–2 paragraphs summarizing the issue and why it was split.

## Subtasks

| Order | Slug | Title | Files | Blocked by | Status |
|-------|------|-------|-------|------------|--------|
| 1 | `<slug>` | `<title>` | `file1.py`, `file2.py` | — | |
| 2 | `<slug>` | `<title>` | `file3.py` | `<slug>` | |

## Entry point

Start with subtask `<first-slug>`.

## Notes

Any global context that does not fit in a single subtask.
```

The index is the single source of truth for order and dependencies. `Status` is `done` once a subtask is fully implemented and merged; leave it blank otherwise. When re-running this skill against an issue that already has an index, carry forward existing `done` marks rather than resetting them.

## Output

After running this skill, the user sees:

- `docs/break-up/<issue-number>/index.md`
- `docs/break-up/<issue-number>/<task-index>-<subtask-slug>.md` (one per subtask)

Tell the user:

1. How many subtasks were created.
2. Which subtask has no blockers and should be implemented first.
3. Whether any subtasks have open questions or ambiguities that need resolution before implementation.

Do not implement anything unless the user explicitly asks.

## Edge cases

- **Issue has no plan links.** Infer file groupings directly from the issue body and the current codebase. Read files as needed.
- **Issue is already small.** If the inventory has ≤3 production files, do not write break-up docs. Tell the user the issue is small enough to implement directly and list the files.
- **Issue references another issue as blocked by.** Read the blocking issue if it provides context needed to break up the current one. Do not implement the blocker.
- **Ambiguous grouping.** If two reasonable groupings exist, pick the one that minimizes dependencies. Document the alternative in the index notes.
- **No docs/ directory.** Create `docs/break-up/` if it does not exist.

## Example

Issue #95 (event taxonomy rewrite) might become:

- `docs/break-up/95/index.md`
- `docs/break-up/95/1-event-models-and-migration.md` (`models/job.py`, migration)
- `docs/break-up/95/2-job-type-registry.md` (`job_types.py`)
- `docs/break-up/95/3-progress-reporter-protocol.md` (`services/progress_reporter.py`)
- `docs/break-up/95/4-event-streamer.md` (`services/event_streamer.py`)
- `docs/break-up/95/5-web-collector-emissions.md` (`workflows/web_collector.py`, `crawl/__init__.py`)
- `docs/break-up/95/6-dataset-collector-emissions.md` (`workflows/dataset_collector.py`, `services/archiver.py`)

Note how the emissions migration is split by job type to keep each subtask focused.
