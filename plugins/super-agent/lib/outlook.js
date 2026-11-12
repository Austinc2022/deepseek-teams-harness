/**
 * What the owner asks of any unit on the dashboard: what is its goal, how far along is it, when will it be done,
 * what comes next, what will the result be. Plus its KPIs, and what it is made of (instructions, skills, tools,
 * memory). Read-only. Every number says how it was measured; where nothing can be measured the answer is "unknown",
 * never a guess.
 */
import fs from 'node:fs'
import path from 'node:path'
import { listMemory } from '../../agent-forge/lib/memory.js'
import { clip } from './store.js'
import { progress } from './views.js'
import { profile as P } from '../../company/lib/profile.js'

const DAY = 86400_000
const HOUR = 3600_000
const r1 = n => Math.round(n * 10) / 10
const pct = n => Math.round(100 * n)
const label = st => P.stageLabels?.[st] ?? st
const span = d => (d < 1 ? `${Math.max(1, Math.round(d * 24))} hours` : d < 14 ? `${r1(d)} days` : `${Math.round(d / 7)} weeks`)
const mean = a => (a.length ? a.reduce((n, x) => n + x, 0) / a.length : null)

/** When the next autopilot cycle is due, or null. */
export function nextCycleAt(c) {
  const last = c.cycles.at(-1)
  if (!c.charter.autopilot.enabled || !last) return null
  return new Date(new Date(last.startedAt).getTime() + c.charter.autopilot.everyHours * HOUR).toISOString()
}

// ---------------------------------------------------------------- initiatives: progress and pace
function initiativeView(c, depId) {
  const all = c.initiatives.filter(i => !depId || i.department === depId)
  const target = Math.max(1, P.stages.indexOf(P.gatedStage))
  const idx = i => Math.min(target, Math.max(0, P.stages.indexOf(i.stage)))
  const killed = all.filter(i => i.stage === 'killed')
  const alive = all.filter(i => i.stage !== 'killed')
  const reached = alive.filter(i => P.stages.indexOf(i.stage) >= target)
  const live = alive.filter(i => P.stages.indexOf(i.stage) < target)
  // measured pace: days per stage step, from the recorded stage changes
  const steps = []
  for (const i of all) {
    const h = (i.history ?? []).filter(x => x.ts && P.stages.includes(x.stage)).sort((a, b) => (a.ts < b.ts ? -1 : 1))
    for (let k = 1; k < h.length; k++) {
      const d = P.stages.indexOf(h[k].stage) - P.stages.indexOf(h[k - 1].stage)
      if (d > 0 && h[k].stage !== 'killed') steps.push((new Date(h[k].ts) - new Date(h[k - 1].ts)) / DAY / d)
    }
  }
  const best = live.slice().sort((a, b) => idx(b) - idx(a))[0] ?? null
  return { all, killed, alive, reached, live, target, idx, best, paceDays: mean(steps), paceN: steps.length }
}

function initiativeProgress(c, v) {
  if (!v.all.length) return { pct: null, label: 'No idea has been opened yet', basis: 'Progress is measured on the ideas (initiatives) of this unit; there are none yet.', parts: [] }
  const p = v.alive.length ? mean(v.alive.map(i => v.idx(i) / v.target)) : 0
  const basis = v.alive.length
    ? `Average position of its ${v.alive.length} live idea${v.alive.length === 1 ? '' : 's'} on the way to "${label(P.gatedStage)}" (${P.stages.slice(0, v.target + 1).map(label).join(' > ')}). ${v.killed.length} other idea${v.killed.length === 1 ? ' was' : 's were'} killed and do not count.`
    : `All ${v.all.length} idea${v.all.length === 1 ? ' was' : 's were'} killed, so nothing is alive and the share is 0%.`
  return {
    pct: pct(p), label: `${v.reached.length} of ${v.all.length} ideas reached "${label(P.gatedStage)}"`, basis,
    parts: [
      ...P.stages.slice(0, v.target + 1).map(st => ({ label: label(st), n: v.all.filter(i => i.stage === st).length })),
      { label: label('killed'), n: v.killed.length },
    ],
  }
}

