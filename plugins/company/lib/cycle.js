/**
 * One CEO cycle, as an Agent Forge run:
 *
 *   1. Facts        deterministic: engine health, paper books, simulation invariants, reports, budget, org, initiatives
 *   2. CEO plan     the CEO picks initiatives, writes briefs for departments, asks for hires, kills, questions
 *   3. Hiring       HR recruiter drafts each agent, HR reviewer checks it, code forces the read-only template
 *   4. Departments  each brief goes to the department's super team (lead = supervisor, teams = workers);
 *                   the lead then reports in a fixed form: evidence, proposals, build specs
 *   5. Gate         deterministic rehearsal of every proposal: quant validator (holdout, trial-adjusted bar),
 *                   safety invariants, then the independent audit. Pass = execution order to a shadow paper book.
 *   6. CEO review   updates the initiatives, writes the brief for the owner
 *
 * Agents propose; this file decides. No agent output can move an initiative to "paper" or place an order.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { QUANT, AGENT_STAGES, now, today, newId, round, str, clip } from './paths.js'
import { baseAgent, syncDepartment, HARD_RULES, WEB_TOOLS, READ_TOOLS, QUANT_SKILLS } from './setup.js'

// ---------------------------------------------------------------- deterministic facts
function q(argv, log, timeoutMs = 10 * 60 * 1000) {
  const r = spawnSync(path.join(QUANT, 'q'), argv, { cwd: QUANT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: timeoutMs })
  let json = null
  try { json = JSON.parse(r.stdout) } catch { /* not json */ }
  log?.(`q ${argv.join(' ')} -> exit ${r.status}`)
  return { code: r.status, json, stderr: (r.stderr || r.error?.message || '').slice(-2000) }
}

const tail = (file, lines = 12) => { try { return fs.readFileSync(file, 'utf8').trim().split('\n').slice(-lines).join('\n') } catch { return '' } }
const latest = (dir, re = /\.md$/) => { try { const f = fs.readdirSync(dir).filter(x => re.test(x)).sort().pop(); return f ? path.join(dir, f) : null } catch { return null } }
const readClip = (file, n) => { try { return clip(fs.readFileSync(file, 'utf8'), n) } catch { return '' } }
const list = dir => { try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')) } catch { return [] } }

export function gatherFacts(co, log) {
  const reports = path.join(co.forge.registry.d.reports, 'quant')
  const health = q(['health'], log, 60_000)
  const suite = q(['--forward', 'suite', '--paths', '200'], log)
  const s = suite.json
  const pick = (o, keys) => o ? Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, typeof o[k] === 'number' ? round(o[k], 4) : o[k]])) : null
  const sim = s ? {
    source: s.source, invariants: s.invariants,
    // whole period: daily figures from the day-restart run, the end balance from the compounding run
    backtest: Object.fromEntries(Object.entries(s.backtest ?? {}).map(([k, v]) => [k, { compound_final: typeof s.compound?.[k]?.final === 'number' ? round(s.compound[k].final, 2) : null, ...pick(v, ['mean_active_day', 'red_day_rate', 'worst_day', 'best_day', 'trades', 'active_days', 'floor_breaches']) }])),
    holdout: s.holdout ? { from: s.holdout.from, trades: s.holdout.trades, day_restart: Object.fromEntries(Object.entries(s.holdout.day_restart ?? {}).map(([k, v]) => [k, pick(v, ['mean_active_day', 'red_day_rate', 'worst_day', 'best_day', 'trades', 'active_days', 'floor_breaches'])])) } : null,
  } : null
  const trialsFile = path.join(QUANT, 'data', 'trials.jsonl')
  let trials = 0
  try { trials = fs.readFileSync(trialsFile, 'utf8').trim().split('\n').filter(Boolean).length } catch {}
  return {
    at: now(),
    health: health.json ? { status: health.json.status, checks: (health.json.checks ?? []).map(c => `${c.check}: ${c.level} (${c.detail})`) } : { status: 'unknown', error: health.stderr || 'q health gave no JSON' },
    simulation: sim ?? { error: suite.stderr || 'q suite gave no JSON' },
    validator: { trialsSoFar: trials, requiredConfidenceNext: round(1 - 0.05 / (trials + 1), 5), note: 'every proposal validated raises this bar' },
    proposals: { approved: list(path.join(QUANT, 'proposals', 'approved')), done: list(path.join(QUANT, 'proposals', 'done')).length },
    live: { daemon: tail(path.join(QUANT, 'data', 'live', 'daemon.log'), 10), collector: tail(path.join(QUANT, 'data', 'live', 'collector.log'), 6) },
    reports: {
      brief: readClip(latest(path.join(reports, 'brief')) ?? '', 2500),
      sim: readClip(latest(path.join(reports, 'sim'), /^\d{4}-\d{2}-\d{2}(-forward|-real)?\.md$/) ?? '', 3500),
      lab: readClip(latest(path.join(reports, 'lab')) ?? '', 1500),
    },
  }
}

