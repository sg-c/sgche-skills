export const meta = {
  name: 'resolve-tickets',
  description: 'Sequentially TDD-implement, review, fix, commit, and close a batch of GitHub issues, one issue at a time. Each step (tdd / review / fix / commit-close) runs in its own fresh subagent. Stops and surfaces the question verbatim if a step needs a human decision. Already-closed issues are skipped on resume.',
  phases: [
    { title: 'Process tickets', detail: 'one dynamic phase per issue — tdd, review (optional), fix (optional), commit+close — strictly sequential' },
  ],
}

// repoPath must already be checked out on the default branch — no worktree, no per-issue
// branch. Issues close via the direct-commit path (sgche:close-issue), so that branch must
// be the default branch: the resolving commit needs to be reachable from it with no PR/merge.
// repoPath is passed explicitly (not inherited from any shell cwd) because each agent() call
// is a fresh subagent process — same reasoning as worktreePath in close-issues-batch.js.

// args shape: { repoPath: string, issues: number[] | string, clarifications?: Record<number|string, string> }
// issues accepts: [42, 43] | "42,43" | "42-44" | "42~44" | "#42~#44"
// clarifications answers a question a previous run stopped on, keyed by issue number, e.g.
// { repoPath: "/abs/path/to/repo", issues: [42, 43], clarifications: { 42: "Test at the HTTP handler seam, not the service." } }

