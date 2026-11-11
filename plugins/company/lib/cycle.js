/**
 * One CEO cycle, as an Agent Forge run:
 *
 *   1. Facts        deterministic facts from the profile (profile.facts), plus budget, org and initiatives
 *   2. CEO plan     the CEO picks initiatives, writes briefs for departments, asks for hires, kills, questions
 *   3. Hiring       HR recruiter drafts each agent, HR reviewer checks it, code forces the read-only template
 *   4. Departments  each brief goes to the department's super team (lead = supervisor, teams = workers);
 *                   the lead then reports in a fixed form: evidence, proposals, build specs
 *   5. Gate         profile.gate decides on every proposal, in code (audit and the profile's checks)
 *   6. CEO review   updates the initiatives, writes the brief for the owner
 *
 * Agents propose; code decides. No agent output can move an initiative to the gated stage.
 */
import fs from 'node:fs'
import path from 'node:path'
import { now, today, newId, round, str, clip } from './paths.js'
import { profile as P } from './profile.js'
import { syncDepartment } from './setup.js'

/** Deterministic facts of the active profile. */
export const gatherFacts = (co, log) => P.facts(co, log)
/** The active profile's gate. */
export const gate = (co, api, p, ctx) => P.gate(co, api, p, ctx)

// ---------------------------------------------------------------- schemas
const S = { type: 'string' }
const arr = (items, maxItems) => ({ type: 'array', items, ...(maxItems ? { maxItems } : {}) })
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })

/** A question for the owner. The host, not the agent, decides whether it is sent (Company.askOwner). */
const QUESTION = obj({
  question: S, options: arr(S, 4), recommendation: S, why: S,
  category: { type: 'string', enum: [...P.ownerOnly.map(o => o.key), 'internal'], description: 'which owner-only matter this is; "internal" is anything else, and an internal question is not sent: your recommendation becomes the decision' },
  ifNoAnswer: { type: 'string', description: 'what the company does until the owner answers; work must be able to continue' },
})
const DECISION_RULE = `Decisions for the owner: normally none. ${P.ownerOnlyText()} Decide every internal matter yourself and say what you decided in your assessment or brief. When evidence cannot be produced in this environment, record it as an open risk and continue; that is not a question. A question you do send must say what the company does meanwhile (ifNoAnswer).`

const planSchema = deps => obj({
  assessment: S,
  northStar: obj({ odds: S, whatWouldChangeIt: S }),
  directives: arr(obj({
    department: { type: 'string', enum: deps },
    initiativeId: { type: 'string', description: 'id of an existing initiative, or "" for a new one' },
    newInitiative: obj({ title: S, thesis: S, kind: { type: 'string', enum: P.initiativeKinds } }),
    brief: { type: 'string', description: 'self-contained brief for the department lead: goal, what to examine, deliverable' },
    proof: { type: 'string', description: 'what result would count as evidence, and what result kills the initiative' },
  }, ['department', 'initiativeId', 'brief', 'proof']), 4),
  hires: arr(obj({ department: { type: 'string', enum: deps }, team: { type: 'string', description: `existing team name, or a new one starting with ${P.prefix}` }, need: S, why: S }), 2),
  kills: arr(obj({ initiativeId: S, reason: S })),
  decisions: arr(QUESTION, 1),
}, ['assessment', 'northStar', 'directives', 'hires', 'kills', 'decisions'])

const REPORT = obj({
  summary: S,
  evidence: arr(obj({ claim: S, source: S, strength: { type: 'string', enum: ['measured', 'simulated', 'argued'] } })),
  proposals: arr(obj(P.proposal.schema), 2),
  buildSpecs: arr(obj({ title: S, spec: S, expectedValue: S }), 2),
  recommendedStage: { type: 'string', enum: P.agentStages },
  confidence: { type: 'number', description: `0..1: ${P.prompts.confidence}` },
  blockers: arr(S),
}, ['summary', 'evidence', 'proposals', 'buildSpecs', 'recommendedStage', 'confidence', 'blockers'])

