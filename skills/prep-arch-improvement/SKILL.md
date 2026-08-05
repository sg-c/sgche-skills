---
name: prep-arch-improvement
description: "Prepare a focused, reviewed Markdown implementation plan for one high-impact codebase architecture improvement. Use only when the user explicitly invokes $prep-arch-improvement and supplies an absolute repository path, optionally with a focus area or an explicit non-Strong candidate. This Codex-only workflow creates one temporary HTML architecture report, Markdown plans and other documentation artifacts, and delegates to separate architecture, selection, and review agents; it never modifies the target repository."
---

# Prepare Architecture Improvement

Run this workflow only on the user's explicit request. It is Codex-only because it uses native collaboration tools. It is read-only in the target repository: do not update `CONTEXT.md`, create ADRs, edit code, or make commits. Put necessary documentation changes into the implementation plan instead.

## Artifact formats

Keep the original architecture review from `$mattpocock-skills:improve-codebase-architecture` as the sole HTML artifact. Write the implementation plan as Markdown and use `.md` for every other document artifact created by this workflow, including any supplemental decision or review document. Do not create additional HTML, PDF, DOCX, or presentation artifacts.

## Inputs and orchestration

Require an absolute `repoPath`. Accept an optional focus area. Before spawning agents, confirm the repository's active branch, worktree, and status; preserve all existing changes. The root agent orchestrates and owns every temporary artifact and human interaction.

Use Codex-native collaboration tools directly, never through `functions.exec`. Keep the architecture agent alive for the decision phase by using `followup_task` after its report. Give every child agent the absolute `repoPath`, its role, and only the preceding artifacts it needs. Child agents must not modify the repository.

## 1. Produce the architecture review

Spawn one architecture agent. Require it to invoke `$mattpocock-skills:improve-codebase-architecture` and follow its exploration and HTML-report process, including its `CONTEXT.md`/ADR research and architecture vocabulary. Override only its interactive and write-side-effect portions:

- Create the self-contained HTML report in the operating-system temp directory as specified by the composed skill. This is the sole HTML artifact.
- Do not ask the human to select a candidate; return after the report and a concise candidate-evidence handoff.
- Do not modify `CONTEXT.md` or ADRs; identify any proposed documentation edits for the later plan.

Require the handoff to include the absolute report path; each candidate's title, strength, files, problem, solution, expected locality/leverage and test effects; the recommended candidate; relevant ADR constraints; and the evidence needed to make decisions later.

## 2. Select exactly one candidate independently

Spawn a separate selection agent with the report path, candidate-evidence handoff, and `repoPath`. It must inspect the report and relevant code, then select exactly one most impactful eligible deepening opportunity. Its response must state the candidate, recommendation strength, evidence, and why it outranks the alternatives.

Eligible candidates are `Strong` only. If the user explicitly names a non-Strong candidate or explicitly requests consideration of non-Strong opportunities, allow the named or highest-impact requested candidate. If no eligible candidate exists, stop after returning the report path and explain that no candidate was strong enough to plan.

## 3. Continue the architecture decision session

Use `followup_task` on the original architecture agent. Provide the selection result and require it to continue `$mattpocock-skills:improve-codebase-architecture`'s decision exploration for that candidate.

The agent must make technical decisions that are well-supported by the repository, report, project guidance, and its engineering judgment. For every decision, record the choice, rationale, affected modules/files, and test implication. Do not defer a decision merely because multiple valid options exist.

Record an open question only when it is a material product, domain, policy, or otherwise irreducibly ambiguous choice that an agent cannot resolve from available evidence. For each question, record why it cannot be decided, the alternatives, the recommended answer, and the implementation impact. Do not ask the human yet; collect every question in one batch.

## 4. Write a focused implementation plan

Have the architecture agent write a Markdown plan to:

`/tmp/arch-improvement-plan-<opportunity-slug>-<YYYYMMDD>.md`

Derive `<opportunity-slug>` from the selected title as lowercase kebab-case. Use local time for the date. Exclude unrelated report candidates and other exploratory material.

The plan must contain enough repository-specific context for a downstream implementation agent to complete the work without reopening the architecture investigation. Include:

1. `## Selected opportunity` — problem, scope, evidence, and intended architectural outcome.
2. `## Context and constraints` — affected modules, current seams, relevant domain language, ADR constraints, and out-of-scope work.
3. `## Decisions made` — a concise list of each decision and rationale, including documentation changes to make during implementation.
4. `## Implementation plan` — ordered, file/module-specific steps; desired module/interface shape; migration or compatibility handling; and ownership of complexity behind seams.
5. `## Validation` — focused tests, changed test surfaces, and static checks appropriate to the repository.
6. `## Open questions` — all unresolved questions in the required format, or `None`.
7. `## Plan review notes` — initially reserved for the review pass.

## 5. Independently review and revise once

Spawn a separate plan-review agent with the plan, selection result, report path, and `repoPath`. It must review for technical correctness, missing implementation detail, contradictions with code or ADRs, incorrect scope, and whether a downstream agent could execute the plan. It must not edit files.

Use `followup_task` on the architecture agent to apply concrete feedback once. Update the same plan, preserving any disagreement or unresolved issue in `## Open questions`, and fill `## Plan review notes` with the feedback disposition. Do not run a second review pass.

## 6. Resolve human questions and finish

If `## Open questions` is empty, return the absolute paths to the HTML report and reviewed plan.

Otherwise, present every open question to the human in one numbered batch, with its alternatives, recommendation, and implementation impact. After the human answers, use `followup_task` on the architecture agent to update the same plan: turn resolved answers into concise entries in `## Decisions made`, retain their rationale, and remove them from `## Open questions`. Do not perform another independent review. State that the plan was reviewed before the human-answer amendment, then return the report and final plan paths.