// ---------------------------------------------------------------- schemas
const S = { type: 'string' }
const arr = (items, maxItems) => ({ type: 'array', items, ...(maxItems ? { maxItems } : {}) })
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })

const planSchema = deps => obj({
  assessment: S,
  northStar: obj({ odds: S, whatWouldChangeIt: S }),
  directives: arr(obj({
    department: { type: 'string', enum: deps },
    initiativeId: { type: 'string', description: 'id of an existing initiative, or "" for a new one' },
    newInitiative: obj({ title: S, thesis: S, kind: { type: 'string', enum: ['config', 'model', 'data', 'infrastructure', 'organisation'] } }),
    brief: { type: 'string', description: 'self-contained brief for the department lead: goal, what to examine, deliverable' },
    proof: { type: 'string', description: 'what result would count as evidence, and what result kills the initiative' },
  }, ['department', 'initiativeId', 'brief', 'proof']), 4),
  hires: arr(obj({ department: { type: 'string', enum: deps }, team: { type: 'string', description: 'existing team name, or a new one starting with quant-' }, need: S, why: S }), 2),
  kills: arr(obj({ initiativeId: S, reason: S })),
  decisions: arr(obj({ question: S, options: arr(S, 4), recommendation: S, why: S }), 2),
}, ['assessment', 'northStar', 'directives', 'hires', 'kills', 'decisions'])

const REPORT = obj({
  summary: S,
  evidence: arr(obj({ claim: S, source: S, strength: { type: 'string', enum: ['measured', 'simulated', 'argued'] } })),
  proposals: arr(obj({
    name: { type: 'string', description: 'lowercase letters, digits and dashes, 3-40 characters' },
    hypothesis: S,
    profile: { type: 'string', enum: ['safe_capped', 'max_day'] },
    overridesJson: { type: 'string', description: 'JSON object of engine config overrides, e.g. {"streams":{"WARN_1min_15m":{"stop":0.03}}}' },
    rehearsed: { type: 'string', description: 'what your teams did to raise the chance this passes the validator' },
  }), 2),
  buildSpecs: arr(obj({ title: S, spec: S, expectedValue: S }), 2),
  recommendedStage: { type: 'string', enum: AGENT_STAGES },
  confidence: { type: 'number', description: '0..1: your probability that this initiative ends up profitable in paper trading' },
  blockers: arr(S),
}, ['summary', 'evidence', 'proposals', 'buildSpecs', 'recommendedStage', 'confidence', 'blockers'])

const RECRUIT = obj({
  name: { type: 'string', description: 'starts with quant-, lowercase letters, digits and dashes' },
  description: S,
  role: S,
  model: { type: 'string', enum: ['deepseek-v4-pro', 'deepseek-flash'] },
  needsWeb: { type: 'boolean' },
  skills: arr({ type: 'string', enum: QUANT_SKILLS }, 4),
})
const HR_REVIEW = obj({ approve: { type: 'boolean' }, reason: S, role: { type: 'string', description: 'the final role text (tightened if needed)' } })
const AUDIT = obj({ fatal: { type: 'boolean' }, objections: arr(S), confidence: { type: 'number' } })

const REVIEW = obj({
  brief: { type: 'string', description: 'Markdown brief for the owner: state, what was learned, what was executed, odds, next' },
  summary: { type: 'string', description: 'two sentences' },
  initiativeUpdates: arr(obj({ id: S, stage: { type: 'string', enum: AGENT_STAGES }, confidence: { type: 'number' }, note: S })),
  decisions: arr(obj({ question: S, options: arr(S, 4), recommendation: S, why: S }), 2),
})

// ---------------------------------------------------------------- helpers
const J = v => JSON.stringify(v, null, 1)
const charterText = c => `Mission: ${c.mission}\nScope: ${c.scope}\nNorth star: $${c.northStar.dailyBudgetUsd.toLocaleString('en-US')} a day in, $${c.northStar.targetDailyUsd.toLocaleString('en-US')} a day out.\nRules:\n${c.rules.map(r => `- ${r}`).join('\n')}`
const initiativeLine = i => `- ${i.id} [${i.stage}] ${i.title} (${i.department}; confidence ${i.confidence ?? '-'}): ${clip(i.thesis, 300)}${i.note ? `\n  last note: ${clip(i.note, 300)}` : ''}`
const asText = r => typeof r === 'string' ? r : r == null ? '' : (r.text ?? r.answer ?? JSON.stringify(r))

async function waitRun(engine, runId, signal) {
  for (;;) {
    const st = engine.getRun(runId)
    if (st.status !== 'running') return st
    if (signal.aborted) { try { engine.cancel(runId) } catch {} }
    await new Promise(r => setTimeout(r, 2500))
  }
}

