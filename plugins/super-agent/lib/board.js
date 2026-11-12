/**
 * The numbers behind the Company dashboard: business units and what each is working on, an activity chart, day
 * series and trends, operating performance, and what happens next. Read-only, except recordMetrics, which the
 * loop calls every ten minutes to append one line to forge/super-agent/metrics.jsonl (the trend history).
 */
import fs from 'node:fs'
import path from 'node:path'
import { now, clip } from './store.js'
import { progress, rightNow, orgView, who, timeline } from './views.js'
import { profile as P } from '../../company/lib/profile.js'
import { outlook, setupAndMemory, agentNames } from './outlook.js'

const DAY = 86400_000
const localDay = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const r2 = n => Math.round(n * 100) / 100
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const metricsFile = sa => path.join(sa.store.dir, 'metrics.jsonl')

/** One line of trend history. Called by the loop holder; cheap. */
export function recordMetrics(sa) {
  const g = progress(sa)
  const b = sa.co.budget()
  const e = sa.ops.snapshot()
  const s = sa.store.read()
  const row = {
    ts: now(), percent: g.percent, done: g.done, balanceUsd: b.balanceUsd ?? null, spentTodayUsd: b.spentTodayUsd ?? 0,
    paperPnlUsd: g.money.paperProfitUsd, booksPnlUsd: r2(e.books.reduce((n, k) => n + k.pnl, 0)), books: Object.fromEntries(e.books.map(k => [k.name, k.equity])),
    engineOk: e.engineFresh && e.collectorFresh, hold: !!sa.holdReason,
    working: s.tickets.filter(t => t.assignments.at(-1)?.status === 'running').length + s.evals.filter(x => x.status === 'running').length,
    pending: s.triggers.filter(t => t.status === 'pending').length,
  }
  fs.appendFileSync(metricsFile(sa), JSON.stringify(row) + '\n')
  return row
}

