---
name: plan-reviewer
description: "Review and revise one committed Markdown plan through two sequential Codex subagents, then commit supported changes after each pass. Use only when the user explicitly invokes $plan-reviewer with exactly one plan path. Uses the most capable available model at low then medium effort, pauses for irreducible human decisions, and creates Git commits. Codex-only; never self-activate."
---

# Review a Plan Twice

Run only on explicit invocation with one plan path. Treat only that plan as writable. Never implement it, edit evidence, write review reports, create/switch/merge branches, push, amend, or rewrite commits.

## Prepare

Before any commit or subagent:

1. Resolve absolute repository and plan paths. Require a tracked Markdown file in the active worktree. Report worktree and branch. Stop for detached `HEAD`, conflicts, merge/rebase in progress, or an unsafe path.
2. Snapshot status, including unrelated staged and unstaged changes. Preserve it exactly.
3. Read repository guidance and relevant code, tests, configuration, history, and recursively linked local or external evidence. Stop at cycles, irrelevant links, generated/vendor content, or inaccessible evidence. Prefer authoritative sources and report access limits. Ask whether uncommitted local reference contents are authoritative before using them.
4. Verify the runtime can select the most capable model and set `low` and `medium` effort. Stop before committing if not.

Ensure the exact current plan is in `HEAD`. If changed, commit its complete working-tree contents alone as `docs(plan): checkpoint <name>`. Otherwise verify it matches `HEAD`; never create an empty commit. Preserve unrelated index/worktree state. If path-limited isolation is unsafe, pause. Verify commit paths, plan contents, and preserved state.

To resume, use the prior handoff and verified hashes. Never infer completed passes from subjects alone or rerun one without user direction.

## Review twice

Run passes sequentially with fresh read-only subagents. For both, use the most capable exposed model, `fork_turns: "none"`, and complete task-local context. Use `low` effort for pass 1 and `medium` for pass 2. Never reuse an agent or run passes in parallel.

Give each reviewer absolute paths, pass number, relevant sources, and read-only scope. Give pass 2 the updated committed plan and current evidence, but no first report, rationale, or orchestrator conclusions. Require a full-plan review, not a diff review.

Cover correctness, consistency, clarity, integrity and traceability, coverage, completeness, feasibility, scope, sequencing, dependencies, verification, acceptance criteria, risks, migration, compatibility, rollback, and implementability without rediscovering decisions.

Require prioritized findings with severity, dimension, exact plan location, evidence, impact, and correction. Also require coverage notes for every dimension, human decisions, inaccessible evidence, and residual risks. Separate defects from preferences and irreducible ambiguity.

Retry a failed or unusable review once with a fresh agent using the same model and effort. If retry fails, stop and report it without undoing commits.

## Apply each pass

After each review:

1. Verify every finding. Mark it applied, already satisfied, or rejected with reason. Reject weak, incorrect, and out-of-scope advice.
2. Resolve evidence-backed technical disagreements with engineering judgment. For material product, domain, policy, or otherwise irreducible ambiguity, pause before editing. Ask one consolidated set of questions with options, evidence, tradeoffs, impact, and recommendation. Resume after human decisions and record relevant rationale in the plan.
3. Make minimal in-place edits; restructure only when clarity, consistency, or coverage requires it. Preserve established intent. Add no transcript or change manufactured only to force a commit.
4. Re-read the full plan and inspect its diff. Check links and identifiers where practical; reject new placeholders, contradictions, or regressions.
5. If changed, commit only the plan as `docs(plan): apply light review` after pass 1 or `docs(plan): apply medium review` after pass 2. Verify paths, contents, and preserved unrelated state. If unchanged, skip the commit.

Never roll back completed commits after a pause or failure.

## Report

Report plan path, branch, baseline hash and whether pre-existing, each review hash or `no changes`, per-pass disposition counts, human decisions, access limits, residual risks, and unresolved issues. Do not push without a separate request.
