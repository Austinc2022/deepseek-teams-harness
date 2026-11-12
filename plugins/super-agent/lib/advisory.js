/**
 * Advisory team: an independent consultancy inside the company (docs/GROUP.md).
 *
 * It reviews the whole company (setup, performance, goals and every KPI) and gives the CEO ranked recommendations.
 * Independence is enforced in code, not asked for in prompts:
 *   - it reports to the owner (and the group headquarters when the company has joined one), not to the CEO;
 *   - its agents and team are protected: no super agent can change, staff, restructure or re-prompt them (org.js);
 *   - it has its own daily spend cap and does not stop when the company's budget is spent;
 *   - it reads everything and changes nothing (read-only analysts).
 *
 * The cycle:
 *   review     four advisors read the company through their own lens in parallel; the advisory lead merges their
 *              findings into a scorecard and at most 8 recommendations, each tied to a KPI where one fits
 *   respond    the CEO must accept, reject or defer each recommendation with a reason (respond_advice); accepted
 *              ones are marked done with evidence later
 *   follow up  the next review measures every accepted recommendation against its KPI (then vs now) and says
 *              whether it helped
 *   escalate   a rejected high-severity recommendation, or one left unanswered for 4 days, goes to the owner (and
 *              is shown to the headquarters); the owner can overrule
 *
 * Reviews run on a schedule (every settings.everyDays), on demand, and after big events (a failing health check that
 * persists, a sharp drop of the company score), at most one event review a day.
 * State: forge/company/advisory/state.json; each review's context and report in forge/company/advisory/reviews/<id>/.
 */
import fs from 'node:fs'
import path from 'node:path'
import { profile as P } from '../../company/lib/profile.js'
import { now, newId, str, clip } from './store.js'
import { progress } from './views.js'

const HOUR = 3600_000
const DAY = 24 * HOUR
const S = { type: 'string' }
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
const LABEL = { type: 'string', enum: ['measured', 'simulated', 'argued'], description: 'measured: a number from the system; simulated: from a model or test run; argued: your reasoning' }
const SEV = { type: 'string', enum: ['high', 'medium', 'low'] }

/** The numbers a review is measured on. A recommendation names one of them in `kpi` when it should move it. */
export const KPIS = {
  companyScore: { label: 'Company score (out of 100)', better: 'up' },
  goalPercent: { label: 'Goal progress (%)', better: 'up' },
  delivered7d: { label: 'Tickets delivered in 7 days', better: 'up' },
  deliveryRate7d: { label: 'Share of ended tickets that were delivered (7 days)', better: 'up' },
  failed7d: { label: 'Tickets failed or stopped in 7 days', better: 'down' },
  openTickets: { label: 'Open tickets', better: 'none' },
  gatePassed30d: { label: 'Gate passes in 30 days', better: 'up' },
  activeInitiatives: { label: 'Initiatives in progress', better: 'none' },
  killed30d: { label: 'Initiatives killed in 30 days', better: 'none' },
  spend7dUsd: { label: 'Model spend in 7 days (USD)', better: 'down' },
  healthFails: { label: 'Failing health checks and showstoppers', better: 'down' },
  runFailures6h: { label: 'Failed agent runs in 6 hours', better: 'down' },
  plansFresh: { label: 'Leaders whose plan changed in 24 h (%)', better: 'up' },
  ownerQuestionsOpen: { label: 'Questions waiting for the owner', better: 'down' },
  lowUnits: { label: 'Units scoring below the low mark', better: 'down' },
}

const FINDINGS = obj({
  grade: { type: 'number', description: 'your grade for the company through your lens, 0 to 100 (100: the best run company in its field)' },
  summary: { type: 'string', description: 'three to five sentences: the state through your lens, with numbers' },
  strengths: { type: 'array', items: S, description: 'what works and must be kept, at most 4' },
  problems: { type: 'array', items: obj({ issue: S, evidence: { type: 'string', description: 'the number, file or record that shows it' }, label: LABEL }), description: 'what holds the company back, most important first, at most 6' },
  recommendations: { type: 'array', items: obj({ title: S, detail: { type: 'string', description: 'what exactly to change, who does it, and how to know it worked' }, severity: SEV, expectedEffect: S, kpi: { type: 'string', description: `the KPI it should move: one of ${Object.keys(KPIS).join(', ')}; empty if none fits` } }), description: 'at most 4, most valuable first' },
  followUps: { type: 'array', items: obj({ id: S, verdict: { type: 'string', enum: ['helped', 'no-change', 'worse', 'too-early', 'not-done'] }, note: S }), description: 'for every earlier recommendation listed as accepted or done that falls under your lens: did it help?' },
})
const LEAD = obj({
  overall: { type: 'number', description: 'overall grade 0 to 100' },
  summary: { type: 'string', description: 'the review in five to eight sentences for the CEO and the owner: where the company stands, the biggest lever, the biggest risk' },
  scorecard: { type: 'array', items: obj({ area: S, grade: { type: 'number' }, note: S }), description: 'one row per lens, plus any area you add' },
  recommendations: { type: 'array', items: obj({ title: S, detail: S, area: S, severity: SEV, expectedEffect: S, kpi: S, evidence: S, label: LABEL }), description: 'at most 8, merged and ranked across the advisors: no duplicates, most valuable first; do not repeat an earlier recommendation that is still open unless it changed' },
  followUps: { type: 'array', items: obj({ id: S, verdict: { type: 'string', enum: ['helped', 'no-change', 'worse', 'too-early', 'not-done'] }, note: S }), description: 'one verdict per earlier accepted or done recommendation' },
  ownerNote: { type: 'string', description: 'what the owner should know or decide, or empty' },
})

