/**
 * What the owner reads: goal progress, what is happening right now, the organisation, any individual, and one
 * timeline. Everything here is read from state files and run records; nothing here spends money or changes state.
 */
import fs from 'node:fs'
import path from 'node:path'
import { clip } from './store.js'
import { profile as P } from '../../company/lib/profile.js'

const iso = t => (t ? new Date(t).toISOString() : null)
const DAY = 86400_000

// ---------------------------------------------------------------- goal progress
/** A ladder of steps toward the charter. Steps are measured by code where code can measure them. */
export function progress(sa) {
  const s = sa.store.read()
  const c = sa.co.read()
  const eng = sa.ops.snapshot()
  const ms = s.milestones ?? {}
  const missing = Object.fromEntries(P.milestones.map(m => [m.key, m.missing ?? 'The COO has not reported this yet.']))
  const said = k => (ms[k]?.done ? `${ms[k].evidence} (${ms[k].ts.slice(0, 10)})` : ms[k]?.evidence ? `Not yet: ${ms[k].evidence}` : missing[k])
  // the ladder and the money line are the profile's: a trading company and a game studio measure different things
  const steps = P.goalSteps({ c, s, eng, ms, said })
  const done = steps.filter(x => x.done).length
  const days = Object.values(c.days ?? {})
  const target = c.charter.northStar.targetDailyUsd
  const m = P.goalMoney({ c, s, eng })
  const perDay = m.perDayUsd ?? 0
  const approvedPnl = m.totalUsd ?? 0
  const active = c.orders.filter(o => (o.status ?? 'active') === 'active')
  return {
    mission: c.charter.mission, percent: Math.round(100 * done / steps.length), done, total: steps.length, steps, next: steps.find(x => !x.done) ?? null,
    money: { targetDailyUsd: target, label: m.label, paperProfitPerDayUsd: Math.round(perDay * 100) / 100, shareOfTarget: target ? Math.max(0, perDay) / target : 0, paperProfitUsd: Math.round(approvedPnl * 100) / 100, books: eng.books, accepted: active.length, basis: m.basis },
    odds: c.northStar?.odds ?? null, oddsAt: c.northStar?.ts ?? null,
    effort: {
      spentUsd: Math.round(days.reduce((n, d) => n + (d.modelUsd ?? 0), 0) * 100) / 100, days: days.length,
      cycles: c.cycles.length, tickets: s.tickets.length, workerTurns: s.tickets.reduce((n, t) => n + t.assignments.length, 0),
      decisions: s.evals.length, gateRuns: c.initiatives.filter(i => i.gate).length + s.tickets.filter(t => t.proposal && ['passed', 'failed'].includes(t.proposal.status)).length,
      ideasTried: c.initiatives.length, ideasKilled: c.initiatives.filter(i => i.stage === 'killed').length, engineChanges: (s.changes ?? []).filter(x => x.status === 'installed').length,
    },
  }
}

