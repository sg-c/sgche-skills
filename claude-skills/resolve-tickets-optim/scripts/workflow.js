export const meta = {
  name: 'resolve-tickets-optim',
  description: 'Fast, dependency-aware batch GitHub issue resolution. Uses isolated worktrees, command-budgeted TDD, review, conventional commits, serialized integration, and issue closure.',
  phases: [
    { title: 'Plan DAG', detail: 'extract explicit GitHub issue dependencies' },
    { title: 'Process tickets', detail: 'parallel optimized TDD, review, fix, and commit in isolated worktrees' },
    { title: 'Integrate', detail: 'serialize merges and GitHub issue closure', model: 'sonnet' },
  ],
}

const dagSchema = {
  type: 'object', properties: {
    nodes: { type: 'array', items: { type: 'object', properties: {
      issueNumber: { type: 'number' }, blockedBy: { type: 'array', items: { type: 'number' } },
      externalBlockers: { type: 'array', items: { type: 'number' } }, evidence: { type: 'string' },
    }, required: ['issueNumber', 'blockedBy'] } }, summary: { type: 'string' },
  }, required: ['nodes', 'summary'],
}
const tddSchema = {
  type: 'object', properties: {
    issueNumber: { type: 'number' }, status: { type: 'string', enum: ['skipped-already-closed', 'already-committed', 'implemented', 'needs-input', 'blocked'] },
    summary: { type: 'string' }, question: { type: 'string' }, codeFilesTouched: { type: 'boolean' }, commitSha: { type: 'string' }, blockerReason: { type: 'string' },
  }, required: ['issueNumber', 'status', 'summary'],
}
const reviewSchema = { type: 'object', properties: { issueNumber: { type: 'number' }, hasHardIssues: { type: 'boolean' }, report: { type: 'string' }, summary: { type: 'string' } }, required: ['issueNumber', 'hasHardIssues', 'report', 'summary'] }
const fixSchema = { type: 'object', properties: { issueNumber: { type: 'number' }, status: { type: 'string', enum: ['fixed', 'blocked'] }, summary: { type: 'string' }, blockerReason: { type: 'string' } }, required: ['issueNumber', 'status', 'summary'] }
const commitSchema = { type: 'object', properties: { issueNumber: { type: 'number' }, status: { type: 'string', enum: ['committed', 'blocked'] }, summary: { type: 'string' }, commitSha: { type: 'string' }, blockerReason: { type: 'string' } }, required: ['issueNumber', 'status', 'summary'] }
const integrateSchema = {
  type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: {
    issueNumber: { type: 'number' }, status: { type: 'string', enum: ['closed', 'merge-conflict', 'close-failed', 'blocked'] }, mergedSha: { type: 'string' }, reason: { type: 'string' },
  }, required: ['issueNumber', 'status'] } }, summary: { type: 'string' } }, required: ['results', 'summary'],
}

function overrides(options, runArgs) {
  if (runArgs.model != null) options.model = runArgs.model
  if (runArgs.effort != null) options.effort = runArgs.effort
  return options
}

