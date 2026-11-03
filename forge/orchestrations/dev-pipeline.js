// Use case 1: software delivery pipeline.
// plan -> plan review loop -> implementation (lead + sub-agents) -> parallel code review
// -> fix loop -> QA (with one fix round) -> release prep.
//
//   forge run dev-pipeline task="Add a --json flag to the CLI" repo=/path/to/repo
//   optional: maxPlanRounds=3 maxFixRounds=2 release=true publish=false

export const meta = {
  name: 'dev-pipeline',
  description: 'Plan, review plan, implement with sub-agents, code review, QA and release prep for a task in a repo.',
  team: 'dev-team',
  args: {
    task: 'What to build or fix (required)',
    repo: 'Absolute path of the git repository to work in (required)',
    maxPlanRounds: 'Plan review rounds before proceeding (default 3)',
    maxFixRounds: 'Review/fix rounds (default 2)',
    release: 'true to run the release manager (default false)',
    publish: 'true lets the release manager push/publish (default false)',
  },
}

const VERDICT = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    summary: { type: 'string' },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['approved', 'summary', 'issues'],
  additionalProperties: false,
}

const REVIEW = {
  type: 'object',
  properties: {
    blocking: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, line: { type: 'integer' }, issue: { type: 'string' }, fix: { type: 'string' } }, required: ['file', 'issue'], additionalProperties: false } },
    nits: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['blocking', 'nits', 'summary'],
  additionalProperties: false,
}

const QA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    commands: { type: 'array', items: { type: 'string' } },
    failures: { type: 'array', items: { type: 'string' } },
    report: { type: 'string' },
  },
  required: ['passed', 'failures', 'report'],
  additionalProperties: false,
}

export default async function ({ agent, parallel, phase, log, save, args }) {
  const { task, repo } = args
  if (!task || !repo) throw new Error('dev-pipeline needs task=... and repo=/absolute/path')
  const maxPlanRounds = Number(args.maxPlanRounds ?? 3)
  const maxFixRounds = Number(args.maxFixRounds ?? 2)
  const at = { cwd: repo }

  // ---- Plan + review loop
  phase('Plan')
  let plan = await agent('planner', `Write an implementation plan for this task in the repository at ${repo}.\n\nTask:\n${task}`, { ...at, label: 'plan-v1' })
  if (!plan) throw new Error('planner failed')
  let verdict = null
  for (let round = 1; round <= maxPlanRounds; round++) {
    phase(`Plan review ${round}`)
    verdict = await agent('plan-reviewer', `Review this implementation plan for the task below against the repository at ${repo}.\n\nTask:\n${task}\n\nPlan:\n${plan}`, { ...at, schema: VERDICT, label: `plan-review-${round}` })
    if (!verdict) throw new Error('plan reviewer failed')
    log(`plan review ${round}: ${verdict.approved ? 'approved' : `${verdict.issues.length} issues`}`)
    if (verdict.approved) break
    if (round === maxPlanRounds) { log('plan not approved after max rounds; proceeding with latest plan and recorded concerns'); break }
    plan = await agent('planner', `Revise your plan to address every review issue. Return the complete revised plan.\n\nTask:\n${task}\n\nCurrent plan:\n${plan}\n\nReview issues:\n- ${verdict.issues.join('\n- ')}`, { ...at, label: `plan-v${round + 1}` })
    if (!plan) throw new Error('planner revision failed')
  }
  save('plan.md', plan)

  // ---- Implement
  phase('Implement')
  let impl = await agent('implementer', `Implement this approved plan in ${repo}. Use your coder and test-writer sub-agents for independent steps.\n\nTask:\n${task}\n\nPlan:\n${plan}${verdict && !verdict.approved ? `\n\nOpen reviewer concerns to keep in mind:\n- ${verdict.issues.join('\n- ')}` : ''}`, { ...at, label: 'implement' })
  if (!impl) throw new Error('implementer failed')

  // ---- Code review + fix loop
  let reviews = []
  for (let round = 1; round <= maxFixRounds + 1; round++) {
    phase(`Code review ${round}`)
    const ask = focus => `Review the uncommitted changes in ${repo} (git diff, git status, new files) for ${focus}.\n\nThe task was:\n${task}\n\nImplementer summary:\n${impl}`
    reviews = (await parallel([
      () => agent('code-reviewer', ask('correctness, regressions and test coverage'), { ...at, schema: REVIEW, label: `review-correctness-${round}` }),
      () => agent('security-reviewer', ask('security vulnerabilities'), { ...at, schema: REVIEW, label: `review-security-${round}` }),
    ])).filter(Boolean)
    const blocking = reviews.flatMap(r => r.blocking)
    log(`code review ${round}: ${blocking.length} blocking`)
    save(`review-${round}.json`, reviews)
    if (!blocking.length || round > maxFixRounds) break
    phase(`Fix ${round}`)
    impl = await agent('implementer', `Fix every blocking review finding in ${repo}, then re-run the relevant tests.\n\nFindings:\n${blocking.map(b => `- ${b.file}${b.line ? `:${b.line}` : ''}: ${b.issue}${b.fix ? ` (suggested: ${b.fix})` : ''}`).join('\n')}`, { ...at, label: `fix-${round}` }) ?? impl
  }

  // ---- QA
  phase('QA')
  let qa = await agent('qa-engineer', `Verify this change in ${repo}.\n\nTask:\n${task}\n\nPlan (see test section):\n${plan}`, { ...at, schema: QA, label: 'qa-1' })
  if (qa && !qa.passed) {
    phase('QA fix')
    await agent('implementer', `QA failed. Fix these failures in ${repo} and re-run tests:\n- ${qa.failures.join('\n- ')}\n\nQA report:\n${qa.report}`, { ...at, label: 'qa-fix' })
    qa = await agent('qa-engineer', `Re-verify the change in ${repo} after fixes. Previous failures:\n- ${qa.failures.join('\n- ')}`, { ...at, schema: QA, label: 'qa-2' })
  }
  if (qa) save('qa.md', `# QA ${qa.passed ? 'PASSED' : 'FAILED'}\n\n${qa.report}\n\n## Commands\n${(qa.commands ?? []).map(c => `- \`${c}\``).join('\n')}\n\n## Failures\n${qa.failures.map(f => `- ${f}`).join('\n')}`)

  // ---- Release
  let release = null
  if (String(args.release) === 'true') {
    if (!qa?.passed) log('skipping release: QA did not pass')
    else {
      phase('Release')
      release = await agent('release-manager', `Prepare a release for the change just completed in ${repo}. publish: ${String(args.publish) === 'true'}.\n\nTask:\n${task}\n\nQA:\n${qa.report}`, { ...at, label: 'release' })
    }
  }

  return {
    task,
    planApproved: verdict?.approved ?? false,
    implementation: impl,
    review: reviews.map(r => r.summary),
    openBlocking: reviews.flatMap(r => r.blocking),
    qaPassed: qa?.passed ?? false,
    release,
  }
}