// ---------------------------------------------------------------- right now
export function rightNow(sa) {
  const s = sa.store.read()
  const c = sa.co.read()
  const { engine } = sa.forge
  const lastTool = runId => { try { const a = engine.getRun(runId).agents?.filter(x => x.status === 'running').at(-1) ?? engine.getRun(runId).agents?.at(-1); return a ? { tools: a.tools, last: a.lastTool, agent: a.agent } : null } catch { return null } }
  const items = []
  for (const e of s.evals.filter(x => x.status === 'running')) {
    const ts = s.triggers.filter(t => e.triggers.includes(t.id))
    const a = s.agents.find(x => x.id === e.agent)
    items.push({ who: a?.title ?? e.agent, whoId: `super-agent:${e.agent}`, kind: 'deciding', what: `Deciding what to do about ${ts.length} event${ts.length === 1 ? '' : 's'}: ${ts.map(t => `${t.source} ${t.kind}`).join(', ')}`, detail: clip(ts[0]?.text ?? '', 260), since: e.startedAt, runId: e.runId, activity: lastTool(e.runId) })
  }
  for (const t of s.tickets) {
    const a = t.assignments.at(-1)
    if (t.status === 'open' && a?.status === 'running') items.push({ who: t.worker, whoId: `agent:${t.worker}`, kind: 'building', what: `Working on the ticket "${t.title}" (turn ${t.assignments.length})`, since: a.startedAt, runId: a.runId, ticket: t.id, activity: lastTool(a.runId) })
  }
  for (const j of s.jobs.filter(x => x.status === 'running')) items.push({ who: `${j.kind} ${j.target}`, whoId: `${j.kind}:${j.target}`, kind: 'answering', what: `Answering ${j.from}: ${clip(j.message, 220)}`, since: j.startedAt })
  for (const g of (s.changes ?? []).filter(x => ['checking', 'installing'].includes(x.status))) items.push({ who: g.status === 'checking' ? 'Independent auditor' : 'Installer (code)', kind: 'engine change', what: `${g.status === 'checking' ? 'Checking and auditing' : 'Testing and installing'} the engine change "${g.title}"`, since: g.updatedAt ?? g.ts })
  let cycle = null
  try {
    const act = sa.co.active()
    if (act?.state) {
      const agents = [...(act.state.agents ?? [])]
      for (const sub of c.cycles.find(x => x.id === act.cycleId)?.subRuns ?? []) { try { agents.push(...engine.getRun(sub.runId).agents.map(a => ({ ...a, label: `${sub.department} · ${a.label}` }))) } catch {} }
      const running = agents.filter(a => a.status === 'running')
      cycle = { id: act.cycleId, runId: act.runId, phase: act.state.phase, startedAt: act.state.startedAt }
      items.push({ who: 'COO company cycle', whoId: 'company', kind: 'cycle', what: `Phase: ${act.state.phase ?? 'starting'}. ${running.length ? `Working now: ${running.map(a => a.label).join(', ')}` : 'Gathering facts.'}`, since: act.state.startedAt, runId: act.runId })
    }
  } catch {}
  const ap = c.charter.autopilot
  const last = c.cycles.at(-1)
  const nextCycle = ap.enabled && last ? iso(new Date(last.startedAt).getTime() + ap.everyHours * 3600_000) : null
  const pending = s.triggers.filter(t => t.status === 'pending').length
  const continuous = (ap.mode ?? 'continuous') === 'continuous' && s.agents.some(a => a.kind === 'coo' && !a.paused)
  const idle = items.length ? null : sa.holdReason ? `On hold: ${sa.holdReason}.` : pending ? `${pending} event(s) are queued and start within seconds.` : `Nothing is running. ${s.enabled ? 'The super agent waits for the next event' : 'Proactive mode is off, so the super agent waits for your message'}${nextCycle ? `; the next ${continuous ? 'COO review' : 'company cycle'} is due ${nextCycle.slice(0, 16).replace('T', ' ')} UTC` : ''}.`
  return {
    items, idle, cycle, nextCycle, continuous,
    decisions: s.evals.filter(e => e.status !== 'running' && e.note).slice(-8).reverse().map(e => ({ agent: e.agent, at: e.endedAt, note: e.note, actions: e.actions ?? [], runId: e.runId, status: e.status })),
  }
}

// ---------------------------------------------------------------- organisation
const agentInfo = (registry, n) => { try { const a = registry.getAgent(n); return { name: a.name, description: a.description, model: a.model, provider: a.provider ?? 'claude-code', tags: a.tags ?? [] } } catch { return { name: n, missing: true } } }

/** agent name -> what it is doing right now (from the runs live in this process). */
function busyAgents(sa) {
  const out = {}
  for (const live of sa.forge.engine.active.values()) {
    const st = live.state
    for (const a of st?.agents ?? []) if (a.status === 'running') out[a.agent] = { label: a.label, run: st.orchestration, runId: st.id, since: a.startedAt, tools: a.tools, last: a.lastTool }
  }
  return out
}

export function orgView(sa) {
  const s = sa.store.read()
  const c = sa.co.read()
  const { registry } = sa.forge
  const info = n => agentInfo(registry, n)
  const busy = busyAgents(sa)
  const evalBusy = new Set(s.evals.filter(e => e.status === 'running').map(e => e.agent))
  const supers = id => { try { const t = sa.co.supers.get(id); return { id, title: t.title, supervisor: t.supervisor, busy: t.busy } } catch { return { id, missing: true } } }
  const departments = c.departments.map(d => ({
    id: d.id, name: d.name, mission: d.mission, lead: info(d.lead), superTeam: d.superTeamId ? supers(d.superTeamId) : null,
    teams: d.teams.map(t => { try { const team = registry.getTeam(t); return { name: t, description: team.description, members: team.members.map(info) } } catch { return { name: t, missing: true, members: [] } } }),
  }))
  const inOrg = new Set([c.ceo, c.auditor, ...departments.flatMap(d => [d.lead.name, ...d.teams.flatMap(t => t.members.map(m => m.name))]), ...s.agents.map(a => a.agent)])
  const others = registry.listAgents().filter(a => !a.invalid && P.isOurs(a.name) && !inOrg.has(a.name)).map(a => ({ name: a.name, description: a.description, model: a.model, provider: a.provider ?? 'claude-code', tags: a.tags ?? [] }))
  return {
    // the COO and department heads also live in s.agents (as leaders); the org shows them in their company places
    superAgents: s.agents.filter(a => (a.kind ?? 'super') === 'super').map(a => ({ id: a.id, title: a.title, agent: a.agent, parent: a.parent, mission: a.mission, reports: a.reports, busy: evalBusy.has(a.id), focus: a.plan?.focus ?? null, planAt: a.plan?.updatedAt ?? null })),
    company: { ceo: c.ceo ? info(c.ceo) : null, auditor: c.auditor ? info(c.auditor) : null, departments },
    others, busy,
  }
}

