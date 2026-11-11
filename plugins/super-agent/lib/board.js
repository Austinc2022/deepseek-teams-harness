/**
 * The numbers behind the Company dashboard: business units and what each is working on, an activity chart, day
 * series and trends, operating performance, and what happens next. Read-only, except recordMetrics, which the
 * loop calls every ten minutes to append one line to forge/super-agent/metrics.jsonl (the trend history).
 */
import fs from 'node:fs'
import path from 'node:path'
import { now, clip } from './store.js'
import { progress, rightNow, orgView } from './views.js'
import { profile as P } from '../../company/lib/profile.js'

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
function turns(sa) {
  if (turns.at && Date.now() - turns.at < 15_000) return turns.rows
  const { engine, registry } = sa.forge
  const rows = []
  let ids = []
  try { ids = fs.readdirSync(registry.d.runs).sort().reverse().slice(0, 400) } catch {}
  for (const id of ids) {
    let r
    try { r = engine.getRun(id) } catch { continue }
    for (const a of r.agents ?? []) if (a.startedAt) rows.push({ agent: a.agent, label: a.label, run: r.orchestration, s: a.startedAt, e: a.endedAt, status: a.status, costUsd: a.costUsd ?? 0, tools: a.tools ?? 0 })
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
  if (org.company.ceo) { units.push({ id: 'ceo', type: 'Company CEO', name: 'Company CEO', who: `agent:${org.company.ceo.name}`, lead: org.company.ceo.name }); claim(org.company.ceo.name, 'ceo') }
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
      u.work = rn.cycle ? `Running a company cycle: ${rn.cycle.phase ?? 'starting'}` : `Between cycles.${rn.nextCycle ? ` Next cycle ${rn.nextCycle.slice(0, 16).replace('T', ' ')} UTC.` : ''}`
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
      nextCycle: rn.nextCycle, running: rn.items.map(i => ({ who: i.who, what: i.what, since: i.since })), idle: rn.idle,
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