function initiativeEta(v) {
  if (!v.best) return v.reached.length ? { text: 'Done: an idea has reached the target stage.', date: null, basis: '' } : { text: 'Unknown: no idea is alive.', date: null, basis: 'A timeline needs at least one live idea.' }
  if (v.paceDays == null) return { text: 'Unknown: no idea has moved forward a stage yet.', date: null, basis: 'A timeline is projected from how long stage moves actually took. None is recorded yet.' }
  const left = v.target - v.idx(v.best)
  const d = left * v.paceDays
  return { text: `About ${span(d)} for the leading idea at the pace so far`, date: new Date(Date.now() + d * DAY).toISOString(), basis: `${left} stage${left === 1 ? '' : 's'} left for "${clip(v.best.title, 80)}" x ${r1(v.paceDays)} days per stage (average of ${v.paceN} measured stage move${v.paceN === 1 ? '' : 's'}). Later stages tend to be slower, so read it as the earliest likely date.` }
}

function initiativeNext(c, v) {
  const out = v.live.slice().sort((a, b) => v.idx(b) - v.idx(a)).slice(0, 5).map(i => ({ text: i.title, status: `next: ${label(P.stages[Math.min(P.stages.length - 1, P.stages.indexOf(i.stage) + 1)])}`, note: clip(i.note ?? '', 200) }))
  const nc = nextCycleAt(c)
  out.push({ text: nc ? `Next company cycle ${new Date(nc) < new Date() ? 'is due now' : 'at ' + nc.slice(0, 16).replace('T', ' ') + ' UTC'}: new directives are given then.` : 'Autopilot is off: no company cycle is scheduled.', status: 'schedule', note: '' })
  return out
}

function initiativeOutcome(c, v) {
  const gate = `${pct(c.charter.gate.minConfidence)}%`
  if (v.best) return { text: `Leading idea: "${v.best.title}" (${label(v.best.stage)}). ${clip(v.best.thesis ?? v.best.note ?? '', 280)} If it holds up it passes the gate (confidence at least ${gate}) and the independent audit and is accepted at "${label(P.gatedStage)}". If it fails it is killed, which is a cheap and useful result.`, basis: 'From the idea records.' }
  if (v.reached.length) return { text: `${v.reached.length} idea${v.reached.length === 1 ? ' has' : 's have'} reached "${label(P.gatedStage)}".`, basis: 'From the idea records.' }
  return { text: 'No idea is alive. The next company cycle is where new ones are opened. Honest odds are in the COO and CEO reports.', basis: 'From the idea records.' }
}

// ---------------------------------------------------------------- the goal ladder (company level)
function ladderEta(sa, g) {
  const s = sa.store.read()
  const since = new Date(s.createdAt ?? Date.now()).getTime()
  const elapsed = (Date.now() - since) / DAY
  if (!g.done) return { text: 'Unknown: no step of the ladder is done yet.', date: null, basis: 'A timeline needs at least one finished step to measure a pace.' }
  if (g.done === g.total) return { text: 'Every step of the ladder is done.', date: null, basis: '' }
  if (elapsed < 0.5) return { text: 'Unknown: too early to measure a pace.', date: null, basis: '' }
  const per = elapsed / g.done
  const d = per * (g.total - g.done)
  return { text: `About ${span(d)} for the remaining ${g.total - g.done} step${g.total - g.done === 1 ? '' : 's'} at the pace so far`, date: new Date(Date.now() + d * DAY).toISOString(), basis: `${g.done} step${g.done === 1 ? '' : 's'} in ${r1(elapsed)} days is ${r1(per)} days per step. The remaining steps depend on results that cannot be scheduled (for example finding a strategy that works), so read the date as a lower bound, not a forecast. It covers the ladder only, not the money goal.` }
}

