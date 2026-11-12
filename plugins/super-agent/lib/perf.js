/**
 * Performance: a score out of 100 for every unit (super agent, COO, department, super team, team, agent), built only
 * from measured signals, and a reflection layer for units that stay low.
 *
 *   signals      task quality (the ticket verifier, critiques, the work judge, leaders' rate_work), run success, ticket
 *                delivery, plan health, initiative outcomes, capability gaps, and the scores of the units below.
 *                Each unit type weighs the signals that fit it; a signal without data is left out and the weights
 *                renormalise. Without any measured signal the score is unknown, never guessed.
 *   judge        a stateless work judge scores answers that nothing else checks: team and super team answers, agent
 *                answers, department reports (capped per day, cheap model).
 *   reflection   a unit below the bar (settings.growth.lowScore, 50) for 12 hours with enough data goes to its
 *                responsible leader: diagnose the cause, act (restructure the team or the workflow, add talent, add
 *                skills, change instructions or model), and commit_improvement. At the check time code compares the
 *                score; no improvement escalates one level up, and a second failure is told to the owner.
 *
 * Stored in growth.json under perf (score history, plans, reflection times, judged jobs).
 */
import { profile as P } from '../../company/lib/profile.js'
import { now, newId, str, clip } from './store.js'
import { structure, turns } from './board.js'
import { GAP } from './growth.js'

const DAY = 86400_000, HOUR = 3600_000
const S = { type: 'string' }
const mean = xs => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : null)
const r1 = v => (v == null ? null : Math.round(v))
export const JUDGE = `${P.prefix}work-judge`
const JUDGED = { type: 'object', properties: {
  score: { type: 'number', description: '0..100 against the best work in the field for this request' },
  why: { type: 'string', description: 'two sentences: what is good, what is missing' },
  parts: { type: 'array', description: 'when the work is split by author (sections headed "## <agent name>"), a score for each author\'s part; otherwise empty', items: { type: 'object', properties: { who: S, score: { type: 'number' }, why: S }, required: ['who', 'score', 'why'] } },
  capabilityGaps: { type: 'array', items: GAP },
}, required: ['score', 'why', 'parts', 'capabilityGaps'], additionalProperties: false }

/** What each unit type is scored on, and how much each signal weighs. */
const WEIGHTS = {
  // a unit's own checked work weighs most: good members do not hide a team's weak answers
  Agent: { quality: 0.6, reliability: 0.2, gaps: 0.2 },
  Team: { quality: 0.55, children: 0.25, reliability: 0.05, gaps: 0.15 },
  'Super team': { quality: 0.55, children: 0.25, gaps: 0.2 },
  Department: { initiatives: 0.3, quality: 0.25, children: 0.25, plan: 0.1, gaps: 0.1 },
  'Super agent': { delivery: 0.35, plan: 0.2, children: 0.3, gaps: 0.15 },
  COO: { delivery: 0.3, plan: 0.2, children: 0.35, gaps: 0.15 },
  Builders: { children: 1 },
  Assurance: { reliability: 0.6, children: 0.4 },
  Support: { children: 1 },
}
const LABEL = { quality: 'Quality of its checked work', reliability: 'Runs that completed', gaps: 'Capability gaps (14 days)', children: 'The units it leads', delivery: 'Tickets delivered', plan: 'Plan health', initiatives: 'Initiative outcomes' }

export class Perf {
  constructor(sa) { this.sa = sa; this.cache = null }
  get g() { return this.sa.growth }
  settings() { const st = this.sa.store.read().settings.growth ?? {}; return { low: st.lowScore ?? 50, lowHours: st.lowHours ?? 12, maxJudge: st.maxJudgePerDay ?? 40, reflect: st.reflection !== false } }