const RECRUIT = obj({
  name: { type: 'string', description: `starts with ${P.prefix}, lowercase letters, digits and dashes` },
  description: S,
  role: S,
  model: { type: 'string', enum: [P.models.lead, P.models.fast].filter((v, i, a) => a.indexOf(v) === i) },
  needsWeb: { type: 'boolean' },
  skills: arr(P.skills.all.length ? { type: 'string', enum: P.skills.all } : S, 4),
})
const HR_REVIEW = obj({ approve: { type: 'boolean' }, reason: S, role: { type: 'string', description: 'the final role text (tightened if needed)' } })

const REVIEW = obj({
  brief: { type: 'string', description: 'Markdown brief for the owner: state, what was learned, what the gate decided, odds, next' },
  summary: { type: 'string', description: 'two sentences' },
  initiativeUpdates: arr(obj({ id: S, stage: { type: 'string', enum: P.agentStages }, confidence: { type: 'number' }, note: S })),
  decisions: arr(QUESTION, 1),
})

// ---------------------------------------------------------------- helpers
const J = v => JSON.stringify(v, null, 1)
export const charterText = c => `Mission: ${c.mission}\nScope: ${c.scope}\nNorth star: ${P.northStarText(c)}.\nRules:\n${c.rules.map(r => `- ${r}`).join('\n')}`
const initiativeLine = i => `- ${i.id} [${i.stage}] ${i.title} (${i.department}; confidence ${i.confidence ?? '-'}): ${clip(i.thesis, 300)}${i.note ? `\n  last note: ${clip(i.note, 300)}` : ''}`
const asText = r => typeof r === 'string' ? r : r == null ? '' : (r.text ?? r.answer ?? JSON.stringify(r))
const readClip = (file, n) => { try { return clip(fs.readFileSync(file, 'utf8'), n) } catch { return '' } }

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
  const { engine } = co.forge
  const start = co.read()
  const charter = start.charter
  const depIds = start.departments.map(d => d.id)
  const patchCycle = fn => co.update(s => { const c = s.cycles.find(x => x.id === cycleId); if (c) fn(c, s) })
  const summary = { directives: 0, hires: [], proposals: [], orders: [], killed: [] }

  /** Stop the cycle when its model spend passes the cycle budget. */
  const guard = async where => {
    const spent = await co.cycleSpend(cycleId)
    patchCycle(c => { c.spendUsd = round(Math.max(0, spent)) })
    const m = co.budget()
    if (spent > charter.budget.cycleUsd) throw new Error(`cycle budget reached after ${where}: $${round(spent, 2)} of $${charter.budget.cycleUsd}`)
    if (co.metering === 'balance' && m.balanceUsd != null && m.balanceUsd < charter.budget.reserveUsd) throw new Error(`provider balance $${m.balanceUsd} is below the reserve $${charter.budget.reserveUsd}`)
    // balance metering already counts this cycle in today's spend; run metering charges the cycle when it ends
    const over = co.metering === 'balance' ? m.remainingTodayUsd <= 0 : m.spentTodayUsd + spent > charter.budget.dailyUsd
    if (over) throw new Error(`today's budget of $${charter.budget.dailyUsd} is spent`)
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
      `# Budget today (${budget.date})\nDaily budget $${budget.dailyUsd}; spent on models so far $${budget.spentTodayUsd}${co.metering === 'balance' ? `; provider balance $${budget.balanceUsd}` : ' (estimated from run costs)'}; this cycle may spend up to $${budget.cycleUsd}. Anything other than model calls (services, assets, hardware, advertising) needs the owner.`,
      `# Organisation\nCEO: ${s.ceo}. Independent auditor: ${s.auditor} (different model on purpose).\n${orgText(co, s)}`,
      `# Initiatives\n${s.initiatives.filter(i => i.stage !== 'killed').map(initiativeLine).join('\n') || '(none yet)'}\nKilled so far: ${s.initiatives.filter(i => i.stage === 'killed').map(i => `${i.title} (${clip(i.note, 120)})`).join('; ') || 'none'}`,
      `# ${P.text.ordersTitle} so far\n${s.orders.map(P.orderLine).join('\n') || '(none)'}`,
      `# Open build requests\n${s.builds.filter(b => b.status === 'requested' || b.status === 'accepted').map(b => `- ${b.id} [${b.status}] ${b.title} (${b.department})`).join('\n') || '(none)'}`,
      `# Questions\nWaiting for the owner: ${s.decisions.filter(d => d.status === 'open').map(d => `"${clip(d.question, 160)}" (meanwhile: ${d.ifNoAnswer || 'continue'})`).join('; ') || 'none'}\nHeld (not yet asked): ${s.decisions.filter(d => d.status === 'held').length}\nDecided by the company recently: ${s.decisions.filter(d => d.status === 'auto').slice(-5).map(d => `"${clip(d.question, 120)}" -> ${clip(d.choice, 80)}`).join('; ') || 'none'}`,
      `# Facts measured just now (deterministic)\n${J(facts)}`,
    ].join('\n\n')
  }

  // ---- 2. CEO plan
  api.phase('CEO plan')
  const plan = await api.agent(start.ceo, [
    context(),
    answered.length ? `# The owner answered\n${answered.map(d => `- "${d.question}" -> ${d.choice}${d.overruled ? ` (the owner overruled the company's own choice "${d.companyChoice}")` : ''}${d.note ? ` (${d.note})` : ''}`).join('\n')}` : null,
    lastBrief ? `# Your previous brief\n${readClip(path.join(co.reports, lastBrief.report), 3000)}` : null,
    focus ? `# The owner's focus for this cycle\n${focus}` : null,
    `# Your job now\n${P.prompts.plan}\n\n${DECISION_RULE}`,
  ].filter(Boolean).join('\n\n'), { schema: planSchema(depIds), label: 'ceo:plan' })
  if (!plan) throw new Error('the CEO produced no plan')
  api.save('plan.json', plan)
  co.update(s => {
    for (const d of answered) { const x = s.decisions.find(y => y.id === d.id); if (x) x.seenByCeo = true }
    for (const k of plan.kills ?? []) {
      const i = s.initiatives.find(x => x.id === k.initiativeId)
      if (i && i.stage !== P.gatedStage && !i.awaitingOwner && i.stage !== 'killed') { i.stage = 'killed'; i.note = str(k.reason, 600); i.history.push({ ts: now(), cycle: cycleId, stage: 'killed', note: i.note }); summary.killed.push(i.title) }
    }
    for (const d of plan.decisions ?? []) {
      const r = co.askOwner(s, { from: s.ceo, cycle: cycleId, ...d })
      api.log(`question for the owner (${r.rec.category}): ${r.status === 'auto' ? `not sent, decided by the company: ${r.rec.choice}` : r.status === 'held' ? 'held until the owner is free; continuing with the stated default' : 'asked'}`)
    }
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
  const work = co.update(s => directives.map(d => {
    let ini = d.initiativeId ? s.initiatives.find(x => x.id === d.initiativeId && x.stage !== 'killed') : null
    if (!ini) {
      const n = d.newInitiative ?? {}
      ini = { id: newId('i'), title: str(n.title || d.brief, 120).split('\n')[0], thesis: str(n.thesis || d.brief, 1500), kind: n.kind ?? P.initiativeKinds[0], department: d.department, stage: P.stages[0], confidence: null, createdAt: now(), history: [{ ts: now(), cycle: cycleId, stage: P.stages[0], note: 'opened by the CEO' }] }
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
      P.prompts.deptExtra(facts),
    ].join('\n\n')
    let text = ''
    let sub = null
    if (dep.superTeamId) {
      try {
        const posted = co.supers.post(dep.superTeamId, brief)
        sub = posted.runId
        patchCycle(c => { c.subRuns.push({ runId: sub, department: dep.id, initiative: initiativeId, superTeam: dep.superTeamId }) })
        api.log(`${dep.id}: super team run ${sub}`)
        const st = await waitRun(engine, sub, api.signal)
        text = st.status === 'completed' ? asText(st.result) : ''
        if (!text) api.log(`${dep.id}: super team run ended ${st.status}${st.error ? `: ${String(st.error).split('\n')[0]}` : ''}`)
      } catch (e) { api.log(`${dep.id}: super team unavailable (${e.message}); asking the lead directly`) }
    }
    if (api.signal.aborted) return null
    const report = await api.agent(dep.lead, [
      `You are the head of ${dep.name}. The CEO's brief:\n${brief}`,
      text ? `# What your teams produced\n${clip(text, 30000)}` : '# Your teams produced nothing usable this time. Do the analysis yourself from the files, as far as you can.',
      `# Your job now\nReport to the CEO in the required form. Evidence: one line per claim with its source file or data and its strength. ${P.proposal.reportRule} ${P.prompts.report} Confidence is a probability, not a mood.`,
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
      if (!i || i.stage === P.gatedStage || i.awaitingOwner) continue
      if (P.agentStages.includes(r.report.recommendedStage) && r.report.recommendedStage !== 'killed') i.stage = r.report.recommendedStage
      i.confidence = Number.isFinite(r.report.confidence) ? round(Math.min(1, Math.max(0, r.report.confidence)), 3) : i.confidence
      i.confidenceBasis = 'department estimate'
      i.note = str(r.report.summary, 800)
      i.evidence = (r.report.evidence ?? []).slice(0, 12).map(e => ({ claim: str(e.claim, 300), source: str(e.source, 200), strength: e.strength }))
      i.blockers = (r.report.blockers ?? []).slice(0, 6).map(b => str(b, 300))
      i.history.push({ ts: now(), cycle: cycleId, stage: i.stage, note: i.note })
      for (const b of (r.report.buildSpecs ?? []).slice(0, 2)) {
        if (s.builds.some(x => x.title === b.title)) continue
        s.builds.push({ id: newId('b'), ts: now(), cycle: cycleId, initiative: i.id, department: r.dep.id, title: str(b.title, 160), spec: str(b.spec, 6000), expectedValue: str(b.expectedValue, 600), status: 'requested' })
      }
    }
  })
  await guard('departments')

  // ---- 5. gate
  api.phase('Gate')
  const candidates = []
  for (const r of reports) for (const p of r.report.proposals ?? []) if (P.proposal.has(p)) candidates.push({ ...p, initiativeId: r.initiativeId, department: r.dep.id })
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
    `# Your job now\n${P.prompts.review}\n\n${DECISION_RULE}`,
  ].filter(Boolean).join('\n\n'), { schema: REVIEW, label: 'ceo:review' })

  const spent = round(await co.cycleSpend(cycleId))
  const name = `${today()}-${cycleId}.md`
  const md = [
    `# CEO brief ${today()} (cycle ${cycleId})`, '',
    review?.brief ?? `The CEO did not deliver a review. Plan assessment:\n\n${plan.assessment}`, '',
    '## Cycle record (written by code, not by an agent)', '',
    `- Directives: ${work.map(w => `${w.directive.department} → "${w.title}"`).join('; ') || 'none'}`,
    `- Gate: ${summary.proposals.join(' | ') || 'no proposals submitted'}`,
    `- ${P.text.ordersTitle}: ${summary.orders.join(', ') || 'none'}`,
    `- Hires: ${summary.hires.join('; ') || 'none'}`,
    `- Killed: ${[...summary.killed, ...(review?.initiativeUpdates ?? []).filter(u => u.stage === 'killed').map(u => work.find(w => w.initiativeId === u.id)?.title ?? u.id)].join('; ') || 'none'}`,
    `- Model spend this cycle: $${spent}${co.metering === 'balance' ? '' : ' (estimated from run costs; on a Claude subscription this is notional)'}`,
    ...P.factsRecord(facts),
  ].join('\n')
  fs.writeFileSync(path.join(co.reports, name), md)
  co.update(s => {
    for (const u of review?.initiativeUpdates ?? []) {
      const i = s.initiatives.find(x => x.id === u.id)
      if (!i || i.stage === P.gatedStage || i.awaitingOwner || !P.agentStages.includes(u.stage)) continue
      i.stage = u.stage
      if (Number.isFinite(u.confidence)) { i.confidence = round(Math.min(1, Math.max(0, u.confidence)), 3); i.confidenceBasis = 'CEO estimate' }
      i.note = str(u.note, 800)
      i.history.push({ ts: now(), cycle: cycleId, stage: u.stage, note: i.note })
    }
    for (const d of review?.decisions ?? []) {
      const r = co.askOwner(s, { from: s.ceo, cycle: cycleId, ...d })
      api.log(`question for the owner (${r.rec.category}): ${r.status === 'auto' ? `not sent, decided by the company: ${r.rec.choice}` : r.status === 'held' ? 'held until the owner is free; continuing with the stated default' : 'asked'}`)
    }
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
  if (registry.listAgents().filter(a => P.isOurs(a.name)).length >= hc.maxAgents) { api.log('hire skipped: the organisation is at its maximum size'); return null }

  const existing = registry.listAgents().filter(a => !a.invalid && P.isOurs(a.name)).map(a => `- ${a.name}: ${a.description}`).join('\n')
  const spec = await api.agent(P.recruiterName, `Hiring request from the CEO for the ${dep.name} department (team ${h.team}).\nNeed: ${h.need}\nWhy: ${h.why}\n\nExisting agents (do not duplicate):\n${existing}\n\nWrite the agent specification.`, { schema: RECRUIT, label: 'hr:recruit' })
  if (!spec) return null
  const review = await api.agent(P.reviewerName, `Review this proposed hire.\nRequest: ${h.need} (${h.why})\nSpecification:\n${J(spec)}\n\nExisting agents:\n${existing}`, { schema: HR_REVIEW, label: 'hr:review' })
  let name = String(spec.name ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36)
  if (!P.isOurs(name)) name = `${P.prefix}${name}`.slice(0, 36)
  const rec = { id: newId('h'), ts: now(), cycle: cycleId, department: dep.id, team: h.team, need: str(h.need, 400), why: str(h.why, 600), name, description: str(spec.description, 300), model: spec.model }
  const exists = n => { try { registry.getAgent(n); return true } catch { return false } }
  if (!review?.approve) { co.update(s => { s.hires.push({ ...rec, status: 'rejected', reason: str(review?.reason ?? 'HR review failed', 400) }) }); return null }
  if (name.length < P.prefix.length + 3 || exists(name)) { co.update(s => { s.hires.push({ ...rec, status: 'rejected', reason: 'name taken or invalid' }) }); return null }

  // the template is fixed in code: a hire can only choose its words, its model tier, web access and skills
  const def = P.baseAgent({
    name,
    description: rec.description,
    ...P.modelFields(spec.model === P.models.lead ? P.models.lead : P.models.fast),
    tools: spec.needsWeb ? ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'] : ['Read', 'Grep', 'Glob'],
    skills: [...new Set([...P.skills.base, ...(spec.skills ?? []).filter(k => P.skills.all.includes(k))])],
    tags: [...P.tags, 'company', 'hired'],
    role: `${str(review.role || spec.role, 2400)}\n\n${P.hardRules}`,
  })
  let team = String(h.team ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40)
  if (!P.isOurs(team)) team = `${P.prefix}${team}`

  if (hc.mode === 'observe') {
    co.update(s => {
      s.hires.push({ ...rec, team, status: 'proposed', def })
      co.addDecision(s, { from: P.peopleLeadName, cycle: cycleId, kind: 'hire', hire: rec.id, question: `Hire ${name} into ${team}? ${rec.description}`, options: ['Hire', 'Do not hire'], recommendation: 'Hire', why: rec.why })
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