function readMetrics(sa, max = 3000) {
  let lines = []
  try { lines = fs.readFileSync(metricsFile(sa), 'utf8').trim().split('\n').slice(-max) } catch {}
  return lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

/** The last runs on disk, one row per agent turn. */
export function turns(sa) {
  if (turns.at && Date.now() - turns.at < 15_000) return turns.rows
  const { engine, registry } = sa.forge
  const rows = []
  let ids = []
  try { ids = fs.readdirSync(registry.d.runs).sort().reverse().slice(0, 400) } catch {}
  for (const id of ids) {
    let r
    try { r = engine.getRun(id) } catch { continue }
    for (const a of r.agents ?? []) if (a.startedAt) rows.push({ runId: r.id, file: a.file, agent: a.agent, label: a.label, run: r.orchestration, s: a.startedAt, e: a.endedAt, status: a.status, costUsd: a.costUsd ?? 0, tools: a.tools ?? 0 })
  }
  turns.rows = rows; turns.at = Date.now()
  return rows
}

export function board(sa, { hours = 24 } = {}) {
  const s = sa.store.read()
  const c = sa.co.read()
  const g = progress(sa)
  const rn = rightNow(sa)
  const org = orgView(sa)
  const bud = sa.co.budget()
  const eng = sa.ops.snapshot()
  const rows = turns(sa)
  const today = localDay(Date.now())

  // ---- business units and which agent belongs to which
  const units = []
  const unitOf = {}
  const claim = (agent, id) => { if (agent && !unitOf[agent]) unitOf[agent] = id }
  for (const a of org.superAgents) { units.push({ id: `sa:${a.id}`, type: 'Super agent', name: a.title, who: `super-agent:${a.id}`, lead: a.agent }); claim(a.agent, `sa:${a.id}`) }
  if (org.company.ceo) { units.push({ id: 'ceo', type: 'COO', name: 'COO', who: `agent:${org.company.ceo.name}`, lead: org.company.ceo.name }); claim(org.company.ceo.name, 'ceo') }
  if (org.company.auditor) { units.push({ id: 'audit', type: 'Assurance', name: 'Independent auditor', who: `agent:${org.company.auditor.name}`, lead: org.company.auditor.name }); claim(org.company.auditor.name, 'audit') }
  for (const d of org.company.departments) {
    units.push({ id: `dep:${d.id}`, type: 'Department', name: d.name, who: `department:${d.id}`, lead: d.lead.name, teams: d.teams.map(t => t.name), members: [...new Set([d.lead.name, ...d.teams.flatMap(t => t.members.map(m => m.name))])] })
    claim(d.lead.name, `dep:${d.id}`)
  }
  for (const d of org.company.departments) for (const t of d.teams) for (const m of t.members) claim(m.name, `dep:${d.id}`)
  units.push({ id: 'workers', type: 'Builders', name: 'Ticket workers', who: `agent:${P.workerName}`, lead: null })
  for (const a of org.others) claim(a.name, 'workers')

  const openTk = s.tickets.filter(t => t.status === 'open')
  const runningTk = openTk.filter(t => t.assignments.at(-1)?.status === 'running')
  for (const u of units) {
    const mine = rows.filter(r => unitOf[r.agent] === u.id)
    const live = mine.filter(r => r.status === 'running')
    u.costTodayUsd = r2(mine.filter(r => localDay(r.s) === today).reduce((n, r) => n + r.costUsd, 0))
    u.turnsToday = mine.filter(r => localDay(r.s) === today).length
    u.lastActive = mine.map(r => r.e ?? r.s).sort().at(-1) ?? null
    u.busy = live.map(r => r.agent).filter((x, i, a) => a.indexOf(x) === i)
    u.status = live.length ? 'working' : 'idle'
    if (u.id.startsWith('sa:')) {
      const a = s.agents.find(x => `sa:${x.id}` === u.id)
      const deciding = s.evals.some(e => e.agent === a.id && e.status === 'running')
      u.status = deciding ? 'working' : a.plan?.todo?.some(t => t.status === 'blocked') ? 'blocked' : s.triggers.some(t => t.to === a.id && t.status === 'pending') ? 'queued' : 'waiting'
      u.work = a.plan?.focus ?? 'No plan written yet.'
      u.detail = a.plan ? `${a.plan.todo.filter(t => t.status === 'doing').length} doing · ${a.plan.todo.filter(t => t.status === 'todo').length} to do · ${a.plan.todo.filter(t => t.status === 'blocked').length} blocked` : ''
    } else if (u.id.startsWith('dep:')) {
      const id = u.id.slice(4)
      const ini = c.initiatives.filter(i => i.department === id && i.stage !== 'killed' && i.stage !== P.gatedStage).at(-1)
      const lastAny = c.initiatives.filter(i => i.department === id).at(-1)
      u.work = ini ? ini.title : lastAny ? `Nothing open. Last: ${lastAny.title} (${lastAny.stage})` : 'No directive yet.'
      u.detail = ini ? `stage: ${ini.stage}${ini.confidence != null ? ` · confidence ${Math.round(ini.confidence * 100)}%` : ''}${ini.note ? ` · ${clip(ini.note, 160)}` : ''}` : ''
      u.stage = ini?.stage ?? null
      u.openInitiatives = c.initiatives.filter(i => i.department === id && !['killed', P.gatedStage].includes(i.stage)).length
    } else if (u.id === 'workers') {
      u.status = runningTk.length ? 'working' : openTk.some(t => t.attention) ? 'blocked' : openTk.length ? 'queued' : 'idle'
      u.work = runningTk.length ? runningTk.map(t => t.title).join(' · ') : openTk.length ? `${openTk.length} open ticket(s) waiting` : 'No open ticket.'
      u.detail = `${s.tickets.filter(t => t.outcome === 'completed').length} delivered · ${openTk.length} open`
    } else if (u.id === 'ceo') {
      u.work = rn.cycle ? `Running a company cycle: ${rn.cycle.phase ?? 'starting'}` : rn.continuous ? `Working continuously.${rn.nextCycle ? ` Next review ${rn.nextCycle.slice(0, 16).replace('T', ' ')} UTC.` : ''}` : `Between cycles.${rn.nextCycle ? ` Next cycle ${rn.nextCycle.slice(0, 16).replace('T', ' ')} UTC.` : ''}`
      if (rn.cycle) u.status = 'working'
      u.detail = clip(c.cycles.filter(x => x.summary).at(-1)?.summary ?? '', 200)
    } else if (u.id === 'audit') {
      const ch = (s.changes ?? []).find(x => x.status === 'checking')
      u.work = ch ? `Auditing the engine change "${ch.title}"` : live.length ? live[0].label : 'Called when a proposal, a skill or an engine change needs an independent check.'
    }
    if (live.length && !u.id.startsWith('sa:') && u.id !== 'workers') u.doing = live.map(r => r.label).slice(0, 4).join(' · ')
  }

  // ---- activity chart: when each unit worked
  const to = Date.now(), from = to - Math.max(1, Math.min(168, Number(hours) || 24)) * 3600_000
  const activity = units.map(u => {
    const spans = rows.filter(r => unitOf[r.agent] === u.id).map(r => ({ s: Math.max(from, new Date(r.s).getTime()), e: Math.min(to, r.e ? new Date(r.e).getTime() : to), label: r.label, agent: r.agent }))
      .filter(x => x.e > from && x.s < to && x.e > x.s).sort((a, b) => a.s - b.s)
    const merged = []
    for (const x of spans) { const l = merged.at(-1); if (l && x.s <= l.e + 60_000) { l.e = Math.max(l.e, x.e); if (!l.labels.includes(x.label) && l.labels.length < 4) l.labels.push(x.label) } else merged.push({ s: x.s, e: x.e, labels: [x.label] }) }
    return { id: u.id, name: u.name, spans: merged, busyMin: Math.round(merged.reduce((n, x) => n + (x.e - x.s), 0) / 60000) }
  })

  // ---- one row per day
  const dayMap = {}
  const day = k => (dayMap[k] ??= { date: k, spendUsd: 0, cycles: 0, ticketsOpened: 0, ticketsDelivered: 0, workerTurns: 0, decisions: 0, ideasNew: 0, ideasKilled: 0, turns: 0 })
  for (const [k, v] of Object.entries(c.days ?? {})) { day(k).spendUsd = r2(v.modelUsd ?? 0) }
  for (const x of c.cycles) day(localDay(x.startedAt)).cycles++
  for (const t of s.tickets) {
    day(localDay(t.createdAt)).ticketsOpened++
    if (t.outcome === 'completed' && t.endedAt) day(localDay(t.endedAt)).ticketsDelivered++
    for (const a of t.assignments) if (a.endedAt) day(localDay(a.endedAt)).workerTurns++
  }
  for (const e of s.evals) day(localDay(e.startedAt)).decisions++
  for (const i of c.initiatives) {
    const h = i.history ?? []
    if (h[0]?.ts) day(localDay(h[0].ts)).ideasNew++
    const k = h.find(x => x.stage === 'killed')
    if (k?.ts) day(localDay(k.ts)).ideasKilled++
  }
  for (const r of rows) day(localDay(r.s)).turns++
  const days = Object.values(dayMap).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-30)

  // ---- trend history
  const m = readMetrics(sa)
  const thin = (arr, n = 240) => (arr.length <= n ? arr : arr.filter((_, i) => i % Math.ceil(arr.length / n) === 0 || i === arr.length - 1))
  const hist = thin(m).map(x => ({ ts: x.ts, percent: x.percent, balanceUsd: x.balanceUsd, paperPnlUsd: x.paperPnlUsd ?? 0, booksPnlUsd: x.booksPnlUsd ?? 0, working: x.working ?? 0 }))
  const last24 = m.filter(x => Date.now() - new Date(x.ts).getTime() < DAY)

  // ---- money and runway
  const spendDays = days.filter(d => d.spendUsd > 0).slice(-3)
  const burn = spendDays.length ? r2(spendDays.reduce((n, d) => n + d.spendUsd, 0) / spendDays.length) : 0
  const free = bud.balanceUsd != null ? Math.max(0, bud.balanceUsd - bud.reserveUsd) : null
  const runwayDays = free != null && burn > 0 ? Math.round(free / burn * 10) / 10 : null

  // ---- operating performance
  const ended = s.tickets.filter(t => t.status === 'ended')
  const delivered = ended.filter(t => t.outcome === 'completed')
  const lat = []
  for (const e of s.evals) for (const id of e.triggers ?? []) { const t = s.triggers.find(x => x.id === id); if (t && e.startedAt) lat.push((new Date(e.startedAt) - new Date(t.ts)) / 60000) }
  const cyc = c.cycles.filter(x => x.endedAt && x.status === 'completed')
  const costByUnit = units.map(u => ({ id: u.id, name: u.name, usd: r2(rows.filter(r => unitOf[r.agent] === u.id).reduce((n, r) => n + r.costUsd, 0)), turns: rows.filter(r => unitOf[r.agent] === u.id).length })).sort((a, b) => b.usd - a.usd)
  const stages = P.stages
  const ceoPlan = s.agents.find(a => !a.parent)?.plan ?? null
  const perDay = g.money.paperProfitPerDayUsd

  return {
    at: now(), hours: Math.round((to - from) / 3600_000),
    profile: { id: P.id, label: P.label, hasEngine: P.hasEngine, stageLabels: P.stageLabels, gatedStage: P.gatedStage, metering: sa.co.metering, text: P.text },
    tree: orgTree(sa),
    ...leaderStats(sa),
    growth: (() => { try { return sa.growth?.stats() ?? null } catch { return null } })(),
    perf: (() => { try { return sa.perf ? { tree: sa.perf.tree(), low: sa.perf.settings().low } : null } catch (e) { return { error: e.message } } })(),
    goal: g,
    money: { balanceUsd: bud.balanceUsd ?? null, reserveUsd: bud.reserveUsd, spentTodayUsd: bud.spentTodayUsd, dailyUsd: bud.dailyUsd, burnPerDayUsd: burn, runwayDays },
    health: { loop: !!sa.store.holder(), hold: sa.holdReason, proactive: s.enabled, autopilot: c.charter.autopilot.enabled, hasEngine: P.hasEngine, engineOk: P.hasEngine ? eng.engineFresh && eng.collectorFresh : true, engineKept: eng.autostart, engineNote: eng.note, books: eng.books },
    units, activity: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), rows: activity },
    days, history: hist,
    funnel: stages.map(st => ({ stage: st, n: c.initiatives.filter(i => i.stage === st).length })),
    costByUnit,
    ops: {
      ticketsDelivered: delivered.length, ticketsEnded: ended.length, ticketsOpen: openTk.length,
      deliveredRate: ended.length ? delivered.length / ended.length : null,
      avgTurns: delivered.length ? r2(delivered.reduce((n, t) => n + t.assignments.length, 0) / delivered.length) : null,
      medianTicketMin: median(delivered.filter(t => t.endedAt).map(t => (new Date(t.endedAt) - new Date(t.createdAt)) / 60000)),
      decisionWaitMedianMin: median(lat),
      engineUptime24h: last24.length >= 3 ? last24.filter(x => x.engineOk).length / last24.length : null,
      cycleAvgMin: cyc.length ? r2(cyc.reduce((n, x) => n + (new Date(x.endedAt) - new Date(x.startedAt)) / 60000, 0) / cyc.length) : null,
      cycleAvgUsd: cyc.length ? r2(cyc.reduce((n, x) => n + (x.spendUsd ?? 0), 0) / cyc.length) : null,
      gateRuns: g.effort.gateRuns, gatePassed: c.orders.length,
    },
    next: {
      nextCycle: rn.nextCycle, continuous: rn.continuous, running: rn.items.map(i => ({ who: i.who, what: i.what, since: i.since })), idle: rn.idle,
      queuedEvents: s.triggers.filter(t => t.status === 'pending').length, queuedTickets: openTk.filter(t => t.assignments.at(-1)?.status !== 'running' && !t.attention).length,
      needsYou: c.decisions.filter(d => d.status === 'open').map(d => clip(d.question, 220)).concat(openTk.filter(t => t.attention).map(t => `Ticket "${t.title}": ${clip(t.attention.question, 160)}`)),
      ladderNext: g.next, plan: ceoPlan ? { focus: ceoPlan.focus, updatedAt: ceoPlan.updatedAt, priorities: ceoPlan.priorities, todo: ceoPlan.todo.filter(t => t.status !== 'done').slice(0, 8), blockers: ceoPlan.blockers, waitingOnOwner: ceoPlan.waitingOnOwner } : null,
      forecast: [
        runwayDays != null ? `At the recent spend of $${burn} a day, the provider balance above the reserve lasts about ${runwayDays} day${runwayDays === 1 ? '' : 's'}.` : sa.co.metering === 'balance' ? 'No spend recorded yet, so there is no runway estimate.' : `Spend is estimated from run costs (about $${burn ?? 0} a day recently); on a subscription your plan's usage limits are the real limit.`,
        perDay > 0 ? `${g.money.label} is $${perDay}; the target is ${Math.round(g.money.targetDailyUsd / perDay).toLocaleString('en-US')} times that.` : `No money is measured yet: ${g.money.basis}.`,
        g.next ? `The next step on the ladder is "${g.next.title}". ${g.next.detail}` : 'Every step on the ladder is done.',
      ],
    },
  }
}