  // ---------------------------------------------------------------- the tree
  /** Every unit with its parent; super teams sit between a department and its teams. */
  units() {
    const { meta, sets } = structure(this.sa)
    const c = this.sa.co.read()
    const s = this.sa.store.read()
    const u = {}
    for (const [ref, m] of Object.entries(meta)) if (ref !== 'company') u[ref] = { ref, type: m.type, name: m.name, parent: m.parent === 'company' ? null : m.parent, agents: [...(sets[ref] ?? [])], lead: m.lead ?? null }
    for (const d of c.departments) {
      if (!d.superTeamId) continue
      let title = d.superTeamId
      try { title = this.sa.co.supers.get(d.superTeamId).title } catch {}
      const ref = `st:${d.superTeamId}`
      u[ref] = { ref, type: 'Super team', name: title, parent: `dep:${d.id}`, agents: [d.lead, ...d.teams.flatMap(t => u[`team:${t}`]?.agents ?? [])], lead: d.lead, id: d.superTeamId }
      for (const t of d.teams) if (u[`team:${t}`]) u[`team:${t}`].parent = ref
    }
    // the company's own support agents (scout, smith, verifier, judge, dreamer...) under one node
    const support = Object.values(u).filter(x => x.type === 'Agent' && x.parent === 'workers' && [/skill-scout$/, /skill-smith$/, /ticket-verifier$/, /work-judge$/, /dreamer$/].some(re => re.test(x.name)))
    if (support.length) { u.support = { ref: 'support', type: 'Support', name: 'Support (scout, smith, verifier, judge)', parent: Object.values(u).find(x => x.type === 'Super agent' && !x.parent)?.ref ?? null, agents: support.map(x => x.name) }; for (const x of support) x.parent = 'support' }
    for (const a of s.agents.filter(x => (x.kind ?? 'super') === 'super')) if (u[`sa:${a.id}`]) u[`sa:${a.id}`].leader = a.id
    if (u.ceo) u.ceo.leader = 'coo'
    for (const d of c.departments) if (u[`dep:${d.id}`]) u[`dep:${d.id}`].leader = `dept-${d.id}`
    return u
  }