/** The last runs on disk, flattened to one row per agent turn. Cached for 20 s. */
function runRows(sa) {
  const k = runRows
  if (k.at && Date.now() - k.at < 20_000) return k.rows
  const { engine, registry } = sa.forge
  const rows = []
  let ids = []
  try { ids = fs.readdirSync(registry.d.runs).sort().reverse().slice(0, 220) } catch {}
  for (const id of ids) {
    let r
    try { r = engine.getRun(id) } catch { continue }
    for (const a of r.agents ?? []) rows.push({ runId: r.id, run: r.orchestration, agent: a.agent, label: a.label, model: a.model, status: a.status, startedAt: a.startedAt, endedAt: a.endedAt, tools: a.tools, costUsd: a.costUsd, file: a.file, lastTool: a.lastTool })
  }
  k.rows = rows; k.at = Date.now()
  return rows
}

/** Everything about one individual: an agent, a team, a department, a super team or a super agent. */
export function who(sa, type, id) {
  const s = sa.store.read()
  const c = sa.co.read()
  const { registry } = sa.forge
  const busy = busyAgents(sa)
  const base = { type, id, timeline: timeline(sa, { who: id, limit: 40 }) }
  if (type === 'agent') {
    const a = registry.getAgent(id)
    const rows = runRows(sa).filter(r => r.agent === id)
    const teams = registry.listTeams().filter(t => (t.members ?? []).includes(id)).map(t => t.name)
    const dep = c.departments.find(d => d.lead === id)
    const sup = s.agents.find(x => x.agent === id)
    const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
    const what = id === c.ceo ? (c.charter.autopilot.mode ?? 'continuous') === 'continuous' ? 'The COO: works continuously with its own plan and threads, directs the department heads as work is needed, decides build requests and writes a brief on the autopilot timer.' : 'The COO: runs the company cycle, plans each cycle, directs the department leads and writes the brief.' : id === c.auditor ? 'The independent auditor: a different model that attacks proposals, skills and engine changes before they are accepted.' : dep ? `Lead of the ${dep.name} department.` : sup ? `The model behind the super agent "${sup.title}".` : (a.tags ?? []).includes('builder') ? 'A worker: builds one ticket at a time in its own sandboxed folder.' : teams.length ? `Member of ${teams.join(', ')}.` : 'An agent of the company.'
    return {
      ...base, name: a.name, what, description: a.description, role: clip(a.role ?? '', 6000), model: a.model, provider: a.provider ?? 'claude-code', effort: a.effort,
      tools: a.tools ?? [], skills: a.skills ?? [], canWrite: (a.tools ?? []).some(t => ['Edit', 'Write', 'Bash'].includes(t)), tags: a.tags ?? [],
      teams, leads: dep ? { department: dep.name, teams: dep.teams } : null, superAgent: sup?.id ?? null,
      reportsTo: id === c.ceo ? 'the CEO super agent' : dep ? `the COO (${c.ceo})` : sup ? (sup.parent ? `super agent ${sup.parent}` : 'you') : teams.length ? (c.departments.find(d => d.teams.some(t => teams.includes(t)))?.lead ?? 'its team') : 'the super agent that calls it',
      now: busy[id] ?? null,
      recent: rows.slice(0, 15),
      cost: { todayUsd: Math.round(rows.filter(r => (r.startedAt ?? '') >= todayIso).reduce((n, r) => n + (r.costUsd ?? 0), 0) * 100) / 100, recentUsd: Math.round(rows.reduce((n, r) => n + (r.costUsd ?? 0), 0) * 100) / 100, turns: rows.length },
    }
  }
  if (type === 'team') {
    const t = registry.getTeam(id)
    const dep = c.departments.find(d => d.teams.includes(id))
    return { ...base, name: id, what: `A team${dep ? ` in the ${dep.name} department, led by ${dep.lead}` : ''}. A team is a few agents who answer one task together in a shared chat.`, description: t.description, members: t.members.map(n => ({ ...agentInfo(registry, n), now: busy[n] ?? null })), department: dep?.name ?? null, asks: s.jobs.filter(j => j.kind === 'team' && j.target === id).slice(-6).reverse() }
  }
  if (type === 'department') {
    const d = c.departments.find(x => x.id === id)
    if (!d) throw new Error('no such department')
    return { ...base, name: d.name, what: `A department: one lead (${d.lead}) directing ${d.teams.length} team(s) through a super team. ${(c.charter.autopilot.mode ?? 'continuous') === 'continuous' ? 'Its head works continuously with its own plan: it takes directives from the COO at any time, runs its teams in the background and reports with evidence.' : `Each company cycle the COO gives it one directive and it reports back with evidence.`}`, description: d.mission, lead: agentInfo(registry, d.lead), teams: d.teams, superTeamId: d.superTeamId, initiatives: c.initiatives.filter(i => i.department === id).slice(-12).reverse().map(i => ({ id: i.id, title: i.title, stage: i.stage, confidence: i.confidence, note: clip(i.note ?? '', 300) })), builds: c.builds.filter(b => b.department === id).slice(-8).reverse().map(b => ({ id: b.id, title: b.title, status: b.status })) }
  }
  if (type === 'super-team') {
    const t = sa.co.supers.get(id)
    const dep = c.departments.find(d => d.superTeamId === id)
    return { ...base, name: t.title, what: `A super team: the supervisor ${t.supervisor} hands parts of a task to several teams, reads their answers and writes one result.${dep ? ` It is how the ${dep.name} department works.` : ''}`, supervisor: agentInfo(registry, t.supervisor), teams: t.teams.map(x => x.team), busy: t.busy, messages: t.messages.slice(-6).reverse().map(m => ({ from: m.from, ts: m.ts, status: m.status, text: clip(m.text ?? '', 900), runId: m.runId })) }
  }
  if (type === 'super-agent') {
    const a = s.agents.find(x => x.id === id)
    if (!a) throw new Error('no such super agent')
    return {
      ...base, name: a.title, what: a.parent ? `A super agent under "${a.parent}": always on, reacts to events in its own area and reports upward.` : 'The CEO super agent: always on, reacts to every event, decides what to do, and is the one you talk to.', description: a.mission, agent: a.agent, parent: a.parent, children: s.agents.filter(x => x.parent === id).map(x => x.id), reports: a.reports, plan: a.plan ?? null,
      busy: s.evals.some(e => e.agent === id && e.status === 'running'), pending: s.triggers.filter(t => t.to === id && t.status === 'pending').length,
      decisions: s.evals.filter(e => e.agent === id && e.note).slice(-10).reverse().map(e => ({ at: e.endedAt, note: e.note, actions: e.actions ?? [], runId: e.runId })),
      tickets: s.tickets.filter(t => t.owner === id).slice(-12).reverse().map(t => ({ id: t.id, title: t.title, status: t.status, outcome: t.outcome, turns: t.assignments.length })),
    }
  }
  if (type === 'company') {
    return { ...base, name: 'The company', what: 'The company runs a full cycle on a timer: the COO plans, each department works on one directive, at most two proposals go to the gate, and the COO writes a brief. The super agents sit above it and react between cycles.', description: c.charter.mission, cycles: c.cycles.slice(-8).reverse().map(x => ({ id: x.id, startedAt: x.startedAt, status: x.status, summary: clip(x.summary ?? x.error ?? '', 500), report: x.report, spendUsd: x.spendUsd })) }
  }
  throw new Error('unknown kind')
}