export class Advisory {
  constructor(sa) {
    this.sa = sa
    this.dir = path.join(sa.co.dir, 'advisory')
    this.file = path.join(this.dir, 'state.json')
    fs.mkdirSync(path.join(this.dir, 'reviews'), { recursive: true })
    this.busy = null
    this.failSince = null
  }

  // ---------------------------------------------------------------- state
  read() {
    let s
    try { s = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { s = {} }
    s.settings = { enabled: true, everyDays: 7, eventReviews: true, maxUsdPerDay: 25, answerHours: 48, escalateHours: 96, ...(s.settings ?? {}) }
    s.reviews ??= []
    s.recs ??= []
    s.days ??= {}
    return s
  }
  update(fn) {
    const s = this.read()
    const out = fn(s)
    const tmp = `${this.file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(s, null, 1))
    fs.renameSync(tmp, this.file)
    return out
  }
  spentToday(s = this.read()) { return s.days[new Date().toISOString().slice(0, 10)] ?? 0 }

  // ---------------------------------------------------------------- the team
  /** Create the advisors, the lead and the team when missing. Their files are the owner's: setup never rewrites them. */
  seed() {
    const { registry } = this.sa.forge
    const has = n => { try { registry.getAgent(n); return true } catch { return false } }
    const rules = `# Independence\nYou are on the independent advisory team of ${P.companyName}. You are not part of the management chain: you report to the owner (and the group headquarters when there is one), and nobody in the company can change your instructions or your team. Never soften a finding to please the CEO, and never advise what the hard rules forbid. Read everything you need; change nothing. Label every claim measured (a number from the system), simulated or argued. A recommendation must be concrete: what to change, who does it, how to know it worked.\n\n${P.hardRules}`
    const base = { ...P.modelFields(P.models.lead), effort: 'high', memory: { mode: 'none' }, maxTurns: 40, skills: [], tags: [...P.tags, 'company', 'advisory'] }
    const made = []
    for (const a of P.advisors) {
      if (has(a.name)) continue
      registry.saveAgent(P.baseAgent({ ...base, name: a.name, description: `Advisory team: ${a.title}. Reviews the whole company through this lens and advises the CEO; independent of management.`, role: `You review ${P.companyName} through one lens: ${a.lens}. You get the facts of the company in a context file and may read its state files and reports. Grade it against the best run company in its field, name what holds it back with evidence, and recommend the few changes that would move the goal the most. For every earlier recommendation that was accepted, judge from the numbers whether it helped.\n\n${rules}` }))
      made.push(a.name)
    }
    if (!has(P.advisoryLeadName)) {
      registry.saveAgent(P.baseAgent({ ...base, name: P.advisoryLeadName, description: 'Advisory lead: merges the advisors\' findings into one review for the CEO and the owner; independent of management.', role: `You lead the independent advisory team of ${P.companyName}. You receive the findings of the advisors (organisation, performance, strategy, governance) and the facts of the company. You check their claims against the facts, drop what is not supported, merge duplicates, and write one review: an overall grade, a scorecard per area, and at most 8 recommendations ranked by value to the goal. Each recommendation says what to change, who does it, its expected effect and the KPI that will show it worked. Judge every earlier accepted recommendation: did it help?\n\n${rules}` }))
      made.push(P.advisoryLeadName)
    }
    const team = P.advisoryTeamName
    let t = null
    try { t = registry.getTeam(team) } catch {}
    const members = [P.advisoryLeadName, ...P.advisors.map(a => a.name)]
    if (!t || members.some(m => !t.members.includes(m))) registry.saveTeam({ ...(t ?? {}), name: team, description: 'Independent advisory team: reviews the company and advises the CEO. Reports to the owner.', members })
    return made
  }

  // ---------------------------------------------------------------- KPIs
  kpis() {
    const sa = this.sa
    const s = sa.store.read()
    const c = sa.co.read()
    const age = t => Date.now() - new Date(t ?? 0).getTime()
    const ended7 = s.tickets.filter(t => t.status === 'ended' && age(t.endedAt) < 7 * DAY)
    const delivered = ended7.filter(t => t.outcome === 'completed').length
    let companyScore = null, lowUnits = null
    try {
      const { units } = sa.perf.scores()
      const roots = Object.values(units).filter(u => !u.parent || !units[u.parent])
      const top = roots.find(u => u.score != null)
      companyScore = top ? top.score : null
      lowUnits = Object.values(units).filter(u => u.low).length
    } catch {}
    let healthFails = null, runFailures6h = null
    try {
      const h = sa.health.view()
      healthFails = h.fail
      runFailures6h = (h.problems ?? []).filter(p => p.active).reduce((n, p) => n + p.count, 0)
    } catch {}
    let goalPercent = null
    try { goalPercent = progress(sa).percent ?? null } catch {}
    const spend = sa.co.ledgerRead(3000).filter(e => e.kind === 'model' && age(e.ts) < 7 * DAY).reduce((n, e) => n + (e.usd ?? 0), 0)
    const leaders = s.agents.filter(a => !a.paused)
    return {
      at: now(),
      companyScore, goalPercent,
      delivered7d: delivered,
      deliveryRate7d: ended7.length ? Math.round((100 * delivered) / ended7.length) : null,
      failed7d: ended7.length - delivered,
      openTickets: s.tickets.filter(t => t.status === 'open').length,
      gatePassed30d: c.orders.filter(o => age(o.ts) < 30 * DAY).length,
      activeInitiatives: c.initiatives.filter(i => ![P.gatedStage, 'killed'].includes(i.stage)).length,
      killed30d: c.initiatives.filter(i => i.stage === 'killed' && age(i.history?.at(-1)?.ts) < 30 * DAY).length,
      spend7dUsd: Math.round(spend * 100) / 100,
      healthFails, runFailures6h,
      plansFresh: leaders.length ? Math.round((100 * leaders.filter(a => a.plan?.updatedAt && age(a.plan.updatedAt) < DAY).length) / leaders.length) : null,
      ownerQuestionsOpen: c.decisions.filter(d => d.status === 'open').length,
      lowUnits,
    }
  }

  // ---------------------------------------------------------------- the review
  /** Why a review cannot start now, or null. Own cap; not the company budget (the CEO cannot starve its reviewers). */
  blocked() {
    const s = this.read()
    if (this.busy) return 'a review is already running'
    if (fs.existsSync(path.join(this.sa.co.dir, 'PAUSED'))) return 'the company is paused'
    if (this.spentToday(s) >= s.settings.maxUsdPerDay) return `today's advisory budget ($${s.settings.maxUsdPerDay}) is spent`
    return null
  }

  async run({ trigger = 'manual', focus } = {}) {
    const why = this.blocked()
    if (why) throw new Error(`cannot start a review: ${why}`)
    try { this.seed() } catch (e) { this.sa.log(`advisory seed: ${e.message}`) }
    const id = newId('r')
    const dir = path.join(this.dir, 'reviews', id)
    fs.mkdirSync(dir, { recursive: true })
    const kpis = this.kpis()
    const context = this.context(kpis, { focus })
    fs.writeFileSync(path.join(dir, 'CONTEXT.md'), context)
    this.update(s => { s.reviews.push({ id, trigger: str(trigger, 200), focus: focus ? str(focus, 600) : undefined, status: 'running', startedAt: now(), kpis }); s.reviews = s.reviews.slice(-60) })
    const open = this.read().recs.filter(r => ['accepted', 'done', 'owner-accepted'].includes(r.status) && !r.followUps?.some(f => f.verdict === 'helped'))
    const followText = open.length ? `\n\n# Earlier recommendations to follow up (judge each one that falls under your lens)\n${open.map(r => `- ${r.id} [${r.status}] ${r.title}${r.kpi ? ` (KPI ${r.kpi}: ${r.kpiAtAccept ?? r.kpiAtIssue ?? '?'} when accepted, ${kpis[r.kpi] ?? '?'} now)` : ''}${r.response?.reason ? `; CEO: ${clip(r.response.reason, 200)}` : ''}`).join('\n')}` : ''
    const { engine } = this.sa.forge
    const { id: runId, done } = engine.startCustom('advisory: company review', async api => {
      const results = await Promise.all(P.advisors.map(a => api.agent(a.name, `Review the company through your lens (${a.title}). The facts are in ${path.join(dir, 'CONTEXT.md')}: read it first, then read state files or reports where you need more. Return your findings.${focus ? `\n\nThe owner asked to look at: ${focus}` : ''}${followText}`, { schema: FINDINGS, label: `advisor:${a.key}`, cwd: dir, signal: AbortSignal.timeout(25 * 60_000) }).then(r => ({ key: a.key, title: a.title, r })).catch(e => ({ key: a.key, title: a.title, r: null, error: e.message }))))
      fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(results, null, 1))
      const got = results.filter(x => x.r)
      if (!got.length) throw new Error('no advisor returned findings')
      const lead = await api.agent(P.advisoryLeadName, `Merge the advisors' findings into one review. The facts of the company are in ${path.join(dir, 'CONTEXT.md')}; check claims against them.\n\n# Findings\n${got.map(x => `## ${x.title} (grade ${x.r.grade})\n${JSON.stringify(x.r, null, 1)}`).join('\n\n')}${results.some(x => !x.r) ? `\n\n(No findings from: ${results.filter(x => !x.r).map(x => x.title).join(', ')}.)` : ''}${followText}`, { schema: LEAD, label: 'advisory-lead', cwd: dir, signal: AbortSignal.timeout(20 * 60_000) })
      if (!lead) throw new Error('the advisory lead returned no review')
      return { results, lead }
    }, { advisory: id, trigger }, { cwd: dir, meta: { advisoryReview: id } })
    this.busy = { id, runId }
    this.update(s => { const r = s.reviews.find(x => x.id === id); if (r) r.runId = runId })
    done.then(st => this.#finish(id, dir, st, kpis)).catch(e => {
      this.sa.log(`advisory review ${id}: ${e.message}`)
      this.update(s => { const r = s.reviews.find(x => x.id === id); if (r) { r.status = 'failed'; r.error = str(e.message, 300); r.endedAt = now() } })
    }).finally(() => { this.busy = null })
    return { id, runId }
  }