function orgText(co, s) {
  const { registry } = co.forge
  return s.departments.map(d => {
    const teams = d.teams.map(t => { try { const team = registry.getTeam(t); return `  - ${t}: ${team.description ?? ''} [${team.members.join(', ')}]` } catch { return `  - ${t}: (missing)` } })
    return `- ${d.id} "${d.name}", lead ${d.lead}: ${d.mission}\n${teams.join('\n')}`
  }).join('\n')
}

// ---------------------------------------------------------------- the cycle
export async function runCycle(co, api, { cycleId, focus }) {
  const { registry, engine } = co.forge
  const start = co.read()
  const charter = start.charter
  const depIds = start.departments.map(d => d.id)
  const cycleStartBalance = start.lastBalanceUsd
  const patchCycle = fn => co.update(s => { const c = s.cycles.find(x => x.id === cycleId); if (c) fn(c, s) })
  const summary = { directives: 0, hires: [], proposals: [], orders: [], killed: [] }

  /** Stop the cycle when its model spend passes the cycle budget (measured on the provider balance). */
  const guard = async where => {
    const m = await co.meter(`cycle ${cycleId}: ${where}`)
    const spent = typeof cycleStartBalance === 'number' && m.balanceUsd != null ? cycleStartBalance - m.balanceUsd : 0
    patchCycle(c => { c.spendUsd = round(Math.max(0, spent)) })
    if (spent > charter.budget.cycleUsd) throw new Error(`cycle budget reached after ${where}: $${round(spent, 2)} of $${charter.budget.cycleUsd}`)
    if (m.balanceUsd != null && m.balanceUsd < charter.budget.reserveUsd) throw new Error(`provider balance $${m.balanceUsd} is below the reserve $${charter.budget.reserveUsd}`)
    if (m.remainingTodayUsd <= 0) throw new Error(`today's budget of $${charter.budget.dailyUsd} is spent`)
  }

  // ---- 1. facts
  api.phase('Facts')
  const facts = gatherFacts(co, api.log)
  api.save('facts.json', facts)
  const budget = co.budget()
  const answered = start.decisions.filter(d => d.status === 'answered' && !d.seenByCeo)
  const lastBrief = start.cycles.filter(c => c.report).at(-1)
  const context = () => {
    const s = co.read()
    return [
      `# Charter\n${charterText(s.charter)}`,
      `# Budget today (${budget.date})\nDaily budget $${budget.dailyUsd}; spent on models so far $${budget.spentTodayUsd}; DeepSeek balance $${budget.balanceUsd}; this cycle may spend up to $${budget.cycleUsd}. Anything other than model calls (servers, data feeds, trading capital) needs the owner.`,
      `# Organisation\nCEO: ${s.ceo}. Independent auditor: ${s.auditor} (different model on purpose).\n${orgText(co, s)}`,
      `# Initiatives\n${s.initiatives.filter(i => i.stage !== 'killed').map(initiativeLine).join('\n') || '(none yet)'}\nKilled so far: ${s.initiatives.filter(i => i.stage === 'killed').map(i => `${i.title} (${clip(i.note, 120)})`).join('; ') || 'none'}`,
      `# Execution orders so far\n${s.orders.map(o => `- ${o.ts.slice(0, 10)} ${o.proposal} -> paper book ${o.book} (P(better) ${o.pImprove}; ${o.status === 'awaiting-owner' ? 'verified, waiting for the owner to approve the start' : o.status === 'declined' ? 'the owner declined to start it' : 'running'})`).join('\n') || '(none)'}`,
      `# Facts measured just now (deterministic)\n${J(facts)}`,
    ].join('\n\n')
  }

  // ---- 2. CEO plan
  api.phase('CEO plan')
  const plan = await api.agent(start.ceo, [
    context(),
    answered.length ? `# The owner answered\n${answered.map(d => `- "${d.question}" -> ${d.choice}${d.note ? ` (${d.note})` : ''}`).join('\n')}` : null,
    lastBrief ? `# Your previous brief\n${readClip(path.join(co.reports, lastBrief.report), 3000)}` : null,
    focus ? `# The owner's focus for this cycle\n${focus}` : null,
    `# Your job now\nPlan this cycle. Choose at most 4 directives (one per department at most) that most raise the probability of real profit, each with a self-contained brief and the proof you expect. Continue promising initiatives (give their id) before starting new ones; kill the ones that failed. Ask for a hire only when a missing skill blocks an initiative. Ask the owner only what only the owner can decide. State the north-star odds honestly.`,
  ].filter(Boolean).join('\n\n'), { schema: planSchema(depIds), label: 'ceo:plan' })
  if (!plan) throw new Error('the CEO produced no plan')
  api.save('plan.json', plan)
  co.update(s => {
    for (const d of answered) { const x = s.decisions.find(y => y.id === d.id); if (x) x.seenByCeo = true }
    for (const k of plan.kills ?? []) {
      const i = s.initiatives.find(x => x.id === k.initiativeId)
      if (i && i.stage !== 'paper' && !i.awaitingOwner && i.stage !== 'killed') { i.stage = 'killed'; i.note = str(k.reason, 600); i.history.push({ ts: now(), cycle: cycleId, stage: 'killed', note: i.note }); summary.killed.push(i.title) }
    }
    for (const d of plan.decisions ?? []) co.addDecision(s, { from: s.ceo, cycle: cycleId, question: str(d.question, 600), options: (d.options ?? []).map(o => str(o, 200)).slice(0, 4), recommendation: str(d.recommendation, 300), why: str(d.why, 1200) })
    const c = s.cycles.find(x => x.id === cycleId)
    if (c) { c.assessment = str(plan.assessment, 2000); c.odds = str(plan.northStar?.odds, 600) }
    s.northStar = { odds: str(plan.northStar?.odds, 800), whatWouldChangeIt: str(plan.northStar?.whatWouldChangeIt, 800), ts: now() }
  })
  await guard('CEO plan')

  // ---- 3. hiring
  if ((plan.hires ?? []).length) {
    api.phase('Hiring')
    for (const h of plan.hires.slice(0, 2)) {
      if (api.signal.aborted) break
      try { const r = await hire(co, api, h, cycleId); if (r) summary.hires.push(r) } catch (e) { api.log(`hire failed: ${e.message}`) }
    }
    await guard('hiring')
  }

  // ---- 4. departments
  api.phase('Departments')
  const seen = new Set()
  const directives = (plan.directives ?? []).filter(d => depIds.includes(d.department) && !seen.has(d.department) && seen.add(d.department)).slice(0, 4)
  // resolve each directive to an initiative record first
  const work = co.update(s => directives.map(d => {
    let ini = d.initiativeId ? s.initiatives.find(x => x.id === d.initiativeId && x.stage !== 'killed') : null
    if (!ini) {
      const n = d.newInitiative ?? {}
      ini = { id: newId('i'), title: str(n.title || d.brief, 120).split('\n')[0], thesis: str(n.thesis || d.brief, 1500), kind: n.kind ?? 'config', department: d.department, stage: 'idea', confidence: null, createdAt: now(), history: [{ ts: now(), cycle: cycleId, stage: 'idea', note: 'opened by the CEO' }] }
      s.initiatives.push(ini)
    }
    return { directive: d, initiativeId: ini.id, title: ini.title }
  }))
  summary.directives = work.length

  const runDirective = async ({ directive: d, initiativeId, title }) => {
    const dep = co.read().departments.find(x => x.id === d.department)
    const brief = [
      `CEO brief for the ${dep.name} department. Initiative: "${title}" (${initiativeId}).`,
      d.brief,
      `Proof the CEO expects: ${d.proof}`,
      `Company charter:\n${charterText(charter)}`,
      `Validator state: ${facts.validator.trialsSoFar} trials so far, so the next proposal needs P(better) >= ${facts.validator.requiredConfidenceNext}. Engine folder: ${QUANT}. Research reports: see the folders in your instructions.`,
    ].join('\n\n')
    let text = ''
    let sub = null
    try {
      const posted = co.supers.post(dep.superTeamId, brief)
      sub = posted.runId
      patchCycle(c => { c.subRuns.push({ runId: sub, department: dep.id, initiative: initiativeId, superTeam: dep.superTeamId }) })
      api.log(`${dep.id}: super team run ${sub}`)
      const st = await waitRun(engine, sub, api.signal)
      text = st.status === 'completed' ? asText(st.result) : ''
      if (!text) api.log(`${dep.id}: super team run ended ${st.status}${st.error ? `: ${String(st.error).split('\n')[0]}` : ''}`)
    } catch (e) { api.log(`${dep.id}: super team unavailable (${e.message}); asking the lead directly`) }
    if (api.signal.aborted) return null
    const report = await api.agent(dep.lead, [
      `You are the head of ${dep.name}. The CEO's brief:\n${brief}`,
      text ? `# What your teams produced\n${clip(text, 30000)}` : '# Your teams produced nothing usable this time. Do the analysis yourself from the files, as far as you can.',
      `# Your job now\nReport to the CEO in the required form. Evidence: one line per claim with its source file or data and its strength. Proposals: only config changes your teams rehearsed and attacked, at most 2, as overridesJson (a JSON object) that follows the quant-risk-guard change rules; leave the list empty when nothing is ready, because every proposal validated raises the bar for the next. buildSpecs: work that needs new code or data, with the expected value. Confidence is a probability, not a mood.`,
    ].join('\n\n'), { schema: REPORT, label: `report:${dep.id}` })
    if (report) api.save(`reports/${dep.id}.json`, report)
    return { dep, initiativeId, title, report, text, sub }
  }
  // two departments at a time: each one already runs several agents in parallel
  const results = []
  for (let i = 0; i < work.length && !api.signal.aborted; i += 2) results.push(...await api.parallel(work.slice(i, i + 2).map(w => () => runDirective(w))))
  const reports = results.filter(r => r?.report)
  co.update(s => {
    for (const r of reports) {
      const i = s.initiatives.find(x => x.id === r.initiativeId)
      if (!i || i.stage === 'paper' || i.awaitingOwner) continue
      if (AGENT_STAGES.includes(r.report.recommendedStage) && r.report.recommendedStage !== 'killed') i.stage = r.report.recommendedStage
      i.confidence = Number.isFinite(r.report.confidence) ? round(Math.min(1, Math.max(0, r.report.confidence)), 3) : i.confidence
      i.confidenceBasis = 'department estimate'
      i.note = str(r.report.summary, 800)
      i.evidence = (r.report.evidence ?? []).slice(0, 12).map(e => ({ claim: str(e.claim, 300), source: str(e.source, 200), strength: e.strength }))
      i.blockers = (r.report.blockers ?? []).slice(0, 6).map(b => str(b, 300))
      i.history.push({ ts: now(), cycle: cycleId, stage: i.stage, note: i.note })
      for (const b of (r.report.buildSpecs ?? []).slice(0, 2)) {
        if (s.builds.some(x => x.title === b.title)) continue
        s.builds.push({ id: newId('b'), ts: now(), cycle: cycleId, initiative: i.id, department: r.dep.id, title: str(b.title, 160), spec: str(b.spec, 4000), expectedValue: str(b.expectedValue, 600), status: 'requested' })
      }
    }
  })
  await guard('departments')

  // ---- 5. gate
  api.phase('Gate')
  const candidates = []
  for (const r of reports) for (const p of r.report.proposals ?? []) candidates.push({ ...p, initiativeId: r.initiativeId, department: r.dep.id })
  const gateResults = []
  for (const p of candidates.slice(0, charter.gate.maxProposalsPerCycle)) {
    if (api.signal.aborted) break
    gateResults.push(await gate(co, api, p, { cycleId, charter, facts }))
  }
  if (candidates.length > charter.gate.maxProposalsPerCycle) api.log(`${candidates.length - charter.gate.maxProposalsPerCycle} proposal(s) held back: the gate takes ${charter.gate.maxProposalsPerCycle} per cycle`)
  api.save('gate.json', gateResults)
  summary.proposals = gateResults.map(g => `${g.name}: ${g.passed ? 'PASSED' : `failed (${g.reasons.join('; ')})`}`)
  summary.orders = gateResults.filter(g => g.order).map(g => g.order.book)

  // ---- 6. CEO review
  api.phase('CEO review')
  const review = await api.agent(start.ceo, [
    context(),
    `# This cycle\nYour plan:\n${J({ assessment: plan.assessment, directives: work.map(w => ({ department: w.directive.department, initiative: w.title, id: w.initiativeId })) })}`,
    `# Department reports\n${reports.map(r => `## ${r.dep.name}: "${r.title}" (${r.initiativeId})\n${J(r.report)}`).join('\n\n') || '(no department delivered a report)'}`,
    `# Gate results (deterministic; you cannot change them)\n${J(gateResults)}`,
    summary.hires.length ? `# Hires this cycle\n${summary.hires.join('\n')}` : null,
    `# Your job now\nJudge the results. Update each initiative you worked on (stage and your own probability that it ends up profitable in paper trading; you cannot set "paper", only the gate does). Write the brief for the owner in Markdown: 1) state of the company and the engine, 2) what was learned, with numbers and sample sizes, 3) what the gate executed or rejected and why, 4) honest odds for the north star, 5) what the next cycle will do. Add a question for the owner only if something needs the owner.`,
  ].filter(Boolean).join('\n\n'), { schema: REVIEW, label: 'ceo:review' })

  const m = await co.meter(`cycle ${cycleId}: review`)
  const spent = typeof cycleStartBalance === 'number' && m.balanceUsd != null ? round(Math.max(0, cycleStartBalance - m.balanceUsd)) : null
  const name = `${today()}-${cycleId}.md`
  const md = [
    `# CEO brief ${today()} (cycle ${cycleId})`, '',
    review?.brief ?? `The CEO did not deliver a review. Plan assessment:\n\n${plan.assessment}`, '',
    '## Cycle record (written by code, not by an agent)', '',
    `- Directives: ${work.map(w => `${w.directive.department} → "${w.title}"`).join('; ') || 'none'}`,
    `- Gate: ${summary.proposals.join(' | ') || 'no proposals submitted'}`,
    `- Execution orders (paper): ${summary.orders.join(', ') || 'none'}`,
    `- Hires: ${summary.hires.join('; ') || 'none'}`,
    `- Killed: ${[...summary.killed, ...(review?.initiativeUpdates ?? []).filter(u => u.stage === 'killed').map(u => work.find(w => w.initiativeId === u.id)?.title ?? u.id)].join('; ') || 'none'}`,
    `- Model spend this cycle: ${spent == null ? 'unknown' : `$${spent}`} (DeepSeek balance $${m.balanceUsd ?? '?'})`,
    `- Engine health: ${facts.health.status}; safety invariants: ${facts.simulation?.invariants?.all_pass === true ? 'pass' : 'NOT confirmed'}`,
  ].join('\n')
  fs.writeFileSync(path.join(co.reports, name), md)
  co.update(s => {
    for (const u of review?.initiativeUpdates ?? []) {
      const i = s.initiatives.find(x => x.id === u.id)
      if (!i || i.stage === 'paper' || i.awaitingOwner || !AGENT_STAGES.includes(u.stage)) continue
      i.stage = u.stage
      if (Number.isFinite(u.confidence)) { i.confidence = round(Math.min(1, Math.max(0, u.confidence)), 3); i.confidenceBasis = 'CEO estimate' }
      i.note = str(u.note, 800)
      i.history.push({ ts: now(), cycle: cycleId, stage: u.stage, note: i.note })
    }
    for (const d of review?.decisions ?? []) co.addDecision(s, { from: s.ceo, cycle: cycleId, question: str(d.question, 600), options: (d.options ?? []).map(o => str(o, 200)).slice(0, 4), recommendation: str(d.recommendation, 300), why: str(d.why, 1200) })
  })
  summary.killed = co.read().initiatives.filter(i => i.stage === 'killed' && i.history.some(h => h.cycle === cycleId && h.stage === 'killed')).map(i => i.title)
  return { report: name, summary: review?.summary ?? clip(plan.assessment, 400), ...summary, spendUsd: spent }
}