// ---------------------------------------------------------------- timeline
/** One list of everything that happened, newest first. who filters to one individual; before (ISO) looks back. */
export function timeline(sa, { who: w, before, limit = 150 } = {}) {
  const s = sa.store.read()
  const c = sa.co.read()
  const ev = []
  const add = (ts, whos, kind, text, link = {}) => { if (ts) ev.push({ ts, who: whos.filter(Boolean), kind, text: clip(text, 700), ...link }) }
  const supTitle = id => s.agents.find(a => a.id === id)?.agent
  for (const m of s.feed) add(m.ts, [m.from === 'owner' ? 'you' : m.from, supTitle(m.from)], m.from === 'owner' ? 'you wrote' : m.kind === 'report' ? 'worker report' : m.kind === 'gate' ? 'gate result' : m.kind === 'change' ? 'engine change' : 'message', m.text, m.ticket ? { ticket: m.ticket } : {})
  for (const e of s.evals) if (e.note) add(e.endedAt ?? e.startedAt, [e.agent, supTitle(e.agent)], 'decision', `${e.note}${e.actions?.length ? `\nDid: ${e.actions.map(a => `${a.tool}${a.arg ? ` (${a.arg})` : ''}`).join(', ')}` : ''}`, { run: e.runId })
  for (const t of s.tickets) {
    add(t.createdAt, [t.owner, supTitle(t.owner)], 'ticket opened', t.title, { ticket: t.id })
    for (const a of t.assignments) if (a.report) add(a.endedAt, [t.worker, t.owner], `worker turn: ${a.report.status}`, `${t.title}\n${a.report.summary}`, { ticket: t.id, run: a.runId })
  }
  for (const j of s.jobs) { add(j.startedAt, [j.from, j.target], `asked ${j.kind}`, j.message); if (j.endedAt) add(j.endedAt, [j.target, j.from], `${j.kind} replied`, j.result ?? j.error ?? j.status) }
  for (const g of s.changes ?? []) add(g.updatedAt ?? g.ts, [g.by, 'engine'], `engine change: ${g.status}`, `${g.title}${g.note ? `\n${g.note}` : ''}`, { ticket: g.ticket })
  for (const x of c.cycles) {
    add(x.startedAt, ['company', c.ceo], 'cycle started', `Trigger: ${x.trigger}${x.focus ? `; focus: ${x.focus}` : ''}`, { run: x.runId })
    if (x.endedAt) add(x.endedAt, ['company', c.ceo], `cycle ${x.status}`, x.summary ?? x.error ?? '', { run: x.runId, ...(x.report ? { report: x.report } : {}) })
  }
  const depLead = id => c.departments.find(d => d.id === id)?.lead
  for (const i of c.initiatives) for (const h of i.history ?? []) add(h.ts, [i.department, depLead(i.department), 'company'], `initiative: ${h.stage}`, `${i.title}\n${h.note ?? ''}`, { ini: i.id })
  for (const d of c.decisions) { add(d.ts, [d.from, supTitle(d.from), 'you'], 'question for you', d.question); if (d.answeredAt) add(d.answeredAt, ['you', d.from], 'you answered', `${d.choice}${d.note ? ` (${d.note})` : ''}: ${d.question}`) }
  for (const h of c.hires) add(h.ts, [h.name, h.team, P.peopleLeadName, 'company'], `hire: ${h.status}`, `${h.name} into ${h.team}. ${h.reason ?? h.why ?? ''}`)
  for (const o of c.orders) add(o.ts, ['company', 'gate', o.issuedBy], 'passed verification', `${o.proposal}: P(better) ${o.pImprove}, required ${o.required}; ${o.status ?? 'active'}`)
  for (const b of c.builds) add(b.ts, [b.department, depLead(b.department), 'company'], 'build request', `${b.title} (${b.status})`)
  // an ordinary agent's own turns only when asked for that agent, or they would drown everything else
  if (w && !ev.some(e => e.who.includes(w))) for (const r of runRows(sa).filter(x => x.agent === w)) add(r.endedAt ?? r.startedAt, [r.agent], `turn: ${r.status}`, `${r.label} in "${r.run}"${r.tools ? `, ${r.tools} tool calls` : ''}`, { run: r.runId, file: r.file })
  else if (w) for (const r of runRows(sa).filter(x => x.agent === w).slice(0, 30)) add(r.endedAt ?? r.startedAt, [r.agent], `turn: ${r.status}`, `${r.label} in "${r.run}"${r.tools ? `, ${r.tools} tool calls` : ''}`, { run: r.runId, file: r.file })
  let out = ev
  if (w) out = out.filter(e => e.who.includes(w))
  if (before) out = out.filter(e => e.ts <= before)
  out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
  return out.slice(0, Math.min(400, Math.max(1, Number(limit) || 150)))
}

/** Names the timeline can be filtered by. */
export function people(sa) {
  const o = orgView(sa)
  const list = [{ id: 'you', label: 'You' }, { id: 'company', label: 'The company (cycles)' }]
  for (const a of o.superAgents) list.push({ id: a.id, label: `Super agent: ${a.title}` })
  for (const d of o.company.departments) {
    list.push({ id: d.id, label: `Department: ${d.name}` })
    for (const t of d.teams) list.push({ id: t.name, label: `Team: ${t.name}` })
  }
  const seen = new Set()
  const ag = n => { if (n && !seen.has(n)) { seen.add(n); list.push({ id: n, label: `Agent: ${n}` }) } }
  ag(o.company.ceo?.name); ag(o.company.auditor?.name)
  for (const d of o.company.departments) { ag(d.lead.name); for (const t of d.teams) for (const m of t.members) ag(m.name) }
  for (const a of o.others) ag(a.name)
  return list
}
