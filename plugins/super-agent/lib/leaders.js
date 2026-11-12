/**
 * What every leader shares (the CEO and the super agents below it, the COO, the department heads):
 *
 *   plan      focus, priorities and a to-do list whose items have stable ids, an owner, a status, dependencies and
 *             optionally a ready-to-open ticket. Items change one at a time (plan_items), so threads do not overwrite
 *             each other; a full rewrite (update_plan) keeps what another thread changed meanwhile.
 *   threads   a leader handles events in several threads ("lanes") at once: your messages, each workstream, and the
 *             main thread. One turn per lane at a time; at most settings.maxLanes lanes per leader.
 *   wake-ups  a leader with free capacity and ready to-do items is woken to start them; a leader with nothing planned
 *             and nothing running is asked to plan ahead. Both are rate-limited.
 *
 * Pure functions over the state; super.js calls them.
 */
import { now, newId, str, slug } from './store.js'

export const kindOf = a => a?.kind ?? 'super'
export const isSuper = a => kindOf(a) === 'super'
export const MAX_TODO = 30

const STATUSES = ['todo', 'doing', 'blocked', 'done']

/** A ticket an item can open by itself once its dependencies are done. Null when it is not complete enough. */
function ticketSpec(t) {
  if (!t || typeof t !== 'object') return null
  const spec = { title: str(t.title, 140).trim(), brief: str(t.brief, 12000).trim(), doneWhen: str(t.doneWhen, 3000).trim() }
  if (spec.title.length < 6 || spec.brief.length < 80 || !spec.doneWhen) return null
  if (t.worker) spec.worker = str(t.worker, 60)
  if (t.talent === 'principal') spec.talent = 'principal'
  return spec
}

/** One to-do item, cleaned. `prev` is the item it replaces (keeps its id, link and history). */
export function normItem(t, prev, lane) {
  const item = {
    id: prev?.id ?? newId('p'),
    text: str(t?.text ?? prev?.text, 300).trim(),
    owner: str(t?.owner ?? prev?.owner ?? 'you', 60),
    status: STATUSES.includes(t?.status) ? t.status : prev?.status ?? 'todo',
    note: str(t?.note ?? prev?.note ?? '', 300),
  }
  const deps = Array.isArray(t?.dependsOn) ? t.dependsOn : prev?.dependsOn
  if (deps?.length) item.dependsOn = [...new Set(deps.map(String))].slice(0, 8)
  const ws = t?.workstream ?? prev?.workstream
  if (ws) item.workstream = slug(ws, 24)
  const tk = t?.ticket !== undefined ? ticketSpec(t.ticket) : prev?.ticket
  if (tk) item.ticket = tk
  if (prev?.ref) item.ref = prev.ref
  item.updatedAt = item.status !== prev?.status || item.text !== prev?.text || item.note !== prev?.note || !prev ? now() : prev.updatedAt ?? now()
  item.lane = item.updatedAt === prev?.updatedAt ? prev?.lane ?? lane : lane
  return item
}

/** The ids of a plan's items that are done (or no longer listed, which counts as done for a dependency). */
const doneIds = plan => new Set((plan?.todo ?? []).filter(t => t.status === 'done').map(t => t.id))

/** Items whose dependencies are all done and that have not started. */
export function readyItems(plan) {
  if (!plan?.todo?.length) return []
  const ids = new Set(plan.todo.map(t => t.id))
  const done = doneIds(plan)
  return plan.todo.filter(t => t.status === 'todo' && (t.dependsOn ?? []).every(d => done.has(d) || !ids.has(d)))
}

/** update_plan: a full rewrite. Items keep their id when the leader gives it (or the same text); items another thread
 * changed while this turn ran are kept even when this turn's list leaves them out. */
export function rewritePlan(prev, a, { lane, since }) {
  const list = (v, n) => (Array.isArray(v) ? v.slice(0, n) : [])
  const old = prev?.todo ?? []
  const used = new Set()
  const match = t => {
    const byId = t?.id && old.find(x => x.id === String(t.id) && !used.has(x.id))
    const byText = !byId && old.find(x => !used.has(x.id) && x.text === str(t?.text, 300).trim())
    const m = byId || byText || null
    if (m) used.add(m.id)
    return m
  }
  let todo = list(a.todo, MAX_TODO).map(t => normItem(t, match(t), lane)).filter(t => t.text)
  const keep = old.filter(x => !used.has(x.id) && x.lane !== lane && since && (x.updatedAt ?? '') > since)
  todo = [...todo, ...keep].slice(0, MAX_TODO)
  const plan = {
    focus: str(a.focus, 600).trim(),
    priorities: list(a.priorities, 3).map(p => ({ text: str(p?.text, 300), why: str(p?.why, 400) })).filter(p => p.text),
    todo,
    blockers: list(a.blockers, 8).map(b => str(b, 400)).filter(Boolean),
    waitingOnOwner: list(a.waitingOnOwner, 6).map(b => str(b, 400)).filter(Boolean),
    outcome: str(a.outcome ?? prev?.outcome, 500).trim(),
    expectedBy: str(a.expectedBy ?? prev?.expectedBy, 60).trim(),
    ...(Number.isFinite(Number(a.pctComplete)) && a.pctComplete !== '' && a.pctComplete != null
      ? { pctComplete: Math.min(100, Math.max(0, Math.round(Number(a.pctComplete)))), pctBasis: str(a.pctBasis, 300).trim() }
      : prev?.pctComplete != null ? { pctComplete: prev.pctComplete, pctBasis: prev.pctBasis } : {}),
    updatedAt: now(),
    v3: true, // written with item ids, dependencies and threads
  }
  if (!plan.focus || !plan.priorities.length) throw new Error('a plan needs a focus and at least one priority')
  return plan
}