function normalizeIssues(raw) {
  if (Array.isArray(raw)) return raw.map(value => Number(String(value).replace(/^#/, ''))).filter(Number.isFinite)
  if (typeof raw === 'number') return [raw]
  if (typeof raw !== 'string') return []
  return raw.split(',').flatMap(part => {
    const match = part.trim().match(/^#?(\d+)\s*(?:-|~|to)\s*#?(\d+)$/i)
    if (match) return Array.from({ length: Number(match[2]) - Number(match[1]) + 1 }, (_, index) => Number(match[1]) + index)
    const number = Number(part.trim().replace(/^#/, ''))
    return Number.isFinite(number) ? [number] : []
  })
}

function levelsFor(issues, blockedBy) {
  const remaining = new Set(issues); const levels = []
  while (remaining.size) {
    const ready = issues.filter(number => remaining.has(number) && blockedBy.get(number).every(blocker => !remaining.has(blocker)))
    if (!ready.length) return { levels, cyclic: true }
    ready.forEach(number => remaining.delete(number)); levels.push(ready)
  }
  return { levels, cyclic: false }
}

function dagPrompt(issues, repoPath) {
  return `Repo: \`${repoPath}\`. Plan dependency DAG for ${issues.map(number => `#${number}`).join(', ')}.

Read each issue and comments with \`gh issue view <n> --comments\`; inspect native parent/sub-issue relationships if API supports them. Batch independent \`gh\` reads in parallel. Extract only explicit "blocked by", "depends on", "requires", "after", reverse "blocks", and parent/sub-issue relationships. Never infer dependency from overlap or number order.

Return every requested issue exactly once. \`blockedBy\`: in-batch prerequisites only. \`externalBlockers\`: open external prerequisites only; check state. \`evidence\`: one short source line or "none". Summarize parallel levels.`
}

function tddPrompt(issue, repoPath, worktree, branch, clarification) {
  return `Issue #${issue}; repo \`${repoPath}\`.

First, and alone, run \`gh issue view ${issue} --json state -q .state\` from \`${repoPath}\`. If CLOSED, report \`skipped-already-closed\` immediately; do not create a worktree.

If OPEN, use ONE shell invocation to: create \`${repoPath}/.claude/worktrees\` (stop blocked if mkdir fails); inspect existing worktree/branch; create \`${worktree}\` on \`${branch}\` only when absent; then inspect commits ahead of \`${repoPath}\` and worktree status. Reuse existing worktree. If clean and already committed ahead, report \`already-committed\` with HEAD SHA. From then on, perform all work only in \`${worktree}\`.

Read \`gh issue view ${issue}\` then use /mattpocock-skills:tdd. ${clarification ? `User clarification: "${clarification}". Use it directly.` : 'If TDD needs seam confirmation or a user-only decision, make no edits and report needs-input with exact question.'}

## Command budget

Tool calls are high-latency. Keep TDD rigorous, but minimize round trips:
- Map source, declarations, fakes, and existing target tests through batched contextual reads (\`rg -n -C\`, bounded slices, or parallel independent reads). Do not serially browse files or re-read after a successful edit.
- Use cohesive patches: one complete test slice per edit; one complete implementation slice per edit. Never split imports, test body, and source arm into micro-edits unless a failed command proves need.
- Start from supplied acceptance seams. Put seams exercising same public path in same focused test file/change, then run focused red once. Implement complete behavior, then run focused green once. Add another red-green cycle only for a new independently failing behavior.
- Tests must isolate and release global state, queues, files, DB connections, and registry mutations. Use monkeypatch/fixtures instead of persistent registration.
- Before unrelated-failure forensics: temporarily stash (use -u when needed), rerun affected test clean, restore stash.
- For narrow changes: touched tests plus direct consumers/importers, not full suite. Use full suite only for shared/wide public changes.
- Run independent lint/type checks concurrently, or in one non-short-circuit command; do not hide type errors behind \`ruff && ty\`.

If blocked, report blockerReason. On success report implemented + codeFilesTouched. Leave changes uncommitted for review/commit.`
}

function reviewPrompt(issue, worktree) {
  return `Worktree: \`${worktree}\`; issue #${issue}. Review only unstaged TDD changes; do not commit. Run /mattpocock-skills:code-review unstaged with /sgche:marc-andreessen-persona. Read \`gh issue view ${issue}\` for spec. Report hard issues only for documented standards violations or missed/wrong requirements; include full report for fix step.`
}
function fixPrompt(issue, worktree, report) {
  return `Worktree: \`${worktree}\`; issue #${issue}. Fix only hard review findings below. Use cohesive patch and targeted validation; leave uncommitted. Report fixed or blocked.\n\n${report}`
}
function commitPrompt(issue, worktree, branch) {
  return `Worktree: \`${worktree}\`; branch \`${branch}\`; issue #${issue}. Commit all implementation with one conventional commit. Do not run validation, merge, close issue, or touch another worktree. Report committed SHA or blocked.`
}
function integratePrompt(repoPath, entries) {
  const list = entries.map(entry => `#${entry.issue}: \`${entry.branch}\` / \`${entry.worktree}\` (${entry.commitSha ?? 'HEAD'})`).join('\n')
  return `Repo: \`${repoPath}\`. Serialized integration; process each entry in order:\n${list}\n\nFor each branch: \`git merge --no-edit\`; on conflict abort and report merge-conflict, leaving branch/worktree. Then confirm issue state; if open, comment \`Resolved by <sha>. <summary>.\` and close it. Remove worktree and delete branch only after successful merge; never force removal. Report every entry. No tests.`
}

phase('Plan DAG')
const runArgs = typeof args === 'string' ? JSON.parse(args) : args
const issues = normalizeIssues(runArgs?.issues)
if (!runArgs?.repoPath || !issues.length || !String(runArgs.repoPath).startsWith('/')) throw new Error('resolve-tickets-optim requires absolute repoPath and non-empty issues.')
const repoPath = runArgs.repoPath.replace(/\/+$/, '')
const worktreeFor = issue => `${repoPath}/.claude/worktrees/issue-${issue}`
const branchFor = issue => `resolve-tickets-optim/issue-${issue}`
const inBatch = new Set(issues)
const dag = await agent(dagPrompt(issues, repoPath), overrides({ label: 'plan-dag', phase: 'Plan DAG', agentType: 'general-purpose', schema: dagSchema }, runArgs))
const nodes = dag?.nodes ?? []
if (issues.some(issue => !nodes.some(node => node.issueNumber === issue))) throw new Error('Planner omitted issue node; clarify GitHub dependencies and rerun.')
const blockedBy = new Map(issues.map(issue => [issue, []]))
const external = new Map(issues.map(issue => [issue, []]))
for (const node of nodes) if (inBatch.has(node.issueNumber)) {
  blockedBy.set(node.issueNumber, [...new Set((node.blockedBy ?? []).filter(blocker => inBatch.has(blocker) && blocker !== node.issueNumber))])
  external.set(node.issueNumber, [...new Set(node.externalBlockers ?? [])])
}
const { levels, cyclic } = levelsFor(issues, blockedBy)
if (cyclic) throw new Error('Dependency cycle detected; clarify GitHub issue relationships and rerun.')

const results = []; const pendingQuestions = []; const failed = new Set(); const closed = []
async function runIssue(issue) {
  const worktree = worktreeFor(issue); const branch = branchFor(issue)
  const step = (label, schema) => overrides({ label: `${label}-${issue}`, phase: `Issue #${issue}`, agentType: 'general-purpose', schema }, runArgs)
  const clarification = runArgs.clarifications?.[issue] ?? runArgs.clarifications?.[String(issue)]
  const tdd = await agent(tddPrompt(issue, repoPath, worktree, branch, clarification), step('tdd', tddSchema)); results.push({ issue, step: 'tdd', result: tdd })
  if (!tdd || ['needs-input', 'blocked'].includes(tdd.status)) { failed.add(issue); if (tdd?.status === 'needs-input') pendingQuestions.push({ issueNumber: issue, question: tdd.question }); return null }
  if (tdd.status === 'skipped-already-closed') return null
  if (tdd.status === 'already-committed') return { issue, worktree, branch, commitSha: tdd.commitSha }
  if (tdd.codeFilesTouched) {
    const review = await agent(reviewPrompt(issue, worktree), step('review', reviewSchema)); results.push({ issue, step: 'review', result: review })
    if (!review) { failed.add(issue); return null }
    if (review.hasHardIssues) {
      const fix = await agent(fixPrompt(issue, worktree, review.report), step('fix', fixSchema)); results.push({ issue, step: 'fix', result: fix })
      if (fix?.status !== 'fixed') { failed.add(issue); return null }
    }
  }
  const commit = await agent(commitPrompt(issue, worktree, branch), { ...step('commit', commitSchema), model: 'sonnet' }); results.push({ issue, step: 'commit', result: commit })
  if (commit?.status !== 'committed') { failed.add(issue); return null }
  return { issue, worktree, branch, commitSha: commit.commitSha }
}

for (const [index, level] of levels.entries()) {
  const runnable = level.filter(issue => {
    const dead = blockedBy.get(issue).some(blocker => failed.has(blocker)); const outside = external.get(issue)
    if (dead || outside.length) { results.push({ issue, step: 'skipped', result: { status: dead ? 'skipped-blocked-by-failure' : 'skipped-external-blocker', blockers: dead ? blockedBy.get(issue) : outside } }); failed.add(issue); return false }
    return true
  })
  const committed = (await parallel(runnable.map(issue => () => runIssue(issue)))).filter(Boolean)
  if (!committed.length) continue
  const integration = await agent(integratePrompt(repoPath, committed), { ...overrides({ label: `integrate-level-${index + 1}`, phase: 'Integrate', agentType: 'general-purpose', schema: integrateSchema }, runArgs), model: 'sonnet' })
  results.push({ level: index + 1, step: 'integrate', result: integration })
  const reported = new Set()
  for (const result of integration?.results ?? []) { reported.add(result.issueNumber); if (result.status === 'closed') closed.push(result.issueNumber); else failed.add(result.issueNumber) }
  committed.filter(entry => !reported.has(entry.issue)).forEach(entry => failed.add(entry.issue))
}

return { closed, levels, pendingQuestions, unresolved: issues.filter(issue => !closed.includes(issue)), results }