  // ---------------------------------------------------------------- scores
  /** Score every unit. Cached for 60 s (the dashboard asks often). */
  scores({ fresh = false } = {}) {
    if (!fresh && this.cache && Date.now() - this.cache.at < 60_000) return this.cache.v
    const u = this.units()
    const s = this.sa.store.read()
    const c = this.sa.co.read()
    const gr = this.g.read()
    const rows = turns(this.sa)
    const since = t => Date.now() - new Date(t).getTime()
    const keyOf = x => (x.type === 'Agent' ? x.name : x.ref)
    const quality = x => { const xs = gr.scores.filter(r => r.agent === keyOf(x)).slice(-20); return xs.length ? { v: mean(xs.map(r => r.value)), n: xs.length, detail: `${xs.length} checked or judged task${xs.length === 1 ? '' : 's'}` } : null }
    const reliability = x => { const mine = rows.filter(r => x.agents.includes(r.agent) && Date.now() - new Date(r.s) < 14 * DAY); const done = mine.filter(r => r.status === 'completed').length, failed = mine.filter(r => r.status === 'failed').length; return done + failed >= 3 ? { v: done / (done + failed), n: done + failed, detail: `${done} of ${done + failed} runs completed (14 days)`, soft: true } : null }
    const gaps = x => { const who = x.type === 'Agent' ? [x.name] : x.type === 'Super team' ? [x.id, x.ref] : x.type === 'Team' ? [x.name, x.ref] : [x.lead, x.ref].filter(Boolean); const n = gr.ledger.filter(g => who.includes(g.who) && since(g.ts) < 14 * DAY).length; return { v: Math.max(0, 1 - n / 5), n: 1, detail: `${n} gap${n === 1 ? '' : 's'} named in reviews`, soft: true } }
    const leaderOf = x => s.agents.find(a => a.id === x.leader)
    const delivery = x => { const id = x.leader; if (!id) return null; const tk = s.tickets.filter(t => t.owner === id && t.status === 'ended' && since(t.endedAt ?? t.createdAt) < 30 * DAY); if (!tk.length) return null; const val = t => t.outcome === 'completed' ? ((t.reviews ?? []).some(r => r.kind === 'accepted') ? 0.7 : Math.max(0.5, 1 - 0.2 * (t.verifyFails ?? 0))) : t.outcome === 'stopped' && (t.note ?? '').includes('Duplicate') ? 0.6 : 0.2; return { v: mean(tk.map(val)), n: tk.length, detail: `${tk.filter(t => t.outcome === 'completed').length} of ${tk.length} tickets delivered (30 days)` } }
    const plan = x => { const a = leaderOf(x); const todo = a?.plan?.todo ?? []; if (todo.length < 2) return null; const done = todo.filter(t => t.status === 'done').length, doing = todo.filter(t => t.status === 'doing').length, blocked = todo.filter(t => t.status === 'blocked').length; return { v: Math.max(0, Math.min(1, 0.5 + (done + 0.5 * doing - blocked) / (2 * todo.length))), n: todo.length, detail: `${done} done, ${doing} doing, ${blocked} blocked of ${todo.length}` } }
    const initiatives = x => { const dep = x.ref.slice(4); const is = c.initiatives.filter(i => i.department === dep && since(i.history?.at(-1)?.ts ?? i.createdAt) < 30 * DAY); if (!is.length) return null; const val = i => i.stage === P.gatedStage ? 1 : i.stage === 'killed' ? ((i.history ?? []).length >= 4 ? 0.45 : 0.25) : Math.min(1, 0.35 + (i.confidence ?? 0.2)); return { v: mean(is.map(val)), n: is.length, detail: `${is.length} initiative${is.length === 1 ? '' : 's'}: ${is.filter(i => i.stage === P.gatedStage).length} passed the gate, ${is.filter(i => i.stage === 'killed').length} killed` } }
    const out = {}
    const kids = ref => Object.values(u).filter(x => x.parent === ref)
    const score = ref => {
      if (out[ref]) return out[ref]
      const x = u[ref]
      out[ref] = { ref, score: null } // cycle guard
      const cs = kids(ref).map(k => score(k.ref)).filter(k => k.score != null)
      const children = cs.length ? { v: mean(cs.map(k => k.score / 100)), n: cs.length, detail: `${cs.length} unit${cs.length === 1 ? '' : 's'} below it` } : null
      const sig = { quality: quality(x), reliability: reliability(x), gaps: gaps(x), children, delivery: delivery(x), plan: plan(x), initiatives: x.type === 'Department' ? initiatives(x) : null }
      const w = WEIGHTS[x.type] ?? WEIGHTS.Agent
      const comps = Object.entries(w).map(([k, wt]) => ({ key: k, label: LABEL[k], weight: wt, ...(sig[k] ?? {}), has: !!sig[k] }))
      const hard = comps.filter(cm => cm.has && !cm.soft)
      let total = null
      if (hard.length) { const use = comps.filter(cm => cm.has); const ws = use.reduce((n, cm) => n + cm.weight, 0); total = 100 * use.reduce((n, cm) => n + cm.weight * cm.v, 0) / ws }
      const basis = hard.reduce((n, cm) => n + (cm.key === 'children' ? 0 : cm.n), 0)
      out[ref] = { ref, type: x.type, name: x.name, parent: x.parent, score: r1(total), basis, components: comps.map(cm => ({ key: cm.key, label: cm.label, weight: cm.weight, value: cm.has ? r1(cm.v * 100) : null, detail: cm.detail ?? 'no data yet' })) }
      return out[ref]
    }
    for (const ref of Object.keys(u)) score(ref)
    // trend: against the score about a day ago, and the open improvement plan
    for (const o of Object.values(out)) {
      const h = gr.perf.history[o.ref] ?? []
      const old = h.filter(p => since(p.ts) >= 20 * HOUR).at(-1) ?? h[0]
      o.trend = o.score != null && old?.score != null ? o.score - old.score : null
      const pl = gr.perf.plans.filter(p => p.ref === o.ref).at(-1)
      o.plan = pl ? { status: pl.status, remedy: pl.remedy, at: pl.at } : null
      o.low = o.score != null && o.score < this.settings().low
    }
    const v = { units: out, order: Object.keys(u) }
    this.cache = { at: Date.now(), v }
    return v
  }

  /** The tree for the dashboard: nested, each node with its score. */
  tree() {
    const { units } = this.scores()
    const kids = ref => Object.values(units).filter(x => x.parent === ref).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
    const order = x => ['Super agent', 'COO', 'Department', 'Super team', 'Team', 'Assurance', 'Builders', 'Support', 'Agent'].indexOf(x.type)
    const node = x => ({ ref: x.ref, type: x.type, name: x.name, score: x.score, basis: x.basis, trend: x.trend, low: x.low, plan: x.plan, children: kids(x.ref).map(node) })
    return Object.values(units).filter(x => !x.parent || !units[x.parent]).map(node)
  }