/** plan_items: add, change or remove single items. Returns the new plan and a line per change. */
export function editItems(prev, a, { lane }) {
  if (!prev) throw new Error('write your plan first with update_plan')
  const todo = [...(prev.todo ?? [])]
  const out = []
  for (const id of (a.remove ?? []).map(String)) {
    const i = todo.findIndex(t => t.id === id)
    if (i < 0) throw new Error(`no plan item ${id}`)
    todo.splice(i, 1); out.push(`removed ${id}`)
  }
  for (const u of a.update ?? []) {
    const i = todo.findIndex(t => t.id === String(u?.id))
    if (i < 0) throw new Error(`no plan item ${u?.id}`)
    todo[i] = normItem(u, todo[i], lane); out.push(`updated ${todo[i].id} (${todo[i].status})`)
  }
  for (const n of a.add ?? []) {
    if (todo.length >= MAX_TODO) throw new Error(`a plan holds at most ${MAX_TODO} items; remove done ones first`)
    const item = normItem(n, null, lane)
    if (!item.text) throw new Error('an item needs text')
    todo.push(item); out.push(`added ${item.id}: ${item.text}${item.ticket ? ' (opens its ticket by itself when ready)' : ''}`)
  }
  const ids = new Set(todo.map(t => t.id))
  for (const t of todo) for (const d of t.dependsOn ?? []) if (!ids.has(d) && !d.startsWith('k')) throw new Error(`item ${t.id} depends on ${d}, which is not in the plan`)
  if (!out.length) throw new Error('nothing to change: give add, update or remove')
  return { plan: { ...prev, todo, updatedAt: now() }, lines: out }
}

/** The plan as the leader reads it: ids, owners, dependencies and which items are ready to start. */
export function planText(plan) {
  if (!plan) return '(none yet: write it with update_plan)'
  const ready = new Set(readyItems(plan).map(t => t.id))
  return [
    `Updated ${plan.updatedAt.slice(0, 16)}`,
    `Focus: ${plan.focus}`,
    `Priorities:\n${plan.priorities.map((p, i) => `${i + 1}. ${p.text} (${p.why})`).join('\n')}`,
    `To do (id [status] text, owner):\n${plan.todo.map(t => `- ${t.id} [${t.status}${ready.has(t.id) ? ', READY' : ''}] ${t.text} (${t.owner})${t.workstream ? ` ws:${t.workstream}` : ''}${t.dependsOn?.length ? ` after ${t.dependsOn.join(', ')}` : ''}${t.ticket ? ' [ticket ready to open]' : ''}${t.ref ? ` -> ${t.ref}` : ''}${t.note ? `: ${t.note}` : ''}`).join('\n') || '(empty)'}`,
    `Blockers: ${plan.blockers.join('; ') || '-'}`,
    `Waiting on the owner: ${plan.waitingOnOwner.join('; ') || '-'}`,
  ].join('\n')
}

/** Which thread of the leader handles this trigger. */
export function laneOf(t, s) {
  if (t.lane) return t.lane
  if (t.source === 'owner') return 'owner'
  if (t.ticket) {
    const k = s.tickets.find(x => x.id === t.ticket)
    if (k?.lane) return k.lane
    if (k?.workstream) return `ws:${k.workstream}`
  }
  return 'main'
}

/** The lane new work started in this lane reports back to (owner messages start work in the main thread). */
export const workLane = (lane, workstream) => (workstream ? `ws:${slug(workstream, 24)}` : lane === 'owner' ? 'main' : lane)

/**
 * Worker slots per leader: an equal share of maxWorkers among the leaders with queued tickets, at least one each;
 * slots a leader does not use are lent to the others.
 */
export function shareOf(n, owners) { return Math.max(1, Math.floor(n / Math.max(1, owners))) }

/**
 * Whether to wake an idle leader, and why. `busy` is whether it has a turn running, `running` how much of its work is
 * running (tickets, jobs), `free` its free worker slots.
 */
export function wakeReason(a, { busy, pending, running, free, lastEvalEnd, lastWake, idleWakeMin, planAheadMin }) {
  if (busy || pending || a.paused) return null
  const since = t => (t ? (Date.now() - new Date(t).getTime()) / 60000 : Infinity)
  if (since(lastEvalEnd) < 3 || since(lastWake) < idleWakeMin) return null
  const ready = readyItems(a.plan)
  if (ready.length && free > 0) return { kind: 'capacity', ready }
  const open = (a.plan?.todo ?? []).filter(t => t.status !== 'done')
  if (a.plan && !open.length && !running && since(lastEvalEnd) >= planAheadMin && since(lastWake) >= planAheadMin) return { kind: 'plan-ahead', ready: [] }
  return null
}
