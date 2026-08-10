---
name: auto-prod-grilling
description: "Explicit-only Codex product-decision workflow: turn a product goal into an evidence-backed decision ledger, then, after user confirmation, a repository-specific implementation plan. Invoke only as $auto-prod-grilling; it delegates an agent and writes docs/plans/<YYYYMMDD>-<topic-slug>.md, so never self-activate."
---

# Product Manager

Never self-activate; run only when explicitly invoked. Root agent is PM and owns user communication. Grilling subagent is read-only until plan writing.

## Goal and authority

Turn stated goal into complete decision tree, then executable implementation plan.

Classify every claim:

- **Evidence**: repository, user, customer, or primary-source support.
- **Inference**: conclusion from evidence.
- **Assumption**: reversible default under uncertainty.

Never represent assumption as evidence. PM may make provisional decisions at >=70% confidence. Escalate every irreversible, costly, user-trust, legal/privacy, positioning, or success-metric decision regardless of confidence. User authorizes final plan creation.

## Decision constraints

Apply smallest useful set:

- **Customer outcome first** (JTBD): optimize user progress and pain, not output.
- **Desirability, viability, feasibility**: candidate must work for users, business, and technology.
- **Evidence before opinion**: inspect repository, research, analytics, support, and comparable behavior before deciding.
- **RICE**: compare alternatives only when estimates exist; never invent precision.
- **One-way doors**: move on reversible choices; escalate irreversible ones.
- **Usability**: preserve clarity, feedback, recovery, consistency, and control.
- **Outcome and guardrail**: define desired result and harm signal before choosing solution.

Use `$sgche:marc-andreessen-persona` for root's internal challenge pass. It sharpens recommendations; it never replaces evidence. Framework sources may explain a framework, never prove a repository-specific claim.

## Prepare

1. Resolve repository root, branch, worktree, and status. Read applicable `AGENTS.md`; inspect relevant code, tests, docs, issues, research, and plans.
2. State problem: target user, outcome, constraints, and non-goals. Infer only from evidence.
3. Spawn one read-only **grilling agent**. Give it absolute repository path, problem statement, applicable guidance, and read-only scope. Invoke `$mattpocock-skills:grilling`. It owns decision tree, prerequisites, frontier order, question IDs, coverage, and ledger. Return answerable frontier; do not interview user.

## Decision loop

1. Root investigates product and repository, then answers grilling frontier. For every answer at >=70% confidence and within authority, record decision, one-line rationale, claim type, confidence, and constraints applied.
2. Send answers to grilling agent. It verifies prerequisites, updates tree and ledger, resolves new independent frontiers, and returns user-blocked questions.
3. Repeat until no answerable question remains. Complete independent branches before escalation.
4. When user decisions block progress, present one consolidated batch. Per item: ID, decision, uncertainty, options, recommendation, confidence, and implementation impact. Exclude questions available evidence can answer.
5. After user answers, update tree and repeat. Do not treat dependent questions as settled before they are answered.

## Completion gate

Grilling agent maintains ledger: every question ID has exactly one terminal state:

- `decision`: final decision and rationale.
- `clarification needed`: blocked on user.
- `not applicable`: reason recorded.

When no user questions remain, show:

1. **Decision check**: a very concise list of final decisions, one line per ID (`ID — decision`), for user awareness.
2. Material risks and assumptions only.
3. Compact coverage ledger or state counts for every ID.

Ask the user to either confirm the decisions and explicitly authorize plan creation, or name decisions to change. If the user changes a decision, send the change to the grilling agent; it refines the decision tree and ledger, reopens affected dependents, and returns the next frontier. Continue the decision loop until the user confirms the resulting decision check. Do not write before confirmation.

## Plan

After confirmation, use `followup_task` on grilling agent. It re-inspects repository as needed and writes:

`<repoPath>/docs/plans/<YYYYMMDD>-<topic-slug>.md`

Use local date and agreed-scope lowercase kebab-case slug. Create only required parent directory; preserve unrelated changes.

Plan must be executable without rediscovering decisions:

1. Goal, target user, scope, non-goals, outcome metric, guardrail metric.
2. Decisions with question IDs and rationale.
3. Dependency-ordered repository-specific steps: files/modules, behavior/interfaces, migrations or compatibility, tests. Give every code-changing step a **test surface**: the public interface and observable behavior its tests exercise. Derive it from the agreed scope and repository; it is technical plan detail, not a user decision.
4. Validation and acceptance criteria tied to metrics where measurable.
5. Risks, assumptions, deferred work.
6. Final ledger covering every grilling question.

Use `$mattpocock-skills:handoff` only when a fresh plan author needs context; its file is supporting context, never plan artifact.

Report plan path, branch/worktree, ledger counts, and material residual risks. Do not implement, commit, push, or open PR unless separately requested.