// ---------------------------------------------------------------- hiring
export async function hire(co, api, h, cycleId) {
  const { registry } = co.forge
  const s0 = co.read()
  const hc = s0.charter.hiring
  if (hc.mode === 'off') { api.log('hiring is off'); return null }
  const dep = s0.departments.find(d => d.id === h.department)
  if (!dep) return null
  if (s0.hires.filter(x => x.ts.slice(0, 10) === now().slice(0, 10) && x.status === 'hired').length >= hc.maxPerDay) { api.log('hire skipped: daily hiring limit reached'); return null }
  if (registry.listAgents().filter(a => (a.tags ?? []).includes('quant')).length >= hc.maxAgents) { api.log('hire skipped: the organisation is at its maximum size'); return null }

  const existing = registry.listAgents().filter(a => !a.invalid && (a.tags ?? []).includes('quant')).map(a => `- ${a.name}: ${a.description}`).join('\n')
  const spec = await api.agent('quant-hr-recruiter', `Hiring request from the CEO for the ${dep.name} department (team ${h.team}).\nNeed: ${h.need}\nWhy: ${h.why}\n\nExisting agents (do not duplicate):\n${existing}\n\nWrite the agent specification.`, { schema: RECRUIT, label: 'hr:recruit' })
  if (!spec) return null
  const review = await api.agent('quant-hr-reviewer', `Review this proposed hire.\nRequest: ${h.need} (${h.why})\nSpecification:\n${J(spec)}\n\nExisting agents:\n${existing}`, { schema: HR_REVIEW, label: 'hr:review' })
  let name = String(spec.name ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36)
  if (!name.startsWith('quant-')) name = `quant-${name}`.slice(0, 36)
  const rec = { id: newId('h'), ts: now(), cycle: cycleId, department: dep.id, team: h.team, need: str(h.need, 400), why: str(h.why, 600), name, description: str(spec.description, 300), model: spec.model }
  const exists = n => { try { registry.getAgent(n); return true } catch { return false } }
  if (!review?.approve) { co.update(s => { s.hires.push({ ...rec, status: 'rejected', reason: str(review?.reason ?? 'HR review failed', 400) }) }); return null }
  if (name.length < 9 || exists(name)) { co.update(s => { s.hires.push({ ...rec, status: 'rejected', reason: 'name taken or invalid' }) }); return null }

  // the template is fixed in code: a hire can only choose its words, its model tier, web access and skills
  const def = baseAgent({
    name,
    description: rec.description,
    model: spec.model === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-flash',
    tools: spec.needsWeb ? WEB_TOOLS : READ_TOOLS,
    skills: [...new Set(['quant-gates', ...(spec.skills ?? []).filter(k => QUANT_SKILLS.includes(k))])],
    tags: ['quant', 'crypto', 'company', 'hired'],
    role: `${str(review.role || spec.role, 2400)}\n\n${HARD_RULES}`,
  })
  let team = String(h.team ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40)
  if (!team.startsWith('quant-')) team = `quant-${team}`

  if (hc.mode === 'observe') {
    co.update(s => {
      s.hires.push({ ...rec, team, status: 'proposed', def })
      co.addDecision(s, { from: 'quant-head-people', cycle: cycleId, kind: 'hire', hire: rec.id, question: `Hire ${name} into ${team}? ${rec.description}`, options: ['Hire', 'Do not hire'], recommendation: 'Hire', why: rec.why })
    })
    return `${name} proposed (waiting for the owner)`
  }
  enroll(co, { ...rec, team, def })
  return `${name} → ${team} (${def.model})`
}