  // ---------------------------------------------------------------- one unit, for the popup
  detail(ref) {
    const { units } = this.scores()
    const o = units[ref]
    if (!o) throw new Error('no such unit')
    const u = this.units()[ref]
    const s = this.sa.store.read()
    const c = this.sa.co.read()
    const gr = this.g.read()
    const key = o.type === 'Agent' ? o.name : ref
    const tasks = []
    for (const r of gr.scores.filter(x => x.agent === key).slice(-15)) tasks.push({ ts: r.ts, task: r.task ?? (r.ticket ? s.tickets.find(t => t.id === r.ticket)?.title : null) ?? r.source, result: r.why ?? '', score: Math.round(r.value * 100), source: r.source })
    if (o.type === 'Agent') {
      for (const t of s.tickets.filter(t => t.worker === o.name).slice(-6)) if (!tasks.some(x => x.task === t.title)) tasks.push({ ts: t.endedAt ?? t.createdAt, task: t.title, result: `${t.outcome ?? t.status}: ${clip(t.assignments.filter(a => a.report).at(-1)?.report?.summary ?? '', 400)}`, score: null, source: 'ticket' })
      for (const r of turns(this.sa).filter(r => r.agent === o.name).slice(0, 8)) tasks.push({ ts: r.e ?? r.s, task: r.label ?? r.run ?? 'run', result: r.status, score: null, source: 'run' })
    }
    if (o.type === 'Team' || o.type === 'Super team') {
      const target = o.type === 'Team' ? o.name : u.id
      for (const j of s.jobs.filter(j => j.target === target || j.target?.startsWith(`${target}@`)).slice(-8)) if (!tasks.some(x => x.ts === j.endedAt)) tasks.push({ ts: j.endedAt ?? j.startedAt, task: clip(j.message, 200), result: `${j.status}: ${clip(j.result ?? '', 400)}`, score: null, source: `asked by ${j.from}` })
    }
    if (o.type === 'Department') {
      for (const i of c.initiatives.filter(i => i.department === ref.slice(4)).slice(-8)) tasks.push({ ts: i.history?.at(-1)?.ts ?? i.createdAt, task: i.title, result: `${i.stage}${i.confidence != null ? `, confidence ${Math.round(i.confidence * 100)}%` : ''}: ${clip(i.note ?? '', 400)}`, score: null, source: 'initiative' })
    }
    if (u.leader) {
      for (const t of s.tickets.filter(t => t.owner === u.leader).slice(-8)) tasks.push({ ts: t.endedAt ?? t.createdAt, task: `Ticket: ${t.title}`, result: `${t.outcome ?? t.status}${t.verifyFails ? ` after ${t.verifyFails} failed check(s)` : ''}`, score: t.outcome === 'completed' ? Math.max(50, 100 - 20 * (t.verifyFails ?? 0)) : t.status === 'ended' ? 20 : null, source: 'ticket owned' })
      for (const e of s.evals.filter(e => e.agent === u.leader && e.note).slice(-6)) tasks.push({ ts: e.endedAt ?? e.startedAt, task: `Decision (${e.lane ?? 'main'})`, result: clip(`${e.note}${e.actions?.length ? ` · did: ${e.actions.map(a => a.tool).join(', ')}` : ''}`, 500), score: null, source: 'decision' })
    }
    tasks.sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
    const who = [o.name, ref, u.id, u.lead].filter(Boolean)
    return {
      ...o, members: u.agents?.length ?? 0, leader: u.leader ?? null,
      history: (gr.perf.history[ref] ?? []).slice(-48),
      tasks: tasks.slice(0, 20),
      gaps: gr.ledger.filter(x => who.includes(x.who)).slice(-8).reverse().map(x => ({ ts: x.ts, category: x.category, gap: x.gap, remedy: x.remedy, source: x.source })),
      plans: gr.perf.plans.filter(p => p.ref === ref).slice(-6).reverse(),
      responsible: this.responsible(ref),
    }
  }