  #finish(id, dir, st, kpis) {
    const usd = st.costUsd ?? 0
    const day = new Date().toISOString().slice(0, 10)
    this.sa.co.ledger({ kind: 'advisory', usd: Math.round(usd * 10000) / 10000, note: `advisory review ${id}` })
    if (st.status !== 'completed' || !st.result?.lead) {
      this.update(s => { s.days[day] = (s.days[day] ?? 0) + usd; const r = s.reviews.find(x => x.id === id); if (r) { r.status = 'failed'; r.error = str(st.error ?? st.status, 300).split('\n')[0]; r.endedAt = now(); r.costUsd = usd } })
      this.sa.say({ from: 'advisory', kind: 'system', text: `The advisory review did not finish: ${str(st.error ?? st.status, 200).split('\n')[0]}` })
      return
    }
    const { lead, results } = st.result
    const recs = (lead.recommendations ?? []).slice(0, 8).map(r => ({
      id: newId('v'), reviewId: id, ts: now(), title: str(r.title, 200), detail: str(r.detail, 3000), area: str(r.area, 80), severity: ['high', 'medium', 'low'].includes(r.severity) ? r.severity : 'medium',
      expectedEffect: str(r.expectedEffect, 600), kpi: KPIS[r.kpi] ? r.kpi : null, kpiAtIssue: KPIS[r.kpi] ? kpis[r.kpi] : null, evidence: str(r.evidence, 800), label: r.label, status: 'open',
    }))
    const report = [
      `# Advisory review ${id}`, `${now().slice(0, 16)} · overall ${Math.round(lead.overall)}/100`, '', lead.summary, '',
      '## Scorecard', ...(lead.scorecard ?? []).map(x => `- ${x.area}: ${Math.round(x.grade)}/100. ${x.note}`), '',
      '## Recommendations', ...recs.map((r, i) => `${i + 1}. **${r.title}** (${r.severity}${r.kpi ? `, KPI ${KPIS[r.kpi].label}` : ''}) [${r.id}]\n   ${r.detail}\n   Expected effect: ${r.expectedEffect}`), '',
      (lead.followUps ?? []).length ? `## Earlier advice: did it help?\n${lead.followUps.map(f => `- ${f.id}: ${f.verdict}. ${f.note}`).join('\n')}` : '',
      lead.ownerNote ? `## For the owner\n${lead.ownerNote}` : '',
      '## The advisors', ...results.map(x => `### ${x.title}${x.r ? ` (grade ${Math.round(x.r.grade)})` : ' (no findings)'}\n${x.r?.summary ?? x.error ?? ''}`),
    ].filter(x => x !== '').join('\n')
    fs.writeFileSync(path.join(dir, 'REPORT.md'), report)
    this.update(s => {
      s.days[day] = (s.days[day] ?? 0) + usd
      for (const f of lead.followUps ?? []) {
        const r = s.recs.find(x => x.id === f.id)
        if (r) (r.followUps ??= []).push({ ts: now(), review: id, verdict: f.verdict, note: str(f.note, 600), kpiNow: r.kpi ? kpis[r.kpi] : null })
      }
      s.recs.push(...recs)
      s.recs = s.recs.slice(-300)
      const r = s.reviews.find(x => x.id === id)
      Object.assign(r, { status: 'completed', endedAt: now(), costUsd: usd, overall: Math.round(lead.overall), summary: str(lead.summary, 3000), scorecard: lead.scorecard ?? [], ownerNote: str(lead.ownerNote, 1500), recs: recs.map(x => x.id), advisors: results.map(x => ({ key: x.key, title: x.title, grade: x.r ? Math.round(x.r.grade) : null, summary: str(x.r?.summary ?? x.error ?? '', 1200) })) })
    })
    const ceo = this.ceoId()
    this.sa.trigger({
      key: `advice:${id}`, source: 'advisory', kind: 'advice', to: ceo,
      text: `The independent advisory team finished a review of the company (overall ${Math.round(lead.overall)}/100). It reports to the owner, who reads your answers.\n\n${lead.summary}\n\n# Recommendations\n${recs.map(r => `- ${r.id} (${r.severity}${r.kpi ? `, KPI ${r.kpi}` : ''}): ${r.title}\n  ${clip(r.detail, 700)}\n  Expected effect: ${clip(r.expectedEffect, 200)}`).join('\n')}\n\nAnswer every recommendation with respond_advice within ${this.read().settings.answerHours} hours: accept (and put the change in your plan), reject (say why, with evidence), or defer (say until when). A rejected high-severity recommendation goes to the owner. When an accepted one is carried out, answer it again with decision done and the evidence. Full report: ${path.join(dir, 'REPORT.md')}`,
    })
    this.sa.say({ from: 'advisory', kind: 'advisory', text: `Advisory review: overall ${Math.round(lead.overall)}/100, ${recs.length} recommendation(s) sent to the CEO.${lead.ownerNote ? `\nFor you: ${clip(lead.ownerNote, 600)}` : ''}` })
  }

  ceoId() { const s = this.sa.store.read(); return s.agents.find(a => !a.parent)?.id ?? 'ceo' }

  /** The facts of the company, for the advisors. Plain text; they can read the state files for more. */
  context(kpis, { focus } = {}) {
    const sa = this.sa
    const s = sa.store.read()
    const c = sa.co.read()
    const a = this.read()
    const prev = a.reviews.filter(r => r.status === 'completed').at(-1)
    const list = (xs, f, n = 30) => (xs.length ? xs.slice(0, n).map(f).join('\n') : '(none)')
    let perf = '(not available)'
    try {
      const { units } = sa.perf.scores()
      perf = Object.values(units).filter(u => u.score != null).sort((x, y) => (x.score ?? 0) - (y.score ?? 0)).slice(0, 40).map(u => `- ${u.name} (${u.type}): ${u.score}/100${u.trend != null ? `, trend ${u.trend > 0 ? '+' : ''}${Math.round(u.trend)}` : ''}${u.low ? ', LOW' : ''}; ${u.components.filter(k => k.value != null).map(k => `${k.label} ${k.value}`).join(', ')}`).join('\n')
    } catch {}
    let health = '(not available)'
    try { const h = sa.health.view(); health = `status ${h.status}\n${list(h.checks.filter(x => x.status !== 'ok'), x => `- ${x.name}: ${x.status}. ${x.detail}`)}\nProblems:\n${list(h.problems.filter(p => p.active), p => `- ${p.signature} (${p.count}x, ${p.severity})`)}` } catch {}
    const plans = s.agents.map(x => `## ${x.title ?? x.id} (${x.id}${x.kind ? `, ${x.kind}` : ''})\nFocus: ${x.plan?.focus ?? '(no plan)'}\nOutcome: ${x.plan?.outcome ?? '?'} by ${x.plan?.expectedBy ?? '?'}; ${x.plan?.pctComplete ?? '?'}% (${x.plan?.pctBasis ?? ''})\nPriorities: ${(x.plan?.priorities ?? []).map(p => p.text).join(' | ') || '-'}\nTo do: ${(x.plan?.todo ?? []).map(t => `[${t.status}] ${t.text}`).slice(0, 15).join('; ') || '-'}\nBlockers: ${(x.plan?.blockers ?? []).join(' | ') || '-'}\nPlan updated: ${x.plan?.updatedAt ?? 'never'}`).join('\n\n')
    const spendDays = Object.keys(c.days).sort().slice(-14).map(k => `${k}: $${c.days[k].modelUsd ?? 0}`).join(', ')
    const recs = a.recs.slice(-40).reverse()
    const group = (() => { try { return sa.group?.view?.() ?? null } catch { return null } })()
    return [
      `# ${P.label}: facts for the advisory review (${now().slice(0, 16)})`,
      focus ? `The owner asked to look at: ${focus}` : '',
      `# Charter\nMission: ${c.charter.mission}\nNorth star: ${P.northStarText(c.charter)}\nBudget: $${c.charter.budget.dailyUsd} a day (spent today $${sa.co.budget().spentTodayUsd}); spend by day: ${spendDays || '-'}\nAutonomy: ${c.charter.autonomy.level}; autopilot ${c.charter.autopilot.enabled ? `on (${c.charter.autopilot.mode})` : 'off'}\nRules:\n${(c.charter.rules ?? []).map(r => `- ${r}`).join('\n') || '-'}`,
      `# KPIs now\n${Object.entries(KPIS).map(([k, v]) => `- ${k} (${v.label}): ${kpis[k] ?? 'no data'}${prev?.kpis && prev.kpis[k] !== undefined ? ` (last review: ${prev.kpis[k] ?? 'no data'})` : ''}`).join('\n')}`,
      prev ? `# The last review (${prev.endedAt?.slice(0, 10)}, overall ${prev.overall}/100)\n${prev.summary}` : '# The last review\nThis is the first review.',
      `# Organisation\nDepartments: ${c.departments.map(d => `${d.name} (lead ${d.lead}; teams ${d.teams.join(', ')})`).join('; ') || '-'}\nSuper agents: ${s.agents.map(x => `${x.id}${x.parent ? ` under ${x.parent}` : ' (root)'}`).join(', ')}\nAgents: ${sa.forge.registry.listAgents().filter(x => !x.invalid && P.isOurs(x.name)).length}; super teams: ${sa.co.supers.list().length}; hires: ${c.hires.length}`,
      `# Plans of the leaders\n${plans}`,
      `# Unit scores (lowest first)\n${perf}`,
      `# Health\n${health}`,
      `# Tickets (latest first)\n${list(s.tickets.slice(-40).reverse(), t => `- ${t.id} "${clip(t.title, 90)}" ${t.status}${t.outcome ? `/${t.outcome}` : ''}, ${t.assignments.length} turn(s), owner ${t.owner}${t.target ? `, target ${t.target}` : ''}`)}`,
      `# Initiatives\n${list(c.initiatives.slice(-40).reverse(), i => `- ${i.id} "${clip(i.title, 90)}" stage ${i.stage}, confidence ${i.confidence ?? '?'}, department ${i.department}`)}`,
      `# Gate results (latest first)\n${list(c.orders.slice(-15).reverse(), o => P.orderLine(o))}`,
      `# Decisions (latest first)\n${list(c.decisions.slice(-20).reverse(), d => `- [${d.status}] ${clip(d.question, 160)}${d.choice ? ` -> ${clip(d.choice, 80)}` : ''}`)}`,
      `# What the owner reads in the feed (latest first)\n${list(s.feed.slice(-30).reverse(), m => `- ${m.ts.slice(0, 16)} ${m.from}: ${clip(m.text, 220)}`)}`,
      `# Earlier advisory recommendations (latest first)\n${list(recs, r => `- ${r.id} [${r.status}] (${r.severity}) ${r.title}${r.response ? `; CEO ${r.response.decision}: ${clip(r.response.reason, 200)}` : ''}${r.followUps?.length ? `; follow-up: ${r.followUps.at(-1).verdict}` : ''}`)}`,
      group ? `# Group headquarters\nJoined ${group.hq?.name ?? group.hq?.url ?? '?'}, authority ${group.authority}. Open directives: ${(group.directives ?? []).filter(d => ['new', 'accepted'].includes(d.status)).map(d => clip(d.text, 160)).join(' | ') || 'none'}` : '',
      `# Where to read more (read-only)\n- Company state: ${sa.co.file}\n- Super agent state: ${sa.store.file ?? path.join(sa.store.dir, 'state.json')}\n- COO briefs: ${sa.co.reports}\n- Ticket folders: ${sa.store.work}\n- Earlier reviews: ${path.join(this.dir, 'reviews')}`,
    ].filter(Boolean).join('\n\n')
  }

  // ---------------------------------------------------------------- the CEO answers
  /** respond_advice: { id, decision: accept | reject | defer | done, reason, until? } */
  respond(me, a) {
    const decision = String(a.decision ?? '')
    if (!['accept', 'reject', 'defer', 'done'].includes(decision)) throw new Error('decision is accept, reject, defer or done')
    const reason = str(a.reason, 2000).trim()
    if (reason.length < 20) throw new Error('give a reason (20+ characters); for reject, the evidence')
    const kpis = this.kpis()
    const out = this.update(s => {
      const r = s.recs.find(x => x.id === String(a.id))
      if (!r) throw new Error(`no recommendation ${a.id}`)
      if (decision === 'done' && !['accepted', 'owner-accepted'].includes(r.status)) throw new Error('only an accepted recommendation can be done')
      if (['done', 'dismissed'].includes(r.status)) throw new Error(`recommendation ${r.id} is already ${r.status}`)
      r.response = { by: me.id, decision, reason, ts: now(), ...(decision === 'defer' && a.until ? { until: str(a.until, 40) } : {}) }
      ;(r.history ??= []).push(r.response)
      r.status = { accept: 'accepted', reject: 'rejected', defer: 'deferred', done: 'done' }[decision]
      if (decision === 'accept') { r.acceptedAt = now(); r.kpiAtAccept = r.kpi ? kpis[r.kpi] : null }
      if (decision === 'done') r.doneAt = now()
      if (decision === 'reject' && r.severity === 'high') r.escalate = 'rejected high-severity'
      return r
    })
    if (out.escalate && !out.escalatedAt) this.#escalate(out.id, `the CEO rejected a high-severity recommendation: ${reason}`)
    return `Recorded: ${out.id} ${out.status}.${out.escalate ? ' It goes to the owner because it is high severity.' : ''}`
  }

  #escalate(id, why) {
    const r = this.update(s => { const x = s.recs.find(y => y.id === id); if (x) { x.escalatedAt = now(); x.escalate = why } return x })
    if (!r) return
    this.sa.say({ from: 'advisory', kind: 'advisory', question: true, text: `Advisory escalation: "${r.title}" (${r.severity}). ${why}\nYou can accept it on the CEO's behalf or dismiss it on the Advisory page.` })
  }

  /** The owner overrules: accept (the CEO must carry it out) or dismiss. */
  ownerDecide(id, { decision, note } = {}) {
    if (!['accept', 'dismiss'].includes(decision)) throw new Error('decision is accept or dismiss')
    const kpis = this.kpis()
    const r = this.update(s => {
      const x = s.recs.find(y => y.id === id)
      if (!x) throw new Error('no such recommendation')
      x.owner = { decision, note: str(note, 1000), ts: now() }
      x.status = decision === 'accept' ? 'owner-accepted' : 'dismissed'
      if (decision === 'accept') { x.acceptedAt = now(); x.kpiAtAccept = x.kpi ? kpis[x.kpi] : null }
      return x
    })
    if (decision === 'accept') this.sa.trigger({ source: 'owner', kind: 'advice-owner-accepted', to: this.ceoId(), text: `The owner accepted advisory recommendation ${r.id} on your behalf: ${r.title}\n${r.detail}${note ? `\nThe owner adds: ${note}` : ''}\nPut it in your plan and carry it out; answer it with respond_advice decision done and the evidence when it is.` })
    return r
  }

  setSettings(patch = {}) {
    return this.update(s => {
      const num = (k, lo, hi) => { const n = Number(patch[k]); if (Number.isFinite(n)) s.settings[k] = Math.min(hi, Math.max(lo, n)) }
      if (typeof patch.enabled === 'boolean') s.settings.enabled = patch.enabled
      if (typeof patch.eventReviews === 'boolean') s.settings.eventReviews = patch.eventReviews
      num('everyDays', 1, 60); num('maxUsdPerDay', 0, 1000); num('answerHours', 4, 336); num('escalateHours', 8, 720)
      return s.settings
    })
  }

  // ---------------------------------------------------------------- the loop (called by the super agent tick)
  async tick() {
    const s = this.read()
    if (!this.seeded) { this.seeded = true; try { const m = this.seed(); if (m.length) this.sa.log(`advisory team created: ${m.join(', ')}`) } catch (e) { this.sa.log(`advisory seed: ${e.message}`) } }
    // reminders and escalations for unanswered advice
    for (const r of s.recs.filter(x => x.status === 'open' || (x.status === 'deferred' && x.response?.until && new Date(x.response.until) < new Date()))) {
      const h = (Date.now() - new Date(r.status === 'deferred' ? r.response.ts : r.ts).getTime()) / HOUR
      if (h > s.settings.escalateHours && !r.escalatedAt) this.#escalate(r.id, `the CEO has not answered it for ${Math.round(h)} hours`)
      else if (h > s.settings.answerHours && !r.remindedAt) {
        this.update(x => { const y = x.recs.find(z => z.id === r.id); if (y) y.remindedAt = now() })
        this.sa.trigger({ key: `advice-remind:${r.id}`, source: 'advisory', kind: 'advice-reminder', to: this.ceoId(), text: `Advisory recommendation ${r.id} is still unanswered after ${Math.round(h)} hours: ${r.title}\n${clip(r.detail, 800)}\nAnswer it with respond_advice (accept, reject with evidence, or defer with a date). After ${s.settings.escalateHours} hours it goes to the owner.` })
      }
    }
    if (!s.settings.enabled || this.busy || !this.sa.store.read().agents.length) return
    const last = s.reviews.filter(r => r.status !== 'failed').at(-1)
    const since = last ? Date.now() - new Date(last.startedAt).getTime() : Infinity
    // a review that was running when the host restarted is over
    if (last?.status === 'running' && !this.busy) { this.update(x => { const y = x.reviews.find(z => z.id === last.id); if (y && y.status === 'running') { y.status = 'failed'; y.error = 'the host restarted during the review'; y.endedAt = now() } }); return }
    let why = null
    if (since >= s.settings.everyDays * DAY) why = last ? `scheduled (every ${s.settings.everyDays} days)` : 'first review'
    else if (s.settings.eventReviews && since >= DAY && !s.reviews.some(r => r.trigger.startsWith('event') && Date.now() - new Date(r.startedAt).getTime() < DAY)) {
      try {
        const h = this.sa.health.view()
        if (h.status === 'fail') this.failSince ??= Date.now(); else this.failSince = null
        if (this.failSince && Date.now() - this.failSince > 2 * HOUR) why = 'event: a health check has been failing for 2 hours'
        const k = this.kpis()
        if (!why && last?.kpis?.companyScore != null && k.companyScore != null && last.kpis.companyScore - k.companyScore >= 10) why = `event: the company score fell from ${last.kpis.companyScore} to ${k.companyScore}`
      } catch {}
    }
    if (!why || this.blocked()) return
    // the first review waits until the company has worked a little
    if (!last && Date.now() - (this.startedAt ??= Date.now()) < 20 * 60_000) return
    await this.run({ trigger: why }).catch(e => this.sa.log(`advisory: ${e.message}`))
  }

  // ---------------------------------------------------------------- views
  view() {
    const s = this.read()
    const latest = s.reviews.filter(r => r.status === 'completed').at(-1) ?? null
    const kpis = this.kpis()
    const recs = s.recs.slice().reverse().map(r => ({ ...r, kpiLabel: r.kpi ? KPIS[r.kpi].label : null, kpiNow: r.kpi ? kpis[r.kpi] : null, better: r.kpi ? KPIS[r.kpi].better : null }))
    const answered = s.recs.filter(r => r.response)
    return {
      settings: s.settings, busy: this.busy, blocked: this.blocked(), spentTodayUsd: Math.round(this.spentToday(s) * 100) / 100,
      team: { lead: P.advisoryLeadName, team: P.advisoryTeamName, advisors: P.advisors.map(a => ({ key: a.key, name: a.name, title: a.title, lens: a.lens })) },
      latest, reviews: s.reviews.slice().reverse().slice(0, 30), recs, kpis, kpiDefs: KPIS,
      stats: {
        open: s.recs.filter(r => r.status === 'open').length, accepted: s.recs.filter(r => ['accepted', 'owner-accepted'].includes(r.status)).length,
        done: s.recs.filter(r => r.status === 'done').length, rejected: s.recs.filter(r => r.status === 'rejected').length, escalated: s.recs.filter(r => r.escalatedAt && !['done', 'dismissed', 'owner-accepted'].includes(r.status)).length,
        acceptRate: answered.length ? Math.round((100 * answered.filter(r => ['accept', 'done'].includes(r.response.decision)).length) / answered.length) : null,
        helped: s.recs.filter(r => r.followUps?.at(-1)?.verdict === 'helped').length,
      },
    }
  }

  report(id) {
    if (!/^r[0-9a-f]{10}$/.test(id)) throw new Error('bad review id')
    const f = path.join(this.dir, 'reviews', id, 'REPORT.md')
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null
  }
}

export const ADVICE_TOOL = {
  name: 'respond_advice',
  description: 'Answer a recommendation of the independent advisory team (it reports to the owner, who reads your answers). accept: you will carry it out (put it in your plan). reject: say why, with evidence; a rejected high-severity recommendation goes to the owner. defer: say until when (until). done: an accepted recommendation is carried out; give the evidence.',
  inputSchema: { type: 'object', properties: { id: S, decision: { type: 'string', enum: ['accept', 'reject', 'defer', 'done'] }, reason: S, until: { type: 'string', description: 'for defer: a date (YYYY-MM-DD)' } }, required: ['id', 'decision', 'reason'] },
}