/** Save a hire's agent file, put it in its team (creating the team if new) and attach the team to the department. */
export function enroll(co, rec) {
  const { registry } = co.forge
  registry.saveAgent(rec.def)
  let t
  try { t = registry.getTeam(rec.team) } catch { t = { name: rec.team, description: `Created for: ${rec.need}`, members: [] } }
  if (!t.members.includes(rec.name)) t.members = [...t.members, rec.name]
  registry.saveTeam({ name: t.name, description: t.description ?? '', members: t.members, ...(t.orchestrations?.length ? { orchestrations: t.orchestrations } : {}) })
  let dep
  co.update(s => {
    dep = s.departments.find(d => d.id === rec.department)
    if (dep && !dep.teams.includes(rec.team)) dep.teams.push(rec.team)
    const i = s.hires.findIndex(x => x.id === rec.id)
    const row = { ...rec, def: undefined, status: 'hired', hiredAt: now() }
    if (i >= 0) s.hires[i] = row; else s.hires.push(row)
    s.hires = s.hires.slice(-200)
  })
  if (dep) { try { syncDepartment(co, dep) } catch (e) { co.log(`sync ${dep.id}: ${e.message}`) } }
}

// ---------------------------------------------------------------- the gate
/**
 * Rehearse one proposal and decide. Order of checks (cheapest and hardest first):
 *   1. form: name, JSON overrides
 *   2. independent audit (a different model attacks it) - before the validator, because a validator trial
 *      permanently raises the bar for every later proposal
 *   3. safety invariants of the current engine (floor, crash recovery, ledger)
 *   4. quant validator on the holdout: P(better) must beat its trial-adjusted bar and the charter's floor
 * Pass = the validator has written the proposal to proposals/approved/, which the paper daemon runs as a shadow
 * book. That file is the execution order. With charter.execution.ownerApproval (the default) the file is held in
 * proposals/awaiting-owner/ and the CEO asks the owner; it moves to approved/ only when the owner answers Start.
 * Nothing here can reach the main book or real money.
 */
