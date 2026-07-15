---
name: fan-out
description: Composable overlay — delegate the current task to parallel subagents so the main context stays clean, checkpointing progress so an interrupted run resumes in a later session.
disable-model-invocation: true
---

# Fan Out

A composable overlay: for the work in this prompt, **fan out** by default — slice it into independent units and **delegate** each to a subagent, keeping the main context clean and scaling across large, parallelisable tasks. Every unit's status is **flushed** to disk as it moves, so a run interrupted mid-way — quota, context limit, closed session — resumes later instead of restarting.

## The policy

1. **Checkpoint: resume or start fresh.** Before decomposing, look in `.claude/fan-out/` for a checkpoint matching this task.
   - **Match** (user says resume/continue, or a checkpoint's task line describes this work) — load it, report `[x]`/`[~]`/`[ ]` status, dispatch only what isn't `[x]`. Treat `[~]` as not-done: an interrupted subagent's return is unverified, so nothing short of `[x]` is trustworthy. Multiple matches → ask which; resume requested but none found → say so, ask for the task.
   - **No match** — derive a kebab-case slug from the task's subject (same derivation every time, so a later session re-derives it) and create `.claude/fan-out/<slug>.md`.
   - *Done when:* one checkpoint file for this task exists on disk, before any subagent is dispatched.

2. **Decompose** the task into independent units — files, tickets, review dimensions, research sub-questions, search angles. Flush every unit into the checkpoint as `[ ]` immediately.
   - *Done when:* every unit is named in one line, has clear boundaries, and is on disk.

3. **Dispatch** each unit to a subagent with a self-contained prompt. Flush its entry to `[~]` the moment it's launched.
   - *Done when:* each subagent has everything it needs without this conversation's context, and the checkpoint reflects it.

4. **Parallelise** units that don't depend on each other; sequence only where one genuinely feeds the next.
   - *Done when:* the dependency graph is explicit and independent units are launched together.

5. **The instant a unit's subagent returns, flush its result** — `[x]` with the distilled result, on disk, before touching the next unit. Only then synthesize it into the running answer; never paste a raw dump back. A batched end-of-run flush is exactly what a mid-run interruption loses.
   - *Done when:* re-reading the file shows `[x]` for this unit — not assumed from having synthesized it — before the next dispatch.

6. **Applies recursively** — a delegated unit that itself splits into subtasks fans those out too, with its own nested checkpoint under the same rules.
   - *Done when:* each subagent applies the same decomposition test before subdividing.

7. **Clean up** — once every unit is `[x]` and the synthesis is delivered, delete the checkpoint file.
   - *Done when:* `.claude/fan-out/<slug>.md` no longer exists.

## Checkpoint file

One file per run, `.claude/fan-out/<slug>.md`:

```markdown
# <slug>
Task: <one-line summary of the original ask>

- [x] unit-1 — <distilled result>
- [~] unit-2 — dispatched, awaiting return
- [ ] unit-3 — pending
```

## Branches

Use the branch that matches the current task. Each branch uses the same policy but with a different slicing rule.

- **Build/implement branch** — slice by ticket, file, or component; each slice gets its own subagent.
- **Review/audit branch** — slice by dimension or file; run finders/readers in parallel, then synthesize.
- **Research branch** — slice by search angle or sub-question; gather in parallel, then synthesize.
- **Recursive branch** — when a delegated slice is still large, the subagent re-applies this overlay to fan it out further.

## When *not* to fan out

A single, small, tightly-coupled change where the round-trip plus re-explaining context costs more than doing it inline — roughly one file, one function, one prompt-sized answer. Delegation has overhead; spend it on work that's large, parallelisable, or context-heavy.

## Failure modes

- **Premature completion** — ending before all subagents return or before synthesizing. Defence: check the completion criterion on every policy step.
- **Over-splitting** — delegating tiny, tightly-coupled changes. Defence: fall back to inline when the change fits in one file/function/answer.
- **False independence** — parallelising units that actually depend on each other. Defence: sequence them, pass the first's output into the second.
- **Context leak** — a subagent dumps raw files instead of a distilled result. Defence: ask for a synthesis; don't re-read files it already read.
- **Stale or mismatched checkpoint** — resuming one whose task doesn't actually match, grafting unrelated progress on. Defence: same match check as step 1; ask on any doubt.
- **Trusting in-flight state** — counting `[~]` as done. Defence: only `[x]` counts (step 1) — a killed subagent leaves no verified result.
- **Checkpoint sediment** — a leftover file confuses a later session. Defence: step 7 always deletes on completion; an old checkpoint for finished-elsewhere work gets deleted, not resumed.

## Composes with

- `sgche:fan-out` + `/implement` — build each ticket or slice in its own subagent.
- `sgche:fan-out` + a broad review, audit, or research task — run finders/readers in parallel, then synthesize.
- `sgche:fan-out` across sessions — a checkpoint written before an interruption lets a later session resume the same units instead of redoing finished work.