  // ---------------------------------------------------------------- judging work nothing else checks
  /** Score an answer (team, super team, agent, department report). Fire and forget; capped per day. */
  judge({ key, gapWho, task, result, by }) {
    if (!str(result, 50).trim() || /^\(no replies\)|did not answer|failed/.test(String(result).slice(0, 40))) return
    const ok = this.g.update(g => { const d = this.g.day(g); d.judge = (d.judge ?? 0) + 1; return d.judge <= this.settings().maxJudge })
    if (!ok) return
    const { done } = this.sa.forge.engine.startCustom(`judge: ${clip(key, 40)}`, async api => {
      const r = await api.agent(JUDGE, `Score this piece of work from 0 to 100 against the best work in the field for this request. Judge the content, not its length or confidence: is it correct, evidenced, complete for what was asked, and useful? Name capability gaps of whoever did it (who: "${gapWho}").\n\n# The request\n${clip(task, 3000)}\n\n# The work\n${clip(result, 12000)}`, { schema: JUDGED, label: 'judge', full: true, signal: AbortSignal.timeout(8 * 60_000) })
      if (!r?.ok) throw new Error(r?.error ?? 'no verdict')
      return r.structured
    }, { key }, { cwd: P.projectDir, meta: { judge: key } })
    done.then(st => {
      this.sa.co.charge(st.costUsd, `judge ${key}`)
      const v = st.result
      if (st.status !== 'completed' || !v || !Number.isFinite(Number(v.score))) return
      const val = Math.max(0, Math.min(1, Number(v.score) / 100))
      this.g.score(key, val, { source: `judged (${by})`, task, why: v.why })
      // each author's part scores that agent; a department's report also scores its head
      const agents = new Set(this.sa.forge.registry.listAgents().map(a => a.name))
      for (const p of v.parts ?? []) if (agents.has(p.who) && Number.isFinite(Number(p.score))) this.g.score(p.who, Math.max(0, Math.min(1, Number(p.score) / 100)), { source: `judged in ${key} (${by})`, task, why: p.why })
      if (gapWho !== key && agents.has(gapWho)) this.g.score(gapWho, val, { source: `judged (${by})`, task, why: v.why })
      if (v.capabilityGaps?.length) this.g.gaps(v.capabilityGaps, { source: 'work judge', by: JUDGE })
      this.cache = null
    }).catch(e => this.sa.log(`judge ${key}: ${e.message}`))
  }
  /** A finished background ask: who answered decides what is scored. */
  judgeJob(j) {
    if (j.status !== 'done' || this.g.read().perf.judged.includes(j.id)) return
    this.g.update(g => { g.perf.judged.push(j.id) })
    const target = String(j.target ?? '').split('@')[0]
    if (j.kind === 'team') this.judge({ key: `team:${target}`, gapWho: target, task: j.message, result: j.result, by: j.from })
    else if (j.kind === 'super-team') this.judge({ key: `st:${target}`, gapWho: target, task: j.message, result: j.result, by: j.from })
    else if (j.kind === 'agent') this.judge({ key: target, gapWho: target, task: j.message, result: j.result, by: j.from })
  }

  // ---------------------------------------------------------------- who answers for a unit
  responsible(ref) {
    const s = this.sa.store.read()
    const c = this.sa.co.read()
    const live = id => s.agents.find(a => a.id === id && !a.paused)?.id
    const root = s.agents.find(a => !a.parent)?.id
    const coach = live(s.agents.find(a => a.kind === 'dept' && a.dept === 'people')?.id) ?? root
    const deptOf = team => c.departments.find(d => d.teams.includes(team))
    if (ref.startsWith('sa:')) return live(ref.slice(3)) ?? root
    if (ref === 'ceo') return live('coo') ?? root
    if (ref.startsWith('dep:')) return live(`dept-${ref.slice(4)}`) ?? live('coo') ?? root
    if (ref.startsWith('st:')) { const d = c.departments.find(x => x.superTeamId === ref.slice(3)); return (d && live(`dept-${d.id}`)) ?? live('coo') ?? root }
    if (ref.startsWith('team:')) { const d = deptOf(ref.slice(5)); return (d && live(`dept-${d.id}`)) ?? s.agents.find(a => a.reports?.teams?.includes(ref.slice(5)))?.id ?? coach }
    if (ref.startsWith('agent:')) { const name = ref.slice(6); const team = c.departments.flatMap(d => d.teams.map(t => ({ d, t }))).find(x => { try { return this.sa.forge.registry.getTeam(x.t).members.includes(name) } catch { return false } }); return (team && live(`dept-${team.d.id}`)) ?? coach }
    return coach
  }

