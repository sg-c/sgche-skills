export const meta = {
  name: 'resolve-tickets',
  description: 'TDD-implement, review, fix, commit, integrate, and close a batch of GitHub issues. A planning agent reads each issue\'s blocked-by/blocking links to build a dependency DAG, then independent issues run in parallel (one git worktree each) while dependent ones wait for their blockers to land. Each step runs in its own fresh subagent. Stops an issue and surfaces the question verbatim if a step needs a human decision. Already-closed issues are skipped on resume.',
  phases: [
    { title: 'Plan DAG', detail: 'read every issue, extract blocked-by/blocking links, build the dependency graph' },
    { title: 'Process tickets', detail: 'one dynamic phase per issue — tdd, review (optional), fix (optional), commit — issues in the same DAG level run in parallel, each in its own worktree' },
    { title: 'Integrate', detail: 'per level, serially merge each issue branch into the base branch, then comment + close the issue', model: 'sonnet' },
  ],
}

// repoPath must already be checked out on whichever branch/worktree the caller wants the
// commits on — default branch, feature branch, any. No PR/merge-request involved: each issue
// is implemented on its own throwaway worktree/branch, then merged into that base branch by
// the Integrate step and closed against the resulting commit. repoPath is passed explicitly
// (not inherited from any shell cwd) because each agent() call is a fresh subagent process.

// args shape: { repoPath: string, issues: number[] | string, clarifications?: Record<number|string, string>, model?: string, effort?: string }
// issues accepts: [42, 43] | "42,43" | "42-44" | "42~44" | "#42~#44"
// clarifications answers a question a previous run stopped on, keyed by issue number, e.g.
// { repoPath: "/abs/path/to/repo", issues: [42, 43], clarifications: { 42: "Test at the HTTP handler seam, not the service." } }
// model / effort are both optional and independent — either, both, or neither may be set. When
// present they override the agent's model / reasoning effort on every step; when absent that
// opt is omitted so the agent inherits the session default.

// Merge optional model/effort into an agent() opts object, adding each key only when the
// corresponding arg is set (they may be specified independently — one, both, or neither).
function withOverrides(opts, runArgs) {
  const merged = { ...opts }
  if (runArgs?.model != null) merged.model = runArgs.model
  if (runArgs?.effort != null) merged.effort = runArgs.effort
  return merged
}

const DAG_SCHEMA = {
  type: 'object',
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          issueNumber: { type: 'number' },
          blockedBy: { type: 'array', items: { type: 'number' } },
          externalBlockers: { type: 'array', items: { type: 'number' } },
          evidence: { type: 'string' },
        },
        required: ['issueNumber', 'blockedBy'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['nodes', 'summary'],
}