export async function gate(co, api, p, { cycleId, charter, facts }) {
  const out = { name: '', initiativeId: p.initiativeId, department: p.department, hypothesis: str(p.hypothesis, 600), passed: false, reasons: [], checks: {} }
  const name = String(p.name ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  out.name = name
  let overrides
  try { overrides = JSON.parse(p.overridesJson) } catch { overrides = null }
  if (name.length < 3) out.reasons.push('invalid proposal name')
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) || !Object.keys(overrides).length) out.reasons.push('overrides are not a non-empty JSON object')
  if (out.reasons.length) return finish(co, out, cycleId)
  const proposal = { name, hypothesis: out.hypothesis, profile: p.profile === 'safe_capped' ? 'safe_capped' : 'max_day', overrides, from: { company: cycleId, initiative: p.initiativeId, department: p.department } }

  if (charter.gate.requireAudit) {
    const s = co.read()
    const a = await api.agent(s.auditor, `Audit this proposal before it is rehearsed on the holdout. You are independent of the team that wrote it. Mark fatal if it is likely to lose money live, relies on lookahead, loosens a limit, or is fitted to very few events. Also give your probability (0..1) that it is a real improvement.\n\nProposal:\n${J(proposal)}\n\nWhat the team says it did to rehearse it:\n${str(p.rehearsed, 2000)}\n\nCurrent simulation state:\n${J(facts.simulation)}`, { schema: AUDIT, label: `audit:${name}`, full: true })
    const verdict = a?.structured ?? null
    if (a?.costUsd) co.update(st => { const day = st.days[today()]; if (day) day.claudeEstUsd = round((day.claudeEstUsd ?? 0) + a.costUsd); const c = st.cycles.find(x => x.id === cycleId); if (c) c.claudeEstUsd = round((c.claudeEstUsd ?? 0) + a.costUsd) })
    out.checks.audit = verdict ? { fatal: verdict.fatal, objections: (verdict.objections ?? []).slice(0, 8), confidence: verdict.confidence } : { error: 'the auditor gave no verdict' }
    if (!verdict) out.reasons.push('audit unavailable (no execution without an audit)')
    else if (verdict.fatal) out.reasons.push(`audit: ${clip((verdict.objections ?? []).join('; '), 400)}`)
    if (out.reasons.length) return finish(co, out, cycleId)
  }

  out.checks.invariants = facts.simulation?.invariants ?? null
  if (facts.simulation?.invariants?.all_pass !== true) { out.reasons.push('engine safety invariants are not confirmed'); return finish(co, out, cycleId) }
  if (facts.health?.status === 'critical') { out.reasons.push('engine health is critical'); return finish(co, out, cycleId) }

  const pending = path.join(QUANT, 'proposals', 'pending')
  const done = path.join(QUANT, 'proposals', 'done')
  fs.mkdirSync(pending, { recursive: true }); fs.mkdirSync(done, { recursive: true })
  const file = path.join(pending, `${today()}-${name}.json`)
  fs.writeFileSync(file, JSON.stringify(proposal, null, 2))
  const v = q(['validate', '--proposal', file], api.log).json
  try { fs.renameSync(file, path.join(done, path.basename(file))) } catch {}
  out.checks.validator = v ? { verdict: v.verdict, pImprove: v.p_improve, required: v.required_confidence, trials: v.trials, holdoutDays: v.holdout_days, reasons: v.reasons, baseline: v.baseline, candidate: v.candidate } : { error: 'the validator gave no result' }
  if (!v) out.reasons.push('validator failed to run')
  else {
    if (!String(v.verdict).startsWith('approved')) out.reasons.push(...(v.reasons?.length ? v.reasons : ['rejected by the validator']))
    if (typeof v.p_improve === 'number' && v.p_improve < charter.gate.minConfidence) out.reasons.push(`P(better) ${v.p_improve.toFixed(3)} is below the charter floor ${charter.gate.minConfidence}`)
    out.pImprove = v.p_improve ?? null
  }
  if (!out.reasons.length && v?.approved_file) {
    out.passed = true
    let status = 'active'
    if (charter.execution?.ownerApproval !== false) {
      // verified, but nothing starts until the owner says so: take the file out of approved/ (the paper daemon
      // only runs what is in approved/) and hold it
      const hold = path.join(QUANT, 'proposals', 'awaiting-owner')
      fs.mkdirSync(hold, { recursive: true })
      fs.renameSync(v.approved_file, path.join(hold, path.basename(v.approved_file)))
      status = 'awaiting-owner'
    }
    out.order = { id: newId('o'), ts: now(), cycle: cycleId, initiative: p.initiativeId, name, hypothesis: out.hypothesis, proposal: path.basename(v.approved_file), book: `shadow-${path.basename(v.approved_file, '.json')}`, kind: 'paper', status, pImprove: round(v.p_improve, 4), required: round(v.required_confidence, 5), audit: out.checks.audit ?? null, issuedBy: co.read().ceo }
  } else if (!out.reasons.length) {
    out.reasons.push('the validator approved but wrote no approved file')
  } else if (v?.approved_file) {
    // approved by the validator but below the charter floor: take the order back
    try { fs.renameSync(v.approved_file, path.join(done, `rejected-by-charter-${path.basename(v.approved_file)}`)) } catch {}
  }
  return finish(co, out, cycleId)
}