  // ---------------------------------------------------------------- the reflection layer
  /** Called by the loop: record scores, start reflections for units that stay low, judge improvement plans. */
  tick() {
    const st = this.settings()
    const { units } = this.scores({ fresh: true })
    const t = now()
    this.g.update(g => {
      for (const o of Object.values(units)) {
        if (o.score == null) continue
        const h = (g.perf.history[o.ref] ??= [])
        if (!h.length || Date.now() - new Date(h.at(-1).ts) >= 25 * 60_000) h.push({ ts: t, score: o.score })
        g.perf.history[o.ref] = h.slice(-150)
      }
    })
    if (!st.reflect) return
    const g = this.g.read()
    // improvement plans due for their check
    for (const p of g.perf.plans.filter(p => p.status === 'open' && new Date(p.checkAt) <= new Date())) this.#check(p, units[p.ref])
    // units that stayed low
    for (const o of Object.values(units)) {
      if (!o.low || o.basis < 3) continue
      const h = g.perf.history[o.ref] ?? []
      const window = h.filter(p => Date.now() - new Date(p.ts) <= st.lowHours * HOUR)
      const spans = h.length && Date.now() - new Date(h[0].ts) >= st.lowHours * HOUR
      if (!spans || !window.length || window.some(p => p.score >= st.low)) continue
      if (g.perf.plans.some(p => p.ref === o.ref && p.status === 'open')) continue
      const last = g.perf.reflected[o.ref]
      if (last && Date.now() - new Date(last) < DAY) continue
      this.#reflect(o)
    }
  }