function ladderBlock(sa) {
  const g = progress(sa)
  const money = g.money
  return {
    progress: {
      pct: g.percent, label: `${g.done} of ${g.total} steps of the goal ladder`, basis: 'Each step is measured by code where possible, otherwise reported by the COO or CEO with evidence.',
      parts: g.steps.map(x => ({ label: x.title, done: x.done, detail: clip(x.detail ?? '', 160) })),
      secondary: { label: `${money.label ?? 'Money goal'}: ${money.paperProfitPerDayUsd} of ${Number(money.targetDailyUsd).toLocaleString('en-US')} USD a day`, pct: Math.round(money.shareOfTarget * 1e6) / 1e4, basis: money.basis ?? '' },
    },
    eta: ladderEta(sa, g),
    outcome: { text: g.next ? `Next on the ladder: "${g.next.title}". ${clip(g.next.detail ?? '', 240)}${g.odds ? `\nThe CEO's stated odds for the north star: ${clip(g.odds, 500)}` : ''}` : `Every step is done.${g.odds ? ` Stated odds: ${clip(g.odds, 400)}` : ''}`, basis: 'From the goal ladder and the CEO odds statement.' },
    next: g.steps.filter(x => !x.done).slice(0, 5).map((x, i) => ({ text: x.title, status: i === 0 ? 'next' : 'later', note: clip(x.detail ?? '', 200) })),
  }
}

// ---------------------------------------------------------------- one super agent (from its own plan)
function planBlock(a, c) {
  const plan = a?.plan
  if (!plan) return { progress: { pct: null, label: 'No plan written yet', basis: 'The progress of a super agent is the share of its own to-do list that is done. It has not written a plan.', parts: [] }, eta: { text: 'Unknown: no plan yet.', date: null, basis: '' }, outcome: { text: 'Not stated yet.', basis: '' }, next: [] }
  const todo = plan.todo ?? []
  const done = todo.filter(t => t.status === 'done').length
  const exp = plan.expectedBy ? String(plan.expectedBy) : ''
  const expDate = /^\d{4}-\d{2}-\d{2}/.test(exp) ? new Date(exp).toISOString() : null
  return {
    progress: {
      pct: todo.length ? pct(done / todo.length) : null, label: todo.length ? `${done} of ${todo.length} to-do items done` : 'No to-do items', basis: 'Share of its own to-do list that is done. Items are added as work is found, so the share can fall.',
      parts: todo.map(t => ({ label: t.text, done: t.status === 'done', detail: `${t.status}${t.owner ? ' · ' + t.owner : ''}${t.note ? ' · ' + t.note : ''}` })),
      ...(Number.isFinite(plan.pctComplete) ? { secondary: { label: `Its own estimate: ${plan.pctComplete}% of the goal`, pct: plan.pctComplete, basis: plan.pctBasis ? `Its reasoning: ${plan.pctBasis}` : 'Stated by the agent in its plan; not measured.' } } : {}),
    },
    eta: exp ? { text: `Its own estimate: ${exp}`, date: expDate, basis: 'Stated by the agent in its plan; not measured.' } : { text: 'Unknown: the plan does not give a date.', date: null, basis: 'It is asked to add one the next time it rewrites its plan.' },
    outcome: { text: plan.outcome || `${plan.focus} (no expected result written yet)`, basis: plan.outcome ? 'Stated by the agent in its plan.' : 'From its focus.' },
    next: [
      ...todo.filter(t => t.status !== 'done').slice(0, 8).map(t => ({ text: t.text, status: t.status, owner: t.owner, note: t.note })),
      ...(plan.blockers ?? []).slice(0, 3).map(b => ({ text: b, status: 'blocker', note: '' })),
    ],
  }
}

// ---------------------------------------------------------------- workers and tickets
function ticketBlock(s) {
  const tk = s.tickets
  const delivered = tk.filter(t => t.outcome === 'completed').length
  const open = tk.filter(t => t.status === 'open')
  const stopped = tk.filter(t => t.status === 'ended' && t.outcome !== 'completed').length
  return {
    progress: { pct: tk.length ? pct(delivered / tk.length) : null, label: `${delivered} of ${tk.length} tickets delivered`, basis: `${open.length} open, ${stopped} stopped or dropped. Workers have no goal of their own; this is the share of the work they were given that came back delivered.`, parts: [{ label: 'Delivered', n: delivered }, { label: 'Open', n: open.length }, { label: 'Stopped or dropped', n: stopped }] },
    eta: { text: open.length ? `Unknown: ${open.length} open ticket${open.length === 1 ? '' : 's'}.` : 'Nothing is open.', date: null, basis: 'A ticket has no time estimate until its worker reports.' },
    outcome: { text: open[0] ? `Open: "${open[0].title}". Done when: ${clip(open[0].doneWhen ?? 'its brief is met', 240)}` : 'No open ticket.', basis: 'From the ticket brief.' },
    next: open.slice(0, 6).map(t => ({ text: t.title, status: t.assignments.at(-1)?.status === 'running' ? 'working' : 'queued', note: `turn ${t.assignments.length}` })),
  }
}

// ---------------------------------------------------------------- KPIs
const todayIso = () => new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
function kpiTiles(rows, set, k, extra) {
  const mine = rows.filter(r => set.has(r.agent))
  const t0 = todayIso(), d1 = new Date(Date.now() - DAY).toISOString()
  const sum = (a, f) => a.reduce((n, r) => n + f(r), 0)
  const usd = n => `$${(Math.round(n * 100) / 100).toFixed(2)}`
  const done = mine.filter(r => r.status === 'completed'), failed = mine.filter(r => r.status === 'failed')
  const mins = mine.filter(r => r.e).map(r => (new Date(r.e) - new Date(r.s)) / 60000)
  const w1 = sum(k.days.slice(7), d => d.turns), w0 = sum(k.days.slice(0, 7), d => d.turns)
  const trend = w0 ? `${w1 >= w0 ? '+' : ''}${Math.round(100 * (w1 - w0) / w0)}% vs the week before` : w1 ? 'new this week' : ''
  const tiles = [
    { label: 'Spend today', value: usd(sum(mine.filter(r => r.s >= t0), r => r.costUsd)), sub: `${usd(sum(mine.filter(r => r.s >= d1), r => r.costUsd))} in 24 h` },
    { label: 'Cost per turn', value: mine.length ? usd(sum(mine, r => r.costUsd) / mine.length) : '–', sub: `${mine.length} recorded turns` },
    { label: 'Average turn', value: mins.length ? `${r1(mean(mins))} min` : '–', sub: 'wall time per turn' },
    { label: 'Tool calls per turn', value: mine.length ? r1(sum(mine, r => r.tools) / mine.length) : '–', sub: `${k.toolsToday} today` },
    { label: 'Turns, last 7 days', value: w1, sub: trend },
    { label: 'Failed turns', value: failed.length, sub: done.length + failed.length ? `${pct(failed.length / (done.length + failed.length))}% of finished turns` : 'none finished yet' },
  ]
  return [...tiles, ...extra]
}

function extraKpis(sa, ref, c, s, depId) {
  const out = []
  if (depId || ref === 'ceo') {
    const v = initiativeView(c, depId)
    out.push({ label: 'Ideas alive', value: v.alive.length, sub: `${v.reached.length} reached ${label(P.gatedStage)}` })
    out.push({ label: 'Ideas killed', value: v.killed.length, sub: v.all.length ? `${pct(v.killed.length / v.all.length)}% of ${v.all.length} tried` : 'none yet' })
    if (v.paceDays != null) out.push({ label: 'Days per stage', value: r1(v.paceDays), sub: `${v.paceN} measured moves` })
  }
  if (ref.startsWith('sa:')) {
    const id = ref.slice(3)
    const mine = s.tickets.filter(t => t.owner === id)
    out.push({ label: 'Tickets delivered', value: mine.filter(t => t.outcome === 'completed').length, sub: `${mine.filter(t => t.status === 'open').length} open` })
    out.push({ label: 'Decisions made', value: s.evals.filter(e => e.agent === id).length, sub: `${s.triggers.filter(t => t.to === id && t.status === 'pending').length} event(s) waiting` })
  }
  if (ref === 'workers') {
    out.push({ label: 'Tickets delivered', value: s.tickets.filter(t => t.outcome === 'completed').length, sub: `${s.tickets.filter(t => t.status === 'open').length} open` })
  }
  return out
}

const membersOf = (sa, t) => { try { return sa.forge.registry.getTeam(t).members ?? [] } catch { return [] } }

// ---------------------------------------------------------------- the entry point
/** goal, progress, timeline, next, outcome, KPIs and schedules for one unit. ctx: { meta, set, k, rows, org } from board.js */
export function outlook(sa, ref, { meta, set, k, rows }) {
  const s = sa.store.read(), c = sa.co.read()
  const m = meta[ref]
  let goal = m.description ?? m.mission ?? ''
  let body
  let depId = null
  let note = ''
  if (ref.startsWith('sa:')) {
    const a = s.agents.find(x => `sa:${x.id}` === ref)
    goal = a?.mission || goal
    const pb = planBlock(a, c)
    if (a && !a.parent) {
      const lb = ladderBlock(sa)
      body = { ...lb, outcome: a.plan?.outcome ? { text: `${a.plan.outcome}\n${lb.outcome.text}`, basis: 'Its own statement, then the ladder.' } : lb.outcome, next: [...pb.next, ...lb.next.map(x => ({ ...x, status: 'ladder: ' + x.status }))] }
    } else body = pb
  } else if (ref === 'ceo') {
    goal = `Run the company cycle toward the charter: ${c.charter.mission}`
    body = { ...ladderBlock(sa) }
    const v = initiativeView(c, null)
    body.next = [...initiativeNext(c, v), ...body.next.map(x => ({ ...x, status: 'ladder: ' + x.status }))]
  } else if (ref.startsWith('dep:')) {
    depId = ref.slice(4)
    const v = initiativeView(c, depId)
    goal = m.mission ?? goal
    body = { progress: initiativeProgress(c, v), eta: initiativeEta(v), outcome: initiativeOutcome(c, v), next: initiativeNext(c, v) }
  } else if (ref.startsWith('team:') || ref.startsWith('agent:')) {
    const name = ref.slice(ref.indexOf(':') + 1)
    const dep = c.departments.find(d => (ref.startsWith('team:') ? d.teams.includes(name) : d.lead === name || d.teams.some(t => membersOf(sa, t).includes(name))))
    const sup = s.agents.find(x => x.agent === name)
    if (sup) { body = planBlock(sup, c); goal = sup.mission || goal }
    else if (dep) {
      const v = initiativeView(c, dep.id)
      body = { progress: { ...initiativeProgress(c, v), label: `Department "${dep.name}": ${initiativeProgress(c, v).label}` }, eta: initiativeEta(v), outcome: initiativeOutcome(c, v), next: initiativeNext(c, v) }
      note = `${ref.startsWith('team:') ? 'A team' : 'An agent'} has no goal of its own. These numbers are its department's (${dep.name}), which it contributes to. Its own delivery shows in the KPIs below.`
      goal = [goal, `Department goal: ${dep.mission}`].filter(Boolean).join('\n')
      depId = null
    } else body = { progress: { pct: null, label: 'No goal of its own', basis: 'It works on what it is assigned. Its delivery shows in the KPIs.', parts: [] }, eta: { text: 'Unknown: it is not on a timeline.', date: null, basis: '' }, outcome: { text: 'It answers the next assignment.', basis: '' }, next: [] }
    const run = rows.filter(r => set.has(r.agent) && r.status === 'running')
    for (const r of run.slice(0, 3)) body.next.unshift({ text: r.label, status: 'working', note: '' })
  } else if (ref === 'company') {
    goal = c.charter.mission
    body = ladderBlock(sa)
  } else if (ref === 'workers') {
    body = ticketBlock(s)
    goal = 'Build what the tickets ask, one ticket at a time, in a sandboxed folder.'
  } else {
    body = { progress: { pct: null, label: 'No goal of its own', basis: 'This unit judges work that others make; it has no progress of its own.', parts: [] }, eta: { text: 'Unknown: it is not on a timeline.', date: null, basis: '' }, outcome: { text: 'A verdict on each proposal, skill and engine change it is shown.', basis: '' }, next: [] }
  }
  const schedules = (s.schedules ?? []).filter(x => x.ref === ref && x.status === 'active').map(x => ({ id: x.id, text: x.text, at: x.at, everyHours: x.everyMin ? x.everyMin / 60 : null, runs: x.runs ?? 0 }))
  if (schedules.length) body.next = [...body.next, ...schedules.map(x => ({ text: x.text, status: 'scheduled', note: `${new Date(x.at).toLocaleString()}${x.everyHours ? ` and every ${x.everyHours} h` : ''}` }))]
  return {
    goal: { text: clip(goal, 900) },
    ...body, note, schedules,
    kpis: kpiTiles(rows, set, k, extraKpis(sa, ref, c, s, depId)),
  }
}

// ---------------------------------------------------------------- what it is made of: instructions, skills, tools, memory
function skillInfo(registry, name) {
  let d = ''
  try {
    const t = fs.readFileSync(path.join(registry.d.skills, name, 'SKILL.md'), 'utf8')
    d = t.match(/^description:\s*"?(.+?)"?\s*$/m)?.[1] ?? ''
  } catch { /* missing skill file */ }
  return { name, description: clip(d, 260) }
}

/** The members of a unit that have settings and memory worth showing. */
export function agentNames(sa, ref, meta, set) {
  const c = sa.co.read(), s = sa.store.read()
  if (ref.startsWith('sa:')) return [s.agents.find(a => `sa:${a.id}` === ref)?.agent].filter(Boolean)
  if (ref === 'ceo') return [c.ceo]
  if (ref === 'audit') return [c.auditor]
  const lead = meta[ref]?.lead
  return [...new Set([lead, ...set].filter(Boolean))].slice(0, 12)
}

export function setupAndMemory(sa, names) {
  const { registry } = sa.forge
  const setup = [], memory = []
  const teams = registry.listTeams()
  for (const name of names) {
    let d
    try { d = registry.getAgent(name) } catch { continue }
    setup.push({
      name, description: d.description ?? '', provider: d.provider ?? 'claude-code', model: d.model, effort: d.effort ?? null, maxTurns: d.maxTurns ?? null, permission: d.permission ?? null,
      tools: d.tools ?? [], disallowedTools: d.disallowedTools ?? [], mcp: Object.keys(d.mcpServers ?? {}), skills: (d.skills ?? []).map(n => skillInfo(registry, n)),
      canWrite: (d.tools ?? []).some(t => ['Edit', 'Write', 'Bash'].includes(t)), tags: d.tags ?? [], folders: d.folders ?? [], project: d.project ?? null, role: clip(d.role ?? '', 6000), memoryMode: d.memory?.mode ?? 'none',
    })
    const team = teams.find(t => (t.members ?? []).includes(name))?.name
    let m = null
    try { m = listMemory(registry.home, d, { team }) } catch { /* unreadable memory folder */ }
    memory.push(m
      ? { agent: name, mode: m.mode, scope: m.scope, noteCount: m.notes.length, notes: m.notes.slice(0, 20).map(n => ({ id: n.id, title: n.title, tags: n.tags, updated: n.updated, body: clip(n.body, 700) })), journalCount: m.journalCount, journal: m.journal.slice(0, 8).map(j => ({ ts: j.ts, label: j.label, ok: j.ok, outcome: clip(j.outcome, 320) })) }
      : { agent: name, mode: 'none', scope: null, noteCount: 0, notes: [], journalCount: 0, journal: [] })
  }
  return { setup, memory }
}