const TDD_SCHEMA = {
  type: 'object',
  properties: {
    issueNumber: { type: 'number' },
    status: { type: 'string', enum: ['skipped-already-closed', 'implemented', 'needs-input', 'blocked'] },
    summary: { type: 'string' },
    question: { type: 'string' },
    codeFilesTouched: { type: 'boolean' },
    blockerReason: { type: 'string' },
  },
  required: ['issueNumber', 'status', 'summary'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    issueNumber: { type: 'number' },
    hasHardIssues: { type: 'boolean' },
    report: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['issueNumber', 'hasHardIssues', 'report', 'summary'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    issueNumber: { type: 'number' },
    status: { type: 'string', enum: ['fixed', 'blocked'] },
    summary: { type: 'string' },
    blockerReason: { type: 'string' },
  },
  required: ['issueNumber', 'status', 'summary'],
}

const CLOSE_SCHEMA = {
  type: 'object',
  properties: {
    issueNumber: { type: 'number' },
    status: { type: 'string', enum: ['closed', 'close-failed', 'blocked'] },
    summary: { type: 'string' },
    commitSha: { type: 'string' },
    blockerReason: { type: 'string' },
  },
  required: ['issueNumber', 'status', 'summary'],
}

function normalizeIssues(raw) {
  if (raw == null) return []
  const toNum = v => Number(String(v).trim().replace(/^#/, ''))
  if (Array.isArray(raw)) return raw.map(toNum).filter(Number.isFinite)
  if (typeof raw === 'number') return [raw]
  if (typeof raw !== 'string') return []

  const issues = []
  for (const part of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    const range = part.match(/^#?(\d+)\s*(?:-|~|to)\s*#?(\d+)$/i)
    if (range) {
      const [start, end] = [Number(range[1]), Number(range[2])]
      for (let n = start; n <= end; n++) issues.push(n)
    } else {
      const n = toNum(part)
      if (Number.isFinite(n)) issues.push(n)
    }
  }
  return issues
}

function clarificationFor(clarifications, issueNumber) {
  if (!clarifications) return null
  return clarifications[issueNumber] ?? clarifications[String(issueNumber)] ?? null
}

function tddPrompt(issueNumber, repoPath, clarification) {
  const clarificationBlock = clarification
    ? `\nThe user already answered a question a previous run stopped on for this issue: "${clarification}". Use that answer directly, don't ask it again.\n`
    : ''
  return `
Repo: \`${repoPath}\`. Run every command below with that as the working directory.

Issue #${issueNumber} in this repo.

First check whether it's already closed: \`gh issue view ${issueNumber} --json state -q .state\`. If it says CLOSED, report status "skipped-already-closed" immediately and stop — do nothing else, this issue was handled in an earlier run of this batch.

If it's open, run /mattpocock-skills:tdd against issue #${issueNumber} — read the issue body first (\`gh issue view ${issueNumber}\`) as the spec for the work, then follow the TDD skill's red-green loop to implement it.
${clarificationBlock}
The TDD skill requires agreeing test seams with the user before writing tests ("What's the public interface, and which seams should we test?"). This is an unattended batch run — no human is available to answer mid-flight. If the skill would normally ask the user a question (seam confirmation, an ambiguous design choice, a multiple-choice decision) and you have no clarification for it above, do NOT guess or pick an option yourself. Stop right there, report status "needs-input" with the exact question word for word in the \`question\` field, and leave the tree exactly as it was — no test, no implementation code.

If the TDD loop hits something genuinely broken — can't get a red test, contradictory requirements, a missing dependency — report status "blocked" with \`blockerReason\`.

If you complete the loop cleanly, report status "implemented" and \`codeFilesTouched\`: true if any source/code file changed, false if this issue turned out to be a docs-only change.

Leave all changes uncommitted in the working tree — a later step in this batch reviews and commits them.
`.trim()
}

function reviewPrompt(issueNumber, repoPath) {
  return `
Repo: \`${repoPath}\`. Run every command below with that as the working directory.

Issue #${issueNumber}. There are uncommitted changes in the working tree from the TDD implementation for this issue — review them, do not commit them.

/mattpocock-skills:code-review unstaged with /sgche:marc-andreessen-persona skill for issue #${issueNumber} — the fixed point is HEAD, so the diff under review is exactly the uncommitted changes. Pull the issue body (\`gh issue view ${issueNumber}\`) as the Spec source if code-review's own spec lookup doesn't find one.

Report \`hasHardIssues\`: true only for a genuine hard/documented-standards violation on the Standards axis, or a requirement the Spec axis found missing or implemented wrong — not for baseline-smell judgement calls alone. Put the full Standards + Spec report verbatim in \`report\` — the next step only sees what you put there, not this conversation.
`.trim()
}

function fixPrompt(issueNumber, repoPath, report) {
  return `
Repo: \`${repoPath}\`. Run every command below with that as the working directory.

Issue #${issueNumber}. A code review just ran against the uncommitted changes for this issue and found hard issues. Fix them, and only them — don't refactor or touch anything the report didn't flag.

Report:
"""
${report}
"""

Leave changes uncommitted when done — a later step commits. Report status "fixed", or "blocked" with \`blockerReason\` if a finding can't be resolved without a decision only the user can make.
`.trim()
}

function closePrompt(issueNumber, repoPath) {
  return `
Repo: \`${repoPath}\`. Run every command below with that as the working directory.

Issue #${issueNumber}. Implementation and any required fixes are done and sitting uncommitted in the working tree.

Commit them — conventional commit format, message describing what shipped for #${issueNumber}. Do not merge, do not open a PR: this batch has no worktree or per-issue branch, the commit lands directly on whatever branch is currently checked out.

Then run /sgche:close-issue for #${issueNumber} — treat the commit you just made as the resolving commit on the direct-commit path (there's no PR).

Report status "closed" with \`commitSha\` once the issue is closed on GitHub, "close-failed" if the commit landed but the close call itself failed for a transient GitHub-side reason, or "blocked" if something is actually wrong.
`.trim()
}

phase('Process tickets')

// The Workflow tool's transport sometimes delivers `args` as a JSON-encoded string
// rather than the object it was called with — normalize defensively either way.
const runArgs = typeof args === 'string' ? JSON.parse(args) : args

const issues = normalizeIssues(runArgs?.issues)
if (!runArgs?.repoPath || !issues.length) {
  throw new Error(
    `resolve-tickets requires args: { repoPath: string, issues: number[] | string, clarifications?: Record<number, string> }.\n` +
    `repoPath must be an absolute path, already checked out on the default branch.\n` +
    `issues accepts "1,2,3", "1-3", "1~3", "#1~#3".\n` +
    `Got: ${JSON.stringify(runArgs)}`
  )
}

const results = []
let pendingQuestion = null
let stoppedEarly = false

for (const issueNumber of issues) {
  const phaseTitle = `Issue #${issueNumber}`
  phase(phaseTitle)

  const tdd = await agent(
    tddPrompt(issueNumber, runArgs.repoPath, clarificationFor(runArgs?.clarifications, issueNumber)),
    { label: `tdd-${issueNumber}`, phase: phaseTitle, agentType: 'general-purpose', schema: TDD_SCHEMA }
  )
  results.push({ issueNumber, step: 'tdd', result: tdd })

  if (!tdd) {
    log(`issue #${issueNumber}: tdd step produced no result, stopping batch`)
    stoppedEarly = true
    break
  }
  if (tdd.status === 'skipped-already-closed') {
    log(`issue #${issueNumber}: already closed, skipped`)
    continue
  }
  if (tdd.status === 'needs-input') {
    log(`issue #${issueNumber}: needs input — ${tdd.question}`)
    pendingQuestion = { issueNumber, question: tdd.question }
    stoppedEarly = true
    break
  }
  if (tdd.status === 'blocked') {
    log(`issue #${issueNumber}: blocked in tdd — ${tdd.blockerReason ?? tdd.summary}`)
    stoppedEarly = true
    break
  }

  let hasHardIssues = false
  let reviewReport = ''
  if (tdd.codeFilesTouched) {
    const review = await agent(
      reviewPrompt(issueNumber, runArgs.repoPath),
      { label: `review-${issueNumber}`, phase: phaseTitle, agentType: 'general-purpose', schema: REVIEW_SCHEMA }
    )
    results.push({ issueNumber, step: 'review', result: review })
    if (!review) {
      log(`issue #${issueNumber}: review step produced no result, stopping batch`)
      stoppedEarly = true
      break
    }
    hasHardIssues = review.hasHardIssues
    reviewReport = review.report
    log(`issue #${issueNumber}: review — ${hasHardIssues ? 'hard issues found' : 'no hard issues'}`)
  } else {
    log(`issue #${issueNumber}: docs-only change, skipping code review`)
  }

  if (hasHardIssues) {
    const fix = await agent(
      fixPrompt(issueNumber, runArgs.repoPath, reviewReport),
      { label: `fix-${issueNumber}`, phase: phaseTitle, agentType: 'general-purpose', schema: FIX_SCHEMA }
    )
    results.push({ issueNumber, step: 'fix', result: fix })
    if (!fix || fix.status !== 'fixed') {
      log(`issue #${issueNumber}: blocked in fix — ${fix?.blockerReason ?? fix?.summary ?? 'no result'}`)
      stoppedEarly = true
      break
    }
  }

  const close = await agent(
    closePrompt(issueNumber, runArgs.repoPath),
    { label: `commit-close-${issueNumber}`, phase: phaseTitle, agentType: 'general-purpose', schema: CLOSE_SCHEMA }
  )
  results.push({ issueNumber, step: 'commit-close', result: close })

  if (!close || close.status !== 'closed') {
    log(`issue #${issueNumber}: did not close cleanly — ${close?.blockerReason ?? close?.summary ?? 'no result'}, stopping batch`)
    stoppedEarly = true
    break
  }
  log(`issue #${issueNumber}: closed (${close.commitSha ?? 'no sha reported'})`)
}

const closed = results.filter(r => r.step === 'commit-close' && r.result?.status === 'closed').map(r => r.issueNumber)

return { closed, results, pendingQuestion, stoppedEarly }