  #reflect(o) {
    const to = this.responsible(o.ref)
    if (!to) return
    this.g.update(g => { g.perf.reflected[o.ref] = now() })
    const d = this.detail(o.ref)
    const worst = d.components.filter(c => c.value != null).sort((a, b) => a.value - b.value).slice(0, 2)
    const failedBefore = d.plans.filter(p => p.status === 'failed')
    this.sa.trigger({ source: 'performance', kind: 'reflection', to, lane: `perf:${o.ref}`, text: [
      `Reflection: ${o.type} "${o.name}" (${o.ref}) has scored ${o.score}/100 for over ${this.settings().lowHours} hours, below the bar of ${this.settings().low}. You answer for it.`,
      `Score parts: ${d.components.map(c => `${c.label} ${c.value ?? 'n/a'} (${c.detail})`).join('; ')}. Weakest: ${worst.map(c => c.label).join(', ') || 'unclear'}.`,
      d.tasks.length ? `Latest work:\n${d.tasks.slice(0, 8).map(x => `- ${String(x.ts).slice(0, 16)} ${x.task}${x.score != null ? ` [${x.score}]` : ''}: ${clip(x.result, 200)}`).join('\n')}` : '',
      d.gaps.length ? `Gaps reviews named:\n${d.gaps.slice(0, 6).map(x => `- ${x.category}: ${x.gap} (suggested ${x.remedy})`).join('\n')}` : '',
      failedBefore.length ? `Earlier plans that did not work: ${failedBefore.map(p => `${p.remedy} (${clip(p.diagnosis, 120)})`).join('; ')}. Choose something different.` : '',
      'Reflect, then act now:',
      '1. Diagnose the root cause from the evidence: the people (missing skill or talent), the structure (wrong team make-up), the workflow (how work is split, reviewed and handed over), the instructions, or the model.',
      '2. Fix it with your tools: restructure the team (restructure_team: add or remove members), restructure the workflow (update_super_team: teams, instructions, rounds, mode), add talent (staff), add skills (request_know_how, update_agent skills), sharpen instructions or raise the model (update_agent).',
      '3. Record it with commit_improvement (unit, diagnosis, remedy, what you did, when to check). Code checks the score then; if it did not improve, it goes one level up.',
    ].filter(Boolean).join('\n\n') })
    this.sa.say({ from: 'system', kind: 'org', text: `${o.type} "${o.name}" has stayed at ${o.score}/100; ${to} was asked to reflect and fix it.` })
  }

  #check(p, o) {
    const after = o?.score ?? null
    const worked = after != null && (after >= this.settings().low || (p.before != null && after >= p.before + 10))
    this.g.update(g => { const x = g.perf.plans.find(y => y.id === p.id); if (x) { x.status = after == null ? 'unmeasured' : worked ? 'worked' : 'failed'; x.after = after; x.checkedAt = now() } })
    if (after == null) return
    if (worked) { this.sa.say({ from: 'system', kind: 'org', text: `Improvement for "${p.name}" worked: ${p.before ?? '–'} -> ${after}/100 (${p.remedy}).` }); return }
    const s = this.sa.store.read()
    const by = s.agents.find(a => a.id === p.by)
    const up = by?.parent ?? s.agents.find(a => !a.parent)?.id
    const fails = this.g.read().perf.plans.filter(x => x.ref === p.ref && x.status === 'failed').length
    if (up && up !== p.by) this.sa.trigger({ source: 'performance', kind: 'reflection-escalated', to: up, lane: `perf:${p.ref}`, text: `Escalated: ${p.by}'s improvement for "${p.name}" (${p.ref}) did not work. Score ${p.before ?? '–'} -> ${after}/100. Diagnosis was: ${p.diagnosis}. Remedy: ${p.remedy}; done: ${p.actions}. Look at it from one level up: a different structure, different people, or a different workflow. Act, then commit_improvement.` })
    this.sa.say({ from: 'system', kind: fails >= 2 ? 'cannot-finish' : 'org', question: fails >= 2, text: `Improvement for "${p.name}" did not work (${p.before ?? '–'} -> ${after}/100, ${p.remedy}).${fails >= 2 ? ` It has failed ${fails} times; this unit may need your decision.` : ' Escalated one level up.'}` })
  }

  // ---------------------------------------------------------------- leaders' tools
  tools() {
    const tool = (name, description, properties, required = Object.keys(properties)) => ({ name, description, inputSchema: { type: 'object', properties, required } })
    return [
      tool('rate_work', 'Score a piece of work you received (0-100) from an agent, team, super team or department, with the reason. It feeds that unit\'s performance score.', { who: { type: 'string', description: 'agent name, team:<name>, st:<super team id> or dep:<department id>' }, task: S, score: { type: 'number' }, why: S }),
      tool('restructure_team', 'Change who is in a team you lead: add agents (existing ones; get new ones with staff first) and remove agents. Use it when a team keeps scoring low because of its make-up.', { team: S, add: { type: 'array', items: S }, remove: { type: 'array', items: S }, why: S }, ['team', 'why']),
      tool('update_super_team', 'Change how a super team you lead works: which teams it has, its instructions to the supervisor, how many review rounds, and the mode (auto: plan, run in parallel, review; handoff: one team at a time).', { id: S, teams: { type: 'array', items: S }, instructions: S, maxRounds: { type: 'number' }, mode: { type: 'string', enum: ['auto', 'handoff'] }, why: S }, ['id', 'why']),
      tool('commit_improvement', 'Record how you are fixing a unit that scores low: your diagnosis, the remedy, what you already did, and when to check. Code compares the score at the check; no improvement escalates one level up.', { unit: { type: 'string', description: 'the unit ref from the reflection, e.g. team:quant-alpha' }, diagnosis: S, remedy: { type: 'string', enum: ['restructure-team', 'restructure-workflow', 'add-talent', 'add-skills', 'change-instructions', 'change-model', 'other'] }, actions: S, checkAfterHours: { type: 'number' } }, ['unit', 'diagnosis', 'remedy', 'actions']),
    ]
  }

  /** The tools above. Returns undefined for any other tool. */
  act(me, name, a) {
    const { registry } = this.sa.forge
    if (name === 'rate_work') {
      const v = Number(a.score)
      if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error('score is 0 to 100')
      if (str(a.why, 600).trim().length < 15) throw new Error('say why')
      this.g.score(String(a.who), v / 100, { source: `rated by ${me.id}`, task: str(a.task, 300), why: str(a.why, 400) })
      this.cache = null
      return `Recorded ${Math.round(v)}/100 for ${a.who}.`
    }
    if (name === 'restructure_team') {
      const team = String(a.team ?? '')
      let t; try { t = registry.getTeam(team) } catch { throw new Error(`no team ${team}`) }
      if (!this.sa.org.canReach(me, 'teams', team)) throw new Error(`${team} is not one of your teams`)
      const add = (a.add ?? []).map(String).filter(n => { try { registry.getAgent(n); return P.isOurs(n) } catch { return false } })
      const remove = new Set((a.remove ?? []).map(String))
      const members = [...new Set([...t.members.filter(m => !remove.has(m)), ...add])]
      if (!members.length) throw new Error('a team needs at least one member')
      if (members.join() === t.members.join()) throw new Error('nothing changes: give add or remove')
      registry.saveTeam({ ...t, members })
      this.g.recordChange(`team:${team}`, null, me.id, `members: +${add.join(', ') || '-'} -${[...remove].join(', ') || '-'}`)
      this.sa.say({ from: me.id, kind: 'org', text: `Restructured team ${team}: ${members.join(', ')}. Why: ${str(a.why, 300)}` })
      return `Team ${team} is now ${members.join(', ')}. Its score is watched from here.`
    }
    if (name === 'update_super_team') {
      const id = String(a.id ?? '')
      if (!this.sa.org.canReach(me, 'superTeams', id)) throw new Error(`${id} is not one of your super teams`)
      const patch = {}
      if (Array.isArray(a.teams) && a.teams.length) patch.teams = a.teams.map(String).filter(n => { try { registry.getTeam(n); return true } catch { return false } }).map(team => ({ team, mode: 'parallel', chat: 'copy' }))
      if (a.instructions) patch.instructions = str(a.instructions, 8000)
      if (a.maxRounds) patch.maxRounds = Math.max(1, Math.min(6, Math.round(Number(a.maxRounds))))
      if (a.mode) patch.mode = a.mode
      if (!Object.keys(patch).length) throw new Error('nothing to change')
      this.sa.co.supers.update(id, patch)
      this.g.recordChange(`st:${id}`, null, me.id, `workflow: ${Object.keys(patch).join(', ')}`)
      this.sa.say({ from: me.id, kind: 'org', text: `Changed super team ${id} (${Object.keys(patch).join(', ')}). Why: ${str(a.why, 300)}` })
      return `Super team ${id} updated: ${Object.keys(patch).join(', ')}.`
    }
    if (name === 'commit_improvement') {
      const ref = String(a.unit ?? '')
      const { units } = this.scores({ fresh: true })
      const o = units[ref]
      if (!o) throw new Error(`no unit ${ref}; use the ref given in the reflection (sa:, dep:, st:, team:, agent:)`)
      if (str(a.diagnosis, 1500).trim().length < 30 || str(a.actions, 1500).trim().length < 20) throw new Error('give the diagnosis and what you did')
      const hours = Math.max(6, Math.min(168, Number(a.checkAfterHours) || 24))
      const id = newId('m')
      this.g.update(g => { g.perf.plans.push({ id, ref, name: o.name, by: me.id, at: now(), diagnosis: str(a.diagnosis, 1500), remedy: a.remedy, actions: str(a.actions, 1500), before: o.score, checkAt: new Date(Date.now() + hours * HOUR).toISOString(), status: 'open' }) })
      this.sa.say({ from: me.id, kind: 'org', text: `Improvement plan for "${o.name}" (${o.score}/100): ${a.remedy}. ${str(a.diagnosis, 300)} Check in ${hours} h.` })
      return `Recorded (${id}). The score is checked in ${hours} hours.`
    }
    return undefined
  }
}

/** The judge agent: stateless, read-only, measured facts only. */
export function judgeDef() {
  return P.baseAgent({ name: JUDGE, description: 'Work judge: scores answers that nothing else checks (team, super team and agent answers, department reports), 0-100, and names capability gaps.', ...P.modelFields(P.models.fast), tools: ['Read', 'Grep', 'Glob'], memory: { mode: 'none' }, tags: [...P.tags, 'company', 'judge'], role: `You judge work. Score it against the best work in its field for what was asked: correct, evidenced, complete, useful. Do not reward length or confidence. Be specific about what is missing, and say which capability of whoever did it fell short.\n\n${P.hardRules}` })
}

/** The leaders' performance tools (rate_work, restructure_team, update_super_team, commit_improvement). */
export const perfTools = () => Perf.prototype.tools()