// ---------------------------------------------------------------- org chart with numbers, and one entity in depth
const HOUR = 3600_000

/** Numbers for a set of agents, from the recorded turns: today, the last 24 h hour by hour, the last 14 days. */
function stat(rows, set, totalCost) {
  const t1 = Date.now(), today = localDay(t1)
  const mine = rows.filter(r => set.has(r.agent))
  const spark = new Array(24).fill(0)
  const dayMap = {}
  let min24 = 0, cost = 0, done = 0, failed = 0
  for (const r of mine) {
    const s0 = new Date(r.s).getTime(), e0 = r.e ? new Date(r.e).getTime() : t1
    cost += r.costUsd
    if (r.status === 'completed') done++; else if (r.status === 'failed') failed++
    const d = (dayMap[localDay(s0)] ??= { date: localDay(s0), turns: 0, minutes: 0, tools: 0, cost: 0 })
    d.turns++; d.minutes += (e0 - s0) / 60000; d.tools += r.tools; d.cost += r.costUsd
    for (let h = 0; h < 24; h++) {
      const a = t1 - (24 - h) * HOUR, b = a + HOUR
      const o = Math.min(e0, b) - Math.max(s0, a)
      if (o > 0) { spark[h] += o / 60000; min24 += o / 60000 }
    }
  }
  const live = mine.filter(r => r.status === 'running')
  const days = []
  for (let i = 13; i >= 0; i--) { const k = localDay(t1 - i * DAY); const d = dayMap[k]; days.push({ date: k, turns: d?.turns ?? 0, minutes: Math.round(d?.minutes ?? 0), tools: d?.tools ?? 0 }) }
  return {
    turnsToday: dayMap[today]?.turns ?? 0, toolsToday: dayMap[today]?.tools ?? 0, turns: mine.length, min24: Math.round(min24), share: totalCost ? cost / totalCost : 0,
    lastActive: mine.map(r => r.e ?? r.s).sort().at(-1) ?? null, busy: live.length > 0, doing: live.map(r => r.label).slice(0, 3),
    lastLabel: mine.slice().sort((a, b) => (a.s < b.s ? 1 : -1))[0]?.label ?? null, successRate: done + failed ? done / (done + failed) : null,
    spark: spark.map(v => Math.round(v)), days,
  }
}