function finish(co, out, cycleId) {
  co.update(s => {
    const i = s.initiatives.find(x => x.id === out.initiativeId)
    const waiting = out.order?.status === 'awaiting-owner'
    if (out.order) s.orders.push(out.order)
    if (waiting) {
      const o = out.order
      co.addDecision(s, { from: s.ceo, cycle: cycleId, kind: 'execute', order: o.id,
        question: `Start executing "${o.name}"? It passed verification: P(better) ${o.pImprove} against a required ${o.required}${o.audit ? ', and the independent audit found no fatal objection' : ''}. Starting means it runs as paper book ${o.book}; no real money is involved.`,
        options: ['Start', 'Do not start'], recommendation: 'Start', why: o.hypothesis })
    }
    if (i) {
      i.gate = { ts: now(), cycle: cycleId, name: out.name, passed: out.passed, reasons: out.reasons, pImprove: out.pImprove ?? null }
      if (out.passed) { i.stage = waiting ? 'gate' : 'paper'; i.awaitingOwner = waiting || undefined; i.confidence = out.pImprove; i.confidenceBasis = 'validator P(better) on the holdout' }
      i.history.push({ ts: now(), cycle: cycleId, stage: i.stage, note: out.passed ? (waiting ? `gate passed: waiting for the owner's approval to start paper book ${out.order.book}` : `gate passed: paper book ${out.order.book}`) : `gate failed: ${clip(out.reasons.join('; '), 300)}` })
    }
  })
  if (out.order) co.ledger({ kind: 'order', usd: 0, note: out.order.status === 'awaiting-owner' ? `verified, waiting for the owner: ${out.order.book}` : `paper execution order ${out.order.book}`, cycle: cycleId })
  return out
}
