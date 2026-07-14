---
name: fan-out
description: Composable overlay — delegate the current task to parallel subagents so the main context stays clean.
disable-model-invocation: true
---

# Fan Out

A composable overlay: for the work in this prompt, **fan out** by default — slice it into independent units and **delegate** each slice to a subagent. This protects the main context window and scales across large, parallelisable tasks.

## The policy

1. **Decompose** the task into independent units — files, tickets, review dimensions, research sub-questions, search angles.
   - *Done when:* every unit is named in one line and has clear boundaries.

2. **Dispatch** each unit to a subagent with a self-contained prompt.
   - *Done when:* each subagent has everything it needs to work without this conversation's context.

3. **Parallelise** units that don't depend on each other; sequence only where one genuinely feeds the next.
   - *Done when:* the dependency graph is explicit and independent units are launched together.

4. **Keep the main window clean** — subagents return distilled results, not raw file dumps. Synthesize their outputs here.
   - *Done when:* the final answer here is synthesized; no raw file content is pasted back unread.

5. **Applies recursively** — if a delegated unit itself splits into independent subtasks, it fans those out too.
   - *Done when:* each subagent has applied the same decomposition test before subdividing.

## Branches

Use the branch that matches the current task. Each branch uses the same policy but with a different slicing rule.

- **Build/implement branch** — slice by ticket, file, or component; each slice gets its own subagent.
- **Review/audit branch** — slice by dimension or file; run finders/readers in parallel, then synthesize.
- **Research branch** — slice by search angle or sub-question; gather in parallel, then synthesize.
- **Recursive branch** — when a delegated slice is still large, the subagent re-applies this overlay to fan it out further.

## When *not* to fan out

A single, small, tightly-coupled change where the round-trip plus re-explaining the context costs more than just doing it inline — roughly one file, one function, or one prompt-sized answer. Delegation has overhead; spend it on work that is large, parallelisable, or context-heavy.

## Failure modes

- **Premature completion** — ending before all subagents return or before synthesizing their results. Defence: check the completion criterion on every policy step.
- **Over-splitting** — delegating tiny, tightly-coupled changes where the round-trip costs more than inline work. Defence: fall back to inline when the change fits in one file/function/prompt answer.
- **False independence** — slicing tasks that actually depend on each other and running them in parallel. Defence: sequence them and pass the output of the first into the second.
- **Context leak** — a subagent dumps raw files instead of a distilled result. Defence: ask the subagent to return a synthesis; do not re-read files it already read.

## Composes with

- `sgche:fan-out` + `/implement` — build each ticket or slice in its own subagent.
- `sgche:fan-out` + a broad review, audit, or research task — run the finders/readers in parallel, then synthesize.