/** Who belongs to what. ref is the entity key used by the dashboard: company, sa:<id>, ceo, audit, dep:<id>, team:<name>, agent:<name>, workers. */
export function structure(sa) {
  const org = orgView(sa)
  const sets = { company: new Set() }
  const meta = { company: { type: 'Company', name: 'The whole company', parent: null } }
  const add = (ref, type, name, parent, agents, extra = {}) => { sets[ref] = new Set(agents.filter(Boolean)); meta[ref] = { type, name, parent, ...extra }; for (const a of sets[ref]) sets.company.add(a) }
  const root = org.superAgents.find(a => !a.parent)
  for (const a of org.superAgents) add(`sa:${a.id}`, 'Super agent', a.title, a.parent ? `sa:${a.parent}` : 'company', [a.agent], { lead: a.agent })
  const top = root ? `sa:${root.id}` : 'company'
  if (org.company.ceo) add('ceo', 'COO', 'COO', top, [org.company.ceo.name], { lead: org.company.ceo.name })
  if (org.company.auditor) add('audit', 'Assurance', 'Independent auditor', top, [org.company.auditor.name], { lead: org.company.auditor.name })
  for (const d of org.company.departments) {
    add(`dep:${d.id}`, 'Department', d.name, 'ceo', [d.lead.name, ...d.teams.flatMap(t => t.members.map(m => m.name))], { lead: d.lead.name, mission: d.mission })
    for (const t of d.teams) {
      add(`team:${t.name}`, 'Team', t.name, `dep:${d.id}`, t.members.map(m => m.name), { description: t.description })
      for (const m of t.members) if (!meta[`agent:${m.name}`]) add(`agent:${m.name}`, 'Agent', m.name, `team:${t.name}`, [m.name], { model: m.model, description: m.description })
    }
    if (!meta[`agent:${d.lead.name}`]) add(`agent:${d.lead.name}`, 'Agent', d.lead.name, `dep:${d.id}`, [d.lead.name], { model: d.lead.model, description: d.lead.description, isLead: true })
  }
  add('workers', 'Builders', 'Ticket workers', top, org.others.map(a => a.name))
  for (const a of org.others) if (!meta[`agent:${a.name}`]) add(`agent:${a.name}`, 'Agent', a.name, 'workers', [a.name], { model: a.model, description: a.description })
  for (const a of [org.company.ceo, org.company.auditor].filter(Boolean)) if (!meta[`agent:${a.name}`]) add(`agent:${a.name}`, 'Agent', a.name, a === org.company.ceo ? 'ceo' : 'audit', [a.name], { model: a.model, description: a.description })
  return { org, sets, meta }
}