const TDD_SCHEMA = {
  type: 'object',
  properties: {
    issueNumber: { type: 'number' },
    status: { type: 'string', enum: ['skipped-already-closed', 'already-committed', 'implemented', 'needs-input', 'blocked'] },
    summary: { type: 'string' },
    question: { type: 'string' },
    codeFilesTouched: { type: 'boolean' },
    commitSha: { type: 'string' },
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

const COMMIT_SCHEMA = {
  type: 'object',
  properties: {
    issueNumber: { type: 'number' },
    status: { type: 'string', enum: ['committed', 'blocked'] },
    summary: { type: 'string' },
    commitSha: { type: 'string' },
    blockerReason: { type: 'string' },
  },
  required: ['issueNumber', 'status', 'summary'],
}

const INTEGRATE_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          issueNumber: { type: 'number' },
          status: { type: 'string', enum: ['closed', 'merge-conflict', 'close-failed', 'blocked'] },
          mergedSha: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['issueNumber', 'status'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['results', 'summary'],
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

// Kahn's algorithm over the in-batch subgraph. Returns { levels, blockedBy, cyclic }: every
// issue in levels[i] depends only on issues in earlier levels, so a level can run wholly in
// parallel. Edges pointing outside the batch are dropped by the caller before this runs.
// A cycle (or any leftover node) means the issue relationships need human clarification.
function buildLevels(issues, blockedBy) {
  const remaining = new Set(issues)
  const levels = []
  while (remaining.size) {
    const ready = issues.filter(n => remaining.has(n) && blockedBy.get(n).every(b => !remaining.has(b)))
    if (!ready.length) {
      const stuck = issues.filter(n => remaining.has(n))
      return { levels: [...levels, ...stuck.map(n => [n])], cyclic: true }
    }
    ready.forEach(n => remaining.delete(n))
    levels.push(ready)
  }
  return { levels, cyclic: false }
}

function dagPrompt(issues, repoPath) {
  return `
Repo: \`${repoPath}\`. Run every command below with that as the working directory.

Work out the dependency order for this batch of GitHub issues: ${issues.map(n => `#${n}`).join(', ')}.

For each issue, read the issue itself and its comments (\`gh issue view <n> --comments\`). Also check GitHub's native relationships: sub-issue parent/child links (\`gh issue view <n> --json title,body,parent,subIssues\` if the fields are supported, otherwise \`gh api repos/{owner}/{repo}/issues/<n>/sub_issues\`), and any linked-issue/"blocked by" info the API exposes. If a call errors because the field or endpoint isn't available, ignore it and move on — don't retry it for every issue.

Extract only EXPLICIT dependency statements. Recognise phrasings like "blocked by #N", "depends on #N", "requires #N", "after #N", "blocks #N" / "blocking #N" (that's the reverse edge — #N is blocked by this issue), and parent/sub-issue links (a parent issue is blocked by its sub-issues). Do NOT invent dependencies from vibes: two issues touching the same area of the code is NOT a dependency, and neither is issue number order.

Report one node per issue in the batch, every one of ${issues.map(n => `#${n}`).join(', ')} exactly once:
- \`blockedBy\`: issue numbers **from this batch** that must be fully done first. Omit self-references and anything outside the batch.
- \`externalBlockers\`: blockers that are NOT in this batch. Include a number here only if that issue is still OPEN (check it — a closed blocker is already satisfied and should be left out entirely).
- \`evidence\`: one short line quoting where each dependency came from, or "none" if the issue has no dependencies.

\`summary\`: a couple of lines describing the resulting shape (what can run in parallel, what has to wait).
`.trim()
}

function worktreeSetupBlock(issueNumber, repoPath, worktree, branch) {
  return `
This issue gets its own git worktree so it can run in parallel with other issues in the batch, under \`${repoPath}/.claude/worktrees/\`. Set it up before doing any work:

\`\`\`
mkdir -p ${repoPath}/.claude/worktrees
git -C ${repoPath} worktree add ${worktree} -b ${branch} HEAD
\`\`\`

If \`mkdir\` fails (permissions, path collision with an existing file, etc.), report status "blocked" with the failure in \`blockerReason\` and stop — do not attempt \`git worktree add\` without it.

If that worktree or branch already exists (a previous run of this batch created it), reuse it instead of recreating it — do not delete it, and do not redo work that is already committed on ${branch}. Check with \`git -C ${repoPath} worktree list\` and \`git -C ${worktree} log --oneline HEAD ^$(git -C ${repoPath} rev-parse HEAD)\` first. If that shows one or more commits and \`git -C ${worktree} status --short\` is clean, report status "already-committed" with \`commitSha\` set to \`git -C ${worktree} rev-parse HEAD\` and stop — a later Integrate step will merge and close it.

From then on, \`${worktree}\` is your working directory for ALL work on issue #${issueNumber} — read, edit, test, and run git there, never in \`${repoPath}\`. Other agents are concurrently editing other worktrees of the same repo; touching \`${repoPath}\`'s working tree would corrupt their work.
`.trim()
}

function tddPrompt(issueNumber, repoPath, worktree, branch, clarification) {
  const clarificationBlock = clarification
    ? `\nThe user already answered a question a previous run stopped on for this issue: "${clarification}". Use that answer directly, don't ask it again.\n`
    : ''
  return `
Issue #${issueNumber} in the repo at \`${repoPath}\`.

First check whether it's already closed: \`gh issue view ${issueNumber} --json state -q .state\` (run from \`${repoPath}\`). If it says CLOSED, report status "skipped-already-closed" immediately and stop — do nothing else, don't create a worktree, this issue was handled in an earlier run of this batch.

${worktreeSetupBlock(issueNumber, repoPath, worktree, branch)}

Then run /mattpocock-skills:tdd against issue #${issueNumber} — read the issue body first (\`gh issue view ${issueNumber}\`) as the spec for the work, then follow the TDD skill's red-green loop to implement it inside \`${worktree}\`.
${clarificationBlock}
The TDD skill requires agreeing test seams with the user before writing tests ("What's the public interface, and which seams should we test?"). This is an unattended batch run — no human is available to answer mid-flight. If the skill would normally ask the user a question (seam confirmation, an ambiguous design choice, a multiple-choice decision) and you have no clarification for it above, do NOT guess or pick an option yourself. Stop right there, report status "needs-input" with the exact question word for word in the \`question\` field, and leave the tree exactly as it was — no test, no implementation code.

Before doing single-test forensics on a failure that looks unrelated to this issue, cheaply rule out "pre-existing" first: \`git stash\` (add \`-u\` if untracked files are involved), rerun the affected test file, \`git stash pop\` — one ~10s round trip beats minutes of investigation.

Once red-green loop done, skip full-suite re-run if scope narrow and \`ruff\`/\`ty\` (or repo's lint/type-check equivalent) plus scoped tests already pass — run only files touched by this issue plus files importing the changed symbol, not whole suite. Full suite costs minutes for a batch step that repeats per issue; PR hook re-verifies everything later anyway. Wide-blast-radius change (shared util, public interface many files depend on) — full suite still worth it, use judgement.

If the TDD loop hits something genuinely broken — can't get a red test, contradictory requirements, a missing dependency — report status "blocked" with \`blockerReason\`.

If you complete the loop cleanly, report status "implemented" and \`codeFilesTouched\`: true if any source/code file changed, false if this issue turned out to be a docs-only change.

Leave all changes uncommitted in \`${worktree}\` — a later step in this batch reviews and commits them.
`.trim()
}

function reviewPrompt(issueNumber, worktree) {
  return `
Repo worktree: \`${worktree}\`. Run every command below with that as the working directory — it is this issue's dedicated worktree; other agents are working in sibling worktrees of the same repo, so stay inside this one.

Issue #${issueNumber}. There are uncommitted changes in this worktree from the TDD implementation for this issue — review them, do not commit them.

/mattpocock-skills:code-review unstaged with /sgche:marc-andreessen-persona skill for issue #${issueNumber} — the fixed point is HEAD, so the diff under review is exactly the uncommitted changes. Pull the issue body (\`gh issue view ${issueNumber}\`) as the Spec source if code-review's own spec lookup doesn't find one.

Report \`hasHardIssues\`: true only for a genuine hard/documented-standards violation on the Standards axis, or a requirement the Spec axis found missing or implemented wrong — not for baseline-smell judgement calls alone. Put the full Standards + Spec report verbatim in \`report\` — the next step only sees what you put there, not this conversation.
`.trim()
}

function fixPrompt(issueNumber, worktree, report) {
  return `
Repo worktree: \`${worktree}\`. Run every command below with that as the working directory — it is this issue's dedicated worktree; stay inside it.

Issue #${issueNumber}. A code review just ran against the uncommitted changes for this issue and found hard issues. Fix them, and only them — don't refactor or touch anything the report didn't flag.

Report:
"""
${report}
"""

Leave changes uncommitted when done — a later step commits. Report status "fixed", or "blocked" with \`blockerReason\` if a finding can't be resolved without a decision only the user can make.
`.trim()
}

function commitPrompt(issueNumber, worktree, branch) {
  return `
Repo worktree: \`${worktree}\` (on branch \`${branch}\`). Run every command below with that as the working directory — it is this issue's dedicated worktree; stay inside it.

Issue #${issueNumber}. Implementation and any required fixes are done and sitting uncommitted in this worktree.

Do not run tests, lint, or type checks in this step — the tdd step already covered testing, and a PR hook re-verifies later. This step's only job is the commit; keep it single-responsibility and fast.

Commit everything in this worktree — conventional commit format, message describing what shipped for #${issueNumber}. Commit on \`${branch}\` only. Do NOT merge, do NOT close the issue, do NOT open a PR, do NOT touch any other branch or worktree — a later serialized step merges this branch into the base branch and closes the issue.

Report status "committed" with \`commitSha\`, or "blocked" with \`blockerReason\` if there is nothing to commit or the commit fails.
`.trim()
}

function integratePrompt(repoPath, entries) {
  const list = entries
    .map(e => `- #${e.issueNumber}: branch \`${e.branch}\`, worktree \`${e.worktree}\`, commit \`${e.commitSha ?? 'unknown — resolve with git log'}\``)
    .join('\n')
  return `
Repo: \`${repoPath}\`. Run every command below with that as the working directory. This step is serialized — you are the only agent touching \`${repoPath}\` right now.

These issues have been implemented and committed on their own branches in their own worktrees:

${list}

Process them **one at a time, in the order listed**. For each:

1. Merge it into the branch currently checked out in \`${repoPath}\` (do NOT switch branches, do NOT rebase — rebasing would rewrite the commit sha that gets reported on the issue):
   \`git -C ${repoPath} merge --no-edit <branch>\`
   If it conflicts, run \`git -C ${repoPath} merge --abort\`, report that issue as \`merge-conflict\` with the conflicting paths in \`reason\`, leave its worktree and branch in place for the user to fix by hand, and carry on with the next issue.
2. Note the resulting sha of the issue's work on the base branch (\`git -C ${repoPath} rev-parse <branch>\`).
3. Confirm the issue is still open (\`gh issue view <n> --json state -q .state\`). If it is already CLOSED, skip to step 5 and report \`closed\`.
4. \`gh issue comment <n> --body "Resolved by <sha>. <one-line summary of what shipped>."\` then \`gh issue close <n> --reason completed\`. If the comment or close call fails for a transient GitHub-side reason after the merge already landed, report \`close-failed\` with the reason.
5. Clean up the merged branch's scaffolding: \`git -C ${repoPath} worktree remove <worktree>\` then \`git -C ${repoPath} branch -d <branch>\`. If removal complains about untracked or modified files, leave the worktree alone and mention it in \`reason\` — do not force-remove work.

Report one entry per issue with \`mergedSha\` for the ones that landed. Do not run tests, lint, or type checks — this step is merge + close only.
`.trim()
}

phase('Plan DAG')

// The Workflow tool's transport sometimes delivers `args` as a JSON-encoded string
// rather than the object it was called with — normalize defensively either way.
const runArgs = typeof args === 'string' ? JSON.parse(args) : args

const issues = normalizeIssues(runArgs?.issues)
if (!runArgs?.repoPath || !issues.length) {
  throw new Error(
    `resolve-tickets requires args: { repoPath: string, issues: number[] | string, clarifications?: Record<number, string> }.\n` +
    `repoPath must be an absolute path, already checked out on whichever branch you want the commits on.\n` +
    `issues accepts "1,2,3", "1-3", "1~3", "#1~#3".\n` +
    `Got: ${JSON.stringify(runArgs)}`
  )
}

const repoPath = runArgs.repoPath.replace(/\/+$/, '')
const worktreeFor = n => `${repoPath}/.claude/worktrees/issue-${n}`
const branchFor = n => `resolve-tickets/issue-${n}`

const inBatch = new Set(issues)
const blockedBy = new Map(issues.map(n => [n, []]))
const externalBlockers = new Map(issues.map(n => [n, []]))

const dag = await agent(
  dagPrompt(issues, repoPath),
  withOverrides({ label: 'plan-dag', phase: 'Plan DAG', agentType: 'general-purpose', schema: DAG_SCHEMA }, runArgs)
)

if (!dag) {
  throw new Error(
    'resolve-tickets could not build the issue dependency DAG: the planning agent produced no result. ' +
    'Update the GitHub issues so their blocked-by/blocking relationships are explicit, then rerun.'
  )
} else {
  const seen = new Set((dag.nodes ?? []).map(node => node.issueNumber).filter(n => inBatch.has(n)))
  const missing = issues.filter(n => !seen.has(n))
  if (missing.length) {
    throw new Error(
      `resolve-tickets could not build the issue dependency DAG: planner omitted ${missing.map(n => `#${n}`).join(', ')}. ` +
      `Update the GitHub issues so their blocked-by/blocking relationships are explicit, then rerun.`
    )
  }
  for (const node of dag.nodes ?? []) {
    if (!inBatch.has(node.issueNumber)) continue
    const deps = [...new Set((node.blockedBy ?? []).filter(b => inBatch.has(b) && b !== node.issueNumber))]
    blockedBy.set(node.issueNumber, deps)
    externalBlockers.set(node.issueNumber, [...new Set(node.externalBlockers ?? [])])
  }
  log(`dependency graph: ${dag.summary}`)
}

const { levels, cyclic } = buildLevels(issues, blockedBy)
if (cyclic) {
  throw new Error(
    'resolve-tickets could not build the issue dependency DAG: dependency cycle detected. ' +
    'Update the GitHub issues to remove or clarify the circular blocked-by/blocking relationship, then rerun.'
  )
}
log(`execution plan: ${levels.map((lvl, i) => `level ${i + 1} [${lvl.map(n => `#${n}`).join(' ')}]`).join(' → ')}`)

const results = []
const pendingQuestions = []
// Issues that failed, needed input, or were skipped for a failed blocker. Levels run in
// dependency order, so checking direct blockers against this set is transitively correct.
const failed = new Set()

// Run one issue's tdd → review → fix → commit chain inside its own worktree. Returns the
// commit entry for the Integrate step, or null if the issue didn't reach a clean commit.
async function runIssue(issueNumber) {
  const phaseTitle = `Issue #${issueNumber}`
  const worktree = worktreeFor(issueNumber)
  const branch = branchFor(issueNumber)
  const step = (label, schema) =>
    withOverrides({ label: `${label}-${issueNumber}`, phase: phaseTitle, agentType: 'general-purpose', schema }, runArgs)

  const tdd = await agent(
    tddPrompt(issueNumber, repoPath, worktree, branch, clarificationFor(runArgs?.clarifications, issueNumber)),
    step('tdd', TDD_SCHEMA)
  )
  results.push({ issueNumber, step: 'tdd', result: tdd })

  if (!tdd) {
    log(`issue #${issueNumber}: tdd step produced no result`)
    failed.add(issueNumber)
    return null
  }
  if (tdd.status === 'skipped-already-closed') {
    log(`issue #${issueNumber}: already closed, skipped`)
    return null
  }
  if (tdd.status === 'already-committed') {
    log(`issue #${issueNumber}: existing committed branch found (${tdd.commitSha ?? 'no sha reported'}), sending to integration`)
    return { issueNumber, branch, worktree, commitSha: tdd.commitSha }
  }
  if (tdd.status === 'needs-input') {
    log(`issue #${issueNumber}: needs input — ${tdd.question}`)
    pendingQuestions.push({ issueNumber, question: tdd.question })
    failed.add(issueNumber)
    return null
  }
  if (tdd.status === 'blocked') {
    log(`issue #${issueNumber}: blocked in tdd — ${tdd.blockerReason ?? tdd.summary}`)
    failed.add(issueNumber)
    return null
  }

  let hasHardIssues = false
  let reviewReport = ''
  if (tdd.codeFilesTouched) {
    const review = await agent(reviewPrompt(issueNumber, worktree), step('review', REVIEW_SCHEMA))
    results.push({ issueNumber, step: 'review', result: review })
    if (!review) {
      log(`issue #${issueNumber}: review step produced no result`)
      failed.add(issueNumber)
      return null
    }
    hasHardIssues = review.hasHardIssues
    reviewReport = review.report
    log(`issue #${issueNumber}: review — ${hasHardIssues ? 'hard issues found' : 'no hard issues'}`)
  } else {
    log(`issue #${issueNumber}: docs-only change, skipping code review`)
  }

  if (hasHardIssues) {
    const fix = await agent(fixPrompt(issueNumber, worktree, reviewReport), step('fix', FIX_SCHEMA))
    results.push({ issueNumber, step: 'fix', result: fix })
    if (!fix || fix.status !== 'fixed') {
      log(`issue #${issueNumber}: blocked in fix — ${fix?.blockerReason ?? fix?.summary ?? 'no result'}`)
      failed.add(issueNumber)
      return null
    }
  }

  // committing is mechanical (stage + conventional commit message) — pinned to sonnet
  // regardless of runArgs.model; a bigger model buys nothing here.
  const commit = await agent(
    commitPrompt(issueNumber, worktree, branch),
    { ...step('commit', COMMIT_SCHEMA), model: 'sonnet' }
  )
  results.push({ issueNumber, step: 'commit', result: commit })

  if (!commit || commit.status !== 'committed') {
    log(`issue #${issueNumber}: did not commit cleanly — ${commit?.blockerReason ?? commit?.summary ?? 'no result'}`)
    failed.add(issueNumber)
    return null
  }
  log(`issue #${issueNumber}: committed (${commit.commitSha ?? 'no sha reported'})`)
  return { issueNumber, branch, worktree, commitSha: commit.commitSha }
}

const closed = []

for (const [index, level] of levels.entries()) {
  const runnable = []
  for (const issueNumber of level) {
    const deadBlockers = blockedBy.get(issueNumber).filter(b => failed.has(b))
    if (deadBlockers.length) {
      log(`issue #${issueNumber}: skipped — blocker(s) ${deadBlockers.map(b => `#${b}`).join(', ')} did not land`)
      results.push({
        issueNumber,
        step: 'skipped',
        result: { issueNumber, status: 'skipped-blocked-by-failure', blockedBy: deadBlockers },
      })
      failed.add(issueNumber)
      continue
    }
    const external = externalBlockers.get(issueNumber)
    if (external.length) {
      log(`issue #${issueNumber}: skipped — open blocker(s) outside this batch: ${external.map(b => `#${b}`).join(', ')}`)
      results.push({
        issueNumber,
        step: 'skipped',
        result: { issueNumber, status: 'skipped-external-blocker', externalBlockers: external },
      })
      failed.add(issueNumber)
      continue
    }
    runnable.push(issueNumber)
  }

  if (!runnable.length) continue

  log(`level ${index + 1}: running ${runnable.map(n => `#${n}`).join(', ')} in parallel`)
  const committed = (await parallel(runnable.map(n => () => runIssue(n)))).filter(Boolean)
  if (!committed.length) continue

  // Merging and closing is serialized on purpose: every issue in this level merges into the
  // same base branch in the shared repo checkout, so it cannot run concurrently.
  const integration = await agent(
    integratePrompt(repoPath, committed),
    { ...withOverrides({ label: `integrate-level-${index + 1}`, phase: 'Integrate', agentType: 'general-purpose', schema: INTEGRATE_SCHEMA }, runArgs), model: 'sonnet' }
  )
  results.push({ level: index + 1, step: 'integrate', result: integration })

  if (!integration) {
    log(`level ${index + 1}: integration produced no result — later levels that depend on it will be skipped`)
    committed.forEach(entry => failed.add(entry.issueNumber))
    continue
  }
  for (const entry of integration.results ?? []) {
    if (entry.status === 'closed') {
      closed.push(entry.issueNumber)
      log(`issue #${entry.issueNumber}: merged and closed (${entry.mergedSha ?? 'no sha reported'})`)
    } else {
      failed.add(entry.issueNumber)
      log(`issue #${entry.issueNumber}: ${entry.status} — ${entry.reason ?? 'no reason given'}`)
    }
  }
  // An issue the integration agent silently dropped never landed — treat it as failed.
  const reported = new Set((integration.results ?? []).map(r => r.issueNumber))
  committed.filter(e => !reported.has(e.issueNumber)).forEach(e => {
    failed.add(e.issueNumber)
    log(`issue #${e.issueNumber}: integration step returned no entry for it, treating as not landed`)
  })
}

return {
  closed,
  levels,
  pendingQuestions,
  unresolved: issues.filter(n => !closed.includes(n)),
  results,
}