/** The dashboard key of a leader: super agents are sa:<id>, the COO is "ceo" (its historic key), departments dep:<id>. */
export const leaderRef = a => (a.kind === 'coo' ? 'ceo' : a.kind === 'dept' ? `dep:${a.dept}` : `sa:${a.id}`)

/**
 * How each leader is using its capacity: threads running, plan items by state, worker slots against its fair share,
 * background asks, and how much of the last 24 hours nothing of its own was running.
 */
export function leaderStats(sa) {
  const s = sa.store.read()
  const to = Date.now(), from = to - DAY
  const live = sa.live ?? { tickets: new Map(), evals: new Map(), jobs: new Map() }
  const openT = s.tickets.filter(t => t.status === 'open')
  const owners = new Set(openT.filter(t => live.tickets.has(t.id) || t.assignments.at(-1)?.status === 'running' || !t.assignments.length).map(t => t.owner)).size || 1
  const share = Math.max(1, Math.floor(s.settings.maxWorkers / owners))
  const ms = x => new Date(x).getTime()
  const busyShare = spans => {
    const iv = spans.map(([a, b]) => [Math.max(from, a), Math.min(to, b)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
    let busy = 0, end = from
    for (const [a, b] of iv) { if (b <= end) continue; busy += b - Math.max(a, end); end = b }
    return busy / DAY
  }
  const spansOf = id => [
    ...s.evals.filter(e => e.agent === id).map(e => [ms(e.startedAt), e.endedAt ? ms(e.endedAt) : to]),
    ...s.tickets.filter(t => t.owner === id).flatMap(t => t.assignments.map(a => [ms(a.startedAt), a.endedAt ? ms(a.endedAt) : a.status === 'running' ? to : ms(a.startedAt)])),
    ...s.jobs.filter(j => j.from === id).map(j => [ms(j.startedAt), j.endedAt ? ms(j.endedAt) : to]),
  ]
  const leaders = s.agents.map(a => {
    const todo = a.plan?.todo ?? []
    const done = new Set(todo.filter(t => t.status === 'done').map(t => t.id)), ids = new Set(todo.map(t => t.id))
    const ready = todo.filter(t => t.status === 'todo' && (t.dependsOn ?? []).every(d => done.has(d) || !ids.has(d))).length
    const mine = openT.filter(t => t.owner === a.id)
    const running = mine.filter(t => t.assignments.at(-1)?.status === 'running').length
    return {
      id: a.id, ref: leaderRef(a), kind: a.kind ?? 'super', title: a.title, paused: !!a.paused,
      threads: s.evals.filter(e => e.agent === a.id && e.status === 'running').map(e => e.lane ?? 'main'),
      pending: s.triggers.filter(t => t.to === a.id && t.status === 'pending').length,
      plan: { todo: todo.filter(t => t.status === 'todo').length, ready, doing: todo.filter(t => t.status === 'doing').length, blocked: todo.filter(t => t.status === 'blocked').length, done: done.size, updatedAt: a.plan?.updatedAt ?? null, focus: a.plan?.focus ?? null },
      tickets: { running, queued: mine.length - running, share: a.kind === 'dept' ? 0 : share },
      jobs: s.jobs.filter(j => j.from === a.id && j.status === 'running').length,
      busy24: Math.round(100 * busyShare(spansOf(a.id))),
      lastTurn: s.evals.filter(e => e.agent === a.id).at(-1)?.startedAt ?? null,
    }
  })
  const all = s.agents.flatMap(a => spansOf(a.id))
  return {
    leaders,
    capacity: {
      workers: { used: s.tickets.filter(t => t.status === 'open' && t.assignments.at(-1)?.status === 'running').length, max: s.settings.maxWorkers },
      turns: { used: s.evals.filter(e => e.status === 'running').length, max: s.settings.maxEvals },
      jobs: { used: s.jobs.filter(j => j.status === 'running').length, max: s.settings.maxJobs },
      threadsPerLeader: s.settings.maxLanes,
      idle24: Math.round(100 * (1 - busyShare(all))),
      readyNotStarted: leaders.reduce((n, l) => n + (l.paused ? 0 : l.plan.ready), 0),
    },
  }
}

/** Every node of the organisation with its numbers; agents repeat under each team they belong to. */
export function orgTree(sa) {
  const s = sa.store.read(), c = sa.co.read()
  const rows = turns(sa)
  const { org, sets, meta } = structure(sa)
  const total = rows.reduce((n, r) => n + r.costUsd, 0)
  const cache = {}
  const st = ref => (cache[ref] ??= stat(rows, sets[ref], total))
  const open = s.tickets.filter(t => t.status === 'open')
  const nodes = []
  const lead = Object.fromEntries(leaderStats(sa).leaders.filter(l => !l.paused).map(l => [l.ref, l]))
  const node = (key, ref, parent, extra = {}) => {
    const m = meta[ref], k = st(ref)
    let status = k.busy ? 'working' : 'idle', work = k.doing.join(' · ') || ''
    if (ref.startsWith('sa:')) {
      const a = s.agents.find(x => `sa:${x.id}` === ref)
      status = s.evals.some(e => e.agent === a.id && e.status === 'running') ? 'working' : a.plan?.todo?.some(t => t.status === 'blocked') ? 'blocked' : 'waiting'
      work = a.plan?.focus ?? 'No plan written yet.'
    } else if (ref.startsWith('dep:')) {
      const ini = c.initiatives.filter(i => i.department === ref.slice(4) && !['killed', P.gatedStage].includes(i.stage)).at(-1)
      work = k.busy ? work : ini ? `${ini.title} (${ini.stage})` : 'No open directive.'
    } else if (ref === 'workers') {
      const running = open.filter(t => t.assignments.at(-1)?.status === 'running')
      status = running.length ? 'working' : open.some(t => t.attention) ? 'blocked' : open.length ? 'queued' : 'idle'
      work = running.map(t => t.title).join(' · ') || (open.length ? `${open.length} open ticket(s)` : 'No open ticket.')
    } else if (ref === 'ceo') {
      const act = c.cycles.at(-1)?.status === 'running'
      if (act) status = 'working'
      work = act ? 'Running a company cycle' : work || 'Between cycles.'
    } else if (!work) work = k.lastLabel ? `Last: ${k.lastLabel}` : m.type === 'Agent' ? 'Not called yet.' : ''
    // a unit run by a leader (COO, department head, super agent): its threads and plan say what it is doing
    const L = lead[ref]
    if (L) {
      if (L.threads.length) status = 'working'
      else if (L.plan.blocked && status !== 'working') status = 'blocked'
      if (!k.busy && L.plan.focus && !ref.startsWith('sa:')) work = L.plan.focus
      extra = { ...extra, leader: { threads: L.threads.length, ready: L.plan.ready, doing: L.plan.doing, blocked: L.plan.blocked, busy24: L.busy24 } }
    }
    nodes.push({ key, ref, parent, type: m.type, name: m.name, sub: m.lead ?? m.model ?? '', status, work: clip(work, 200), turnsToday: k.turnsToday, min24: k.min24, share: k.share, lastActive: k.lastActive, spark: k.spark, ...extra })
  }
  const roots = org.superAgents.filter(a => !a.parent)
  const walkSa = (a, parent) => {
    const key = `sa:${a.id}`
    node(key, key, parent)
    for (const ch of org.superAgents.filter(x => x.parent === a.id)) walkSa(ch, key)
  }
  for (const a of roots) walkSa(a, null)
  const top = roots[0] ? `sa:${roots[0].id}` : null
  if (meta.ceo) node('ceo', 'ceo', top)
  for (const d of org.company.departments) {
    const dk = `dep:${d.id}`
    node(dk, dk, 'ceo', { teams: d.teams.length, people: sets[dk].size })
    node(`${dk}/lead`, `agent:${d.lead.name}`, dk, { role: 'lead' })
    for (const t of d.teams) {
      const tk = `team:${t.name}`
      node(tk, tk, dk, { people: t.members.length })
      for (const m of t.members) node(`${tk}/${m.name}`, `agent:${m.name}`, tk)
    }
  }
  if (meta.audit) node('audit', 'audit', top)
  node('workers', 'workers', top, { people: sets.workers.size })
  for (const a of org.others) node(`workers/${a.name}`, `agent:${a.name}`, 'workers')
  return nodes
}

/** One entity in depth: its numbers, its hours and days, its members, its work. */
export function entity(sa, ref, { hours = 24 } = {}) {
  const s = sa.store.read(), c = sa.co.read()
  const rows = turns(sa)
  const { sets, meta } = structure(sa)
  if (!meta[ref]) throw new Error('no such unit')
  const m = meta[ref], set = sets[ref]
  const total = rows.reduce((n, r) => n + r.costUsd, 0)
  const k = stat(rows, set, total)
  const crumbs = []
  for (let r = ref; r; r = meta[r]?.parent) crumbs.unshift({ ref: r, name: meta[r].name })
  if (crumbs[0]?.ref !== 'company') crumbs.unshift({ ref: 'company', name: 'Company' })
  // members: the next level down
  const childRefs = Object.keys(meta).filter(r => meta[r].parent === ref && !(m.type === 'Company'))
  const kids = ref === 'company' ? Object.keys(meta).filter(r => ['Super agent', 'COO', 'Assurance', 'Department', 'Builders'].includes(meta[r].type)) : ref.startsWith('team:') || ref === 'workers' ? [...set].map(a => `agent:${a}`) : ref.startsWith('dep:') ? [...childRefs.filter(r => r.startsWith('team:')), `agent:${m.lead}`] : childRefs
  const members = kids.filter(r => meta[r]).map(r => { const x = stat(rows, sets[r], total); return { ref: r, name: meta[r].name, type: meta[r].type, turnsToday: x.turnsToday, min24: x.min24, share: x.share, busy: x.busy, lastActive: x.lastActive, turns: x.turns, successRate: x.successRate } })
  // when it (or each member) worked
  const to = Date.now(), from = to - Math.max(1, Math.min(168, Number(hours) || 24)) * HOUR
  const spansOf = st => {
    const sp = rows.filter(r => st.has(r.agent)).map(r => ({ s: Math.max(from, new Date(r.s).getTime()), e: Math.min(to, r.e ? new Date(r.e).getTime() : to), label: r.label })).filter(x => x.e > from && x.s < to && x.e > x.s).sort((a, b) => a.s - b.s)
    const out = []
    for (const x of sp) { const l = out.at(-1); if (l && x.s <= l.e + 60_000) { l.e = Math.max(l.e, x.e); if (!l.labels.includes(x.label) && l.labels.length < 4) l.labels.push(x.label) } else out.push({ s: x.s, e: x.e, labels: [x.label] }) }
    return out
  }
  const ganttRefs = members.length > 1 ? members.map(x => x.ref) : [ref]
  const activity = { from: new Date(from).toISOString(), to: new Date(to).toISOString(), rows: ganttRefs.map(r => { const sp = spansOf(sets[r]); return { id: r, name: meta[r].name, spans: sp, busyMin: Math.round(sp.reduce((n, x) => n + (x.e - x.s), 0) / 60000) } }) }
  const recent = rows.filter(r => set.has(r.agent)).sort((a, b) => (a.s < b.s ? 1 : -1)).slice(0, 14).map(r => ({ agent: r.agent, label: r.label, run: r.run, status: r.status, startedAt: r.s, endedAt: r.e, tools: r.tools, runId: r.runId, file: r.file }))
  const out = {
    at: now(), ref, type: m.type, name: m.name, crumbs, description: m.description ?? m.mission ?? '', sub: m.lead ?? m.model ?? '',
    status: k.busy ? 'working' : 'idle', doing: k.doing, kpi: { turnsToday: k.turnsToday, toolsToday: k.toolsToday, min24: k.min24, share: k.share, lastActive: k.lastActive, successRate: k.successRate, turns: k.turns, people: set.size },
    hourly: k.spark, days: k.days, members, activity, recent,
  }
  out.outlook = outlook(sa, ref, { meta, set, k, rows })
  out.made = setupAndMemory(sa, agentNames(sa, ref, meta, set))
  // what the desk already knows about this kind of thing
  const [type, id] = ref === 'company' ? ['company', 'company'] : ref.startsWith('sa:') ? ['super-agent', ref.slice(3)] : ref.startsWith('dep:') ? ['department', ref.slice(4)] : ref.startsWith('team:') ? ['team', ref.slice(5)] : ref.startsWith('agent:') ? ['agent', ref.slice(6)] : ref === 'ceo' ? ['agent', c.ceo] : ref === 'audit' ? ['agent', c.auditor] : [null, null]
  if (type) { try { const w = who(sa, type, id); out.what = w.what; out.description ||= w.description ?? ''; out.detail = { role: w.role, skills: w.skills, tools: w.tools, model: w.model, provider: w.provider, canWrite: w.canWrite, reportsTo: w.reportsTo, teams: w.teams, plan: w.plan, decisions: w.decisions, tickets: w.tickets, initiatives: w.initiatives, builds: w.builds, cycles: w.cycles, asks: w.asks }; out.timeline = (w.timeline ?? []).slice(0, 25) } catch (e) { out.what = '' } }
  if (ref === 'workers') {
    out.what = 'Workers build one ticket at a time in a sandboxed folder with a shell: data pulls, code, simulations.'
    out.detail = { tickets: s.tickets.slice(-20).reverse().map(t => ({ id: t.id, title: t.title, status: t.status, outcome: t.outcome, turns: t.assignments.length })) }
    out.timeline = timeline(sa, { who: P.workerName, limit: 25 })
  }
  if (ref.startsWith('dep:')) {
    const id = ref.slice(4), stages = P.stages
    out.funnel = stages.map(st => ({ stage: st, n: c.initiatives.filter(i => i.department === id && i.stage === st).length }))
    out.kpi.openInitiatives = c.initiatives.filter(i => i.department === id && !['killed', P.gatedStage].includes(i.stage)).length
    out.kpi.killed = c.initiatives.filter(i => i.department === id && i.stage === 'killed').length
  }
  if (ref.startsWith('sa:')) {
    const id = ref.slice(3), a = s.agents.find(x => x.id === id)
    out.status = s.evals.some(e => e.agent === id && e.status === 'running') ? 'working' : a?.plan?.todo?.some(t => t.status === 'blocked') ? 'blocked' : 'waiting'
    const per = {}
    for (const e of s.evals.filter(e => e.agent === id)) per[localDay(e.startedAt)] = (per[localDay(e.startedAt)] ?? 0) + 1
    out.decisionsDaily = k.days.map(d => ({ date: d.date, n: per[d.date] ?? 0 }))
    const tk = s.tickets.filter(t => t.owner === id)
    out.ticketOutcomes = [['Delivered', tk.filter(t => t.outcome === 'completed').length], ['Open', tk.filter(t => t.status === 'open').length], ['Dropped or stopped', tk.filter(t => t.status === 'ended' && t.outcome !== 'completed').length]].map(([label, n]) => ({ label, n }))
    out.kpi.decisions = s.evals.filter(e => e.agent === id).length
    out.kpi.pending = s.triggers.filter(t => t.to === id && t.status === 'pending').length
  }
  // a unit run by a leader (super agent, COO, department head): its plan, threads and capacity
  const L = s.agents.find(a => leaderRef(a) === ref && !a.paused)
  if (L) {
    out.detail = { ...(out.detail ?? {}), plan: L.plan ?? null }
    out.leader = leaderStats(sa).leaders.find(x => x.id === L.id) ?? null
  }
  // an agent's capability: scores over time, gaps found in reviews, skills on trial, coaching changes, its playbook
  if (ref.startsWith('agent:')) { try { out.capability = sa.growth?.agentView(ref.slice(6)) ?? null } catch {} }
  return out
}
