/**
 * Company: one COO agent over department leads, each running several agent teams (a super team), working
 * toward one written goal (the charter) inside a daily budget.
 *
 * This file is the store and the rules. State lives in forge/company/ (git-ignored):
 *   company.json     charter, departments, initiatives, decisions, hires, orders, cycles, day accounts
 *   ledger.jsonl     append-only spend entries
 *   reports/         one COO brief per cycle
 *
 * What agents may never do is enforced here and in cycle.js, in code, not in prompts:
 *   - an initiative reaches the profile's gated stage only through the profile's gate (checks in code + audit);
 *   - nothing here publishes, sells or spends: that is a human decision;
 *   - a cycle does not start when the day's budget (or, with balance metering, the provider balance) would be exceeded.
 * What the company is (organisation, rules, stages, facts, gate) comes from the active profile (profiles/).
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, now, today, newId, round, str } from './paths.js'
import { profile as P, PROFILE_ID } from './profile.js'
import { providerBalance } from '../../agent-forge/lib/providers.js'
import { runCycle, enroll } from './cycle.js'
import { seed } from './setup.js'

export const STAGES = P.stages
export const AGENT_STAGES = P.agentStages
export { ROOT, today, newId }

/** The active profile's charter (profiles/<id>.js); the owner edits it on the Company page. */
export const DEFAULT_CHARTER = {
  hiring: { mode: 'auto', maxPerDay: 3, maxAgents: 40 }, // auto | observe (ask the owner) | off
  // high: the company decides everything that is not owner-only, and asks at most maxQuestionsPerDay owner-only
  // questions, one at a time. ask: every question goes to the owner (docs/SUPER-AGENT-AUTONOMY.md).
  autonomy: { level: 'high', maxQuestionsPerDay: 1 },
  execution: { ownerApproval: false }, // true: a proposal that passed the gate is held until the owner says Start (the quant profile turns it on)
  autopilot: { enabled: false, everyHours: 6 },
  ...P.charter,
  models: { lead: P.models.lead, worker: P.models.worker, auditor: P.models.auditor },
}

export class Company {
  constructor(forge, supers, { log = () => {} } = {}) {
    this.forge = forge
    this.supers = supers
    this.log = log
    this.dir = path.join(forge.registry.home, 'company')
    this.file = path.join(this.dir, 'company.json')
    this.ledgerFile = path.join(this.dir, 'ledger.jsonl')
    this.reports = path.join(this.dir, 'reports')
    fs.mkdirSync(this.reports, { recursive: true })
    this.live = null // { cycleId, runId, cancel }
    this.timer = null
    this.profile = P
    /** balance: spend = drop of the provider balance (DeepSeek). runs: spend = cost the runs report (Claude subscription, notional). */
    this.metering = P.models.provider === 'deepseek' ? 'balance' : 'runs'
  }

  // ---------------- state
  read() {
    let s
    try { s = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { s = {} }
    s.charter = { ...DEFAULT_CHARTER, ...(s.charter ?? {}) }
    for (const k of ['northStar', 'budget', 'gate', 'hiring', 'autonomy', 'execution', 'autopilot', 'models']) s.charter[k] = { ...DEFAULT_CHARTER[k], ...(s.charter[k] ?? {}) }
    for (const k of ['departments', 'initiatives', 'decisions', 'hires', 'orders', 'cycles', 'builds']) s[k] ??= []
    s.days ??= {}
    return s
  }

  /** Read, change, write (atomic rename). Returns what fn returns. */
  update(fn) {
    const s = this.read()
    const out = fn(s)
    s.updatedAt = now()
    const tmp = `${this.file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2))
    fs.renameSync(tmp, this.file)
    return out
  }

  // ---------------- budget
  /** Record the provider balance now; a drop since the last reading is model spend of the current day. */
  async meter(note) {
    if (this.metering !== 'balance') return { balanceUsd: null, ...this.budget() }
    const bal = await providerBalance(P.models.provider)
    if (!bal) return { balanceUsd: null, ...this.budget() }
    const date = today()
    let spent = 0
    this.update(s => {
      const prev = s.lastBalanceUsd
      const day = (s.days[date] ??= { startBalanceUsd: bal.usd, modelUsd: 0, claudeEstUsd: 0, cycles: 0 })
      if (typeof prev === 'number' && prev > bal.usd) { spent = round(prev - bal.usd); day.modelUsd = round(day.modelUsd + spent) }
      s.lastBalanceUsd = bal.usd
      s.lastBalanceAt = now()
    })
    if (spent > 0) this.ledger({ kind: 'model', provider: P.models.provider, usd: spent, note: note ?? 'balance change' })
    return { balanceUsd: bal.usd, ...this.budget() }
  }

  budget() {
    const s = this.read()
    const day = s.days[today()] ?? { modelUsd: 0, claudeEstUsd: 0, cycles: 0 }
    const b = s.charter.budget
    return {
      date: today(), dailyUsd: b.dailyUsd, cycleUsd: b.cycleUsd, reserveUsd: b.reserveUsd,
      spentTodayUsd: day.modelUsd, claudeEstTodayUsd: day.claudeEstUsd, cyclesToday: day.cycles,
      remainingTodayUsd: round(Math.max(0, b.dailyUsd - day.modelUsd)),
      balanceUsd: s.lastBalanceUsd ?? null, balanceAt: s.lastBalanceAt ?? null,
    }
  }

  /** Run metering: add the cost a finished run reported to today's spend. */
  charge(usd, note, extra = {}) {
    if (this.metering !== 'runs' || !(usd > 0)) return
    const date = today()
    this.update(s => {
      const day = (s.days[date] ??= { startBalanceUsd: null, modelUsd: 0, claudeEstUsd: 0, cycles: 0 })
      day.modelUsd = round(day.modelUsd + usd)
      day.claudeEstUsd = round((day.claudeEstUsd ?? 0) + usd)
    })
    this.ledger({ kind: 'model', provider: P.models.provider, usd: round(usd), note, ...extra })
  }

  runCost(runId) { try { return this.forge.engine.getRun(runId).costUsd ?? 0 } catch { return 0 } }

  /** What a cycle has spent so far: its own run plus its departments' super-team runs. */
  async cycleSpend(cycleId) {
    const c = this.read().cycles.find(x => x.id === cycleId)
    if (!c) return 0
    if (this.metering === 'balance') {
      const m = await this.meter(`cycle ${cycleId}`)
      return typeof c.startBalanceUsd === 'number' && m.balanceUsd != null ? Math.max(0, c.startBalanceUsd - m.balanceUsd) : 0
    }
    return [c.runId, ...(c.subRuns ?? []).map(r => r.runId)].reduce((n, id) => n + this.runCost(id), 0)
  }

  /** Why no new model work may start now, or null (shared by cycles and the super agent). */
  async holdReason() {
    const m = await this.meter('budget check')
    if (this.metering === 'balance') {
      if (m.balanceUsd == null) return `the ${P.models.provider} balance cannot be read (check the API key in .dsh-home/.env and the network)`
      if (m.balanceUsd - m.reserveUsd < 0.5) return `the ${P.models.provider} balance ($${m.balanceUsd}) is at the reserve ($${m.reserveUsd}); top up or lower the reserve`
    }
    if (m.remainingTodayUsd <= 0) return `today's budget ($${m.dailyUsd}) is spent`
    if (fs.existsSync(path.join(this.dir, 'PAUSED'))) return 'paused (delete forge/company/PAUSED to resume)'
    return null
  }

  ledger(entry) {
    fs.appendFileSync(this.ledgerFile, JSON.stringify({ ts: now(), date: today(), ...entry }) + '\n')
  }

  ledgerRead(limit = 200) {
    try { return fs.readFileSync(this.ledgerFile, 'utf8').trim().split('\n').filter(Boolean).slice(-limit).map(l => JSON.parse(l)) } catch { return [] }
  }

  /** Why a cycle may not start now, or null. */
  async blocked() {
    const s = this.read()
    if (!s.departments.length) return 'the company is not set up yet (run setup)'
    if (s.profile && s.profile !== PROFILE_ID) return `the company was set up with profile "${s.profile}" but "${PROFILE_ID}" is active; run setup again or select "${s.profile}"`
    return this.holdReason()
  }

  // ---------------- setup
  setup(opts) { return seed(this, opts) }

  // ---------------- cycles
  busy() { return !!this.active() }

  /**
   * The cycle running now, in this process or another one (the CLI and the web server share the state files):
   * { cycleId, runId, state }. A cycle whose run is no longer running is closed here as interrupted.
   */
  active() {
    const { engine } = this.forge
    if (this.live) { try { return { ...this.live, state: engine.getRun(this.live.runId) } } catch { return { ...this.live, state: null } } }
    const c = this.read().cycles.at(-1)
    if (!c || c.status !== 'running') return null
    let st = null
    try { st = engine.getRun(c.runId) } catch {}
    const fresh = Date.now() - new Date(c.startedAt).getTime() < 3 * 3600 * 1000
    if (st?.status === 'running' && fresh) return { cycleId: c.id, runId: c.runId, state: st, elsewhere: true }
    this.update(s => { const x = s.cycles.find(y => y.id === c.id); if (x && x.status === 'running') { x.status = st && st.status !== 'running' ? st.status : 'interrupted'; x.endedAt = st?.endedAt ?? now() } })
    return null
  }

  async startCycle({ trigger = 'manual', focus } = {}) {
    if (this.active()) throw new Error('a cycle is already running')
    const why = await this.blocked()
    if (why) throw new Error(`cannot start a cycle: ${why}`)
    const cycleId = newId('c')
    const startBalance = this.read().lastBalanceUsd
    const { engine } = this.forge
    const { id: runId, done } = engine.startCustom('company: COO cycle', api => runCycle(this, api, { cycleId, focus }), { trigger, focus: focus ?? '' }, { cwd: P.projectDir, meta: { company: cycleId } })
    this.live = { cycleId, runId }
    this.update(s => {
      s.cycles.push({ id: cycleId, runId, trigger, focus: focus ?? null, status: 'running', startedAt: now(), startBalanceUsd: startBalance, subRuns: [] })
      s.cycles = s.cycles.slice(-200)
      const day = (s.days[today()] ??= { startBalanceUsd: startBalance, modelUsd: 0, claudeEstUsd: 0, cycles: 0 })
      day.cycles++
    })
    const finished = done.then(async st => {
      const spend = round(await this.cycleSpend(cycleId))
      this.charge(spend, `cycle ${cycleId}`, { cycle: cycleId })
      this.update(s => {
        const c = s.cycles.find(x => x.id === cycleId)
        if (!c) return
        c.status = st.status
        c.endedAt = now()
        c.error = st.error ? String(st.error).split('\n')[0] : undefined
        c.spendUsd = spend
        c.claudeEstUsd = c.claudeEstUsd ?? 0
        if (st.result?.summary) c.summary = str(st.result.summary, 600)
        if (st.result?.report) c.report = st.result.report
      })
      return st
    }).catch(e => { this.log(`cycle ${cycleId}: ${e.message}`) }).finally(() => { this.live = null })
    return { cycleId, runId, done: finished }
  }

  cancel() {
    if (!this.live) return { ok: false, error: this.active() ? 'this cycle was started by another process (the CLI or the web server); stop it there' : 'no cycle is running' }
    for (const id of [this.live.runId, ...(this.read().cycles.find(c => c.id === this.live.cycleId)?.subRuns ?? []).map(r => r.runId)]) { try { this.forge.engine.cancel(id) } catch {} }
    return { ok: true }
  }

  // ---------------- autopilot
  /** Start (or restart) the timer that runs a cycle every charter.autopilot.everyHours while enabled. */
  schedule() {
    clearInterval(this.timer)
    this.timer = setInterval(() => this.tick().catch(e => this.log(`autopilot: ${e.message}`)), 5 * 60 * 1000)
    this.timer.unref?.()
    return () => clearInterval(this.timer)
  }

  async tick() {
    const s = this.read()
    if (s.decisions.some(x => x.status === 'held')) this.update(x => { this.promoteHeld(x) })
    const ap = s.charter.autopilot
    if (!ap.enabled || this.active()) return
    const last = s.cycles.at(-1)
    const due = !last || Date.now() - new Date(last.startedAt).getTime() >= Math.max(0.25, Number(ap.everyHours) || 6) * 3600 * 1000
    if (!due) return
    const why = await this.blocked()
    if (why) { this.log(`autopilot: skipped, ${why}`); return }
    this.log('autopilot: starting a cycle')
    await this.startCycle({ trigger: 'autopilot' })
  }

  // ---------------- owner actions
  updateCharter(patch = {}) {
    return this.update(s => {
      const c = s.charter
      if (patch.mission !== undefined) c.mission = str(patch.mission, 2000).trim() || c.mission
      if (patch.scope !== undefined) c.scope = str(patch.scope, 500).trim() || c.scope
      if (Array.isArray(patch.rules)) c.rules = patch.rules.map(r => str(r, 600).trim()).filter(Boolean).slice(0, 30)
      const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }
      if (patch.budget) {
        c.budget.dailyUsd = num(patch.budget.dailyUsd, 0, 1_000_000, c.budget.dailyUsd)
        c.budget.cycleUsd = num(patch.budget.cycleUsd, 0.5, 100_000, c.budget.cycleUsd)
        c.budget.reserveUsd = num(patch.budget.reserveUsd, 0, 100_000, c.budget.reserveUsd)
        c.northStar.dailyBudgetUsd = c.budget.dailyUsd
      }
      if (patch.northStar?.targetDailyUsd !== undefined) c.northStar.targetDailyUsd = num(patch.northStar.targetDailyUsd, 1, 1e12, c.northStar.targetDailyUsd)
      if (patch.autopilot) {
        if (patch.autopilot.enabled !== undefined) c.autopilot.enabled = patch.autopilot.enabled === true
        c.autopilot.everyHours = num(patch.autopilot.everyHours, 0.25, 168, c.autopilot.everyHours)
      }
      if (patch.hiring) {
        if (['auto', 'observe', 'off'].includes(patch.hiring.mode)) c.hiring.mode = patch.hiring.mode
        c.hiring.maxPerDay = num(patch.hiring.maxPerDay, 0, 20, c.hiring.maxPerDay)
        c.hiring.maxAgents = num(patch.hiring.maxAgents, 1, 200, c.hiring.maxAgents)
      }
      if (patch.autonomy) {
        if (['high', 'ask'].includes(patch.autonomy.level)) c.autonomy.level = patch.autonomy.level
        c.autonomy.maxQuestionsPerDay = num(patch.autonomy.maxQuestionsPerDay, 0, 20, c.autonomy.maxQuestionsPerDay)
      }
      if (patch.execution?.ownerApproval !== undefined) c.execution.ownerApproval = patch.execution.ownerApproval !== false
      if (patch.gate) {
        c.gate.maxProposalsPerCycle = num(patch.gate.maxProposalsPerCycle, 0, 5, c.gate.maxProposalsPerCycle)
        c.gate.minConfidence = num(patch.gate.minConfidence, 0.5, 0.9999, c.gate.minConfidence)
        if (patch.gate.requireAudit !== undefined) c.gate.requireAudit = patch.gate.requireAudit !== false
      }
      return c
    })
  }

  /**
   * The owner answers a decision. choice is one of its options (or free text); the next cycle sees it.
   * The owner may also overrule something the company decided for them, or answer a held question early.
   */
  decide(id, { choice, note } = {}) {
    return this.update(s => {
      const d = s.decisions.find(x => x.id === id)
      if (!d) throw new Error('no such decision')
      if (d.status === 'answered') throw new Error('this decision is already answered')
      if (d.status === 'auto') { d.overruled = true; d.companyChoice = d.choice }
      d.status = 'answered'
      d.choice = str(choice, 600).trim()
      d.note = str(note, 2000).trim() || undefined
      d.answeredAt = now()
      d.seenByCeo = false
      this.promoteHeld(s)
      return d
    })
  }

  /** Answer a decision; a hire the owner approves is enrolled at once, a refused one is dropped. */
  answer(id, body) {
    const d = this.decide(id, body)
    if (d.kind === 'hire') {
      const rec = this.read().hires.find(h => h.id === d.hire)
      if (rec?.status === 'proposed') {
        if (/^hire$/i.test(d.choice)) enroll(this, rec)
        else this.update(s => { const h = s.hires.find(x => x.id === rec.id); if (h) { h.status = 'declined'; delete h.def } })
      }
    }
    if (d.kind === 'execute') this.#resolveOrder(d.order, /^start$/i.test(d.choice))
    return d
  }

  /**
   * The owner's answer on a proposal the gate held (charter.execution.ownerApproval). What "start" does to the
   * world is the profile's business (profile.resolveOrder, e.g. the quant profile moves the proposal file).
   */
  #resolveOrder(orderId, start) {
    const o = this.read().orders.find(x => x.id === orderId)
    if (!o || o.status !== 'awaiting-owner') return
    if (P.resolveOrder && P.resolveOrder(this, o, start) === false) return
    this.update(s => {
      const x = s.orders.find(y => y.id === orderId)
      x.status = start ? 'active' : 'declined'; x.decidedAt = now()
      const i = s.initiatives.find(y => y.id === x.initiative)
      if (i) {
        delete i.awaitingOwner
        if (start) i.stage = P.gatedStage
        i.history.push({ ts: now(), stage: i.stage, note: start ? `the owner approved: ${x.book} started` : 'the owner declined to start it' })
      }
    })
    this.ledger({ kind: 'order', usd: 0, note: start ? `owner approved: ${P.text.orderNoun} ${o.book}` : `owner declined ${o.book}` })
  }

  /** Mark a build request as accepted, done or dropped (the owner or a developer does the building). */
  setBuild(id, status) {
    if (!['requested', 'accepted', 'done', 'dropped'].includes(status)) throw new Error('bad status')
    return this.update(s => { const b = s.builds.find(x => x.id === id); if (!b) throw new Error('no such build request'); b.status = status; b.statusAt = now(); return b })
  }

  pause(on) {
    const f = path.join(this.dir, 'PAUSED')
    if (on) fs.writeFileSync(f, `paused ${now()}\n`); else fs.rmSync(f, { force: true })
    return { paused: !!on }
  }

  // ---------------- the one door for an agent's question (docs/SUPER-AGENT-AUTONOMY.md)
  /** True when an owner-only question may be shown now: none is waiting and today's limit is not reached. */
  #slotFree(s) {
    const asked = x => !x.kind && x.askedAt
    if (s.decisions.some(x => x.status === 'open' && !x.kind)) return false
    const day = today()
    const local = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
    return s.decisions.filter(x => asked(x) && local(x.askedAt) === day).length < s.charter.autonomy.maxQuestionsPerDay
  }

  /** A held question is asked when the place is free. Called inside update(). */
  promoteHeld(s) {
    const h = s.decisions.find(x => x.status === 'held')
    if (!h || !this.#slotFree(s)) return null
    h.status = 'open'; h.askedAt = now()
    return h
  }

  /**
   * An agent wants the owner to decide something. Called inside update(). Returns { status, rec }:
   *   auto   it is not an owner-only matter: the recommendation is the decision (the owner can overrule it)
   *   open   it is owner-only and is now waiting under "Needs you"
   *   held   it is owner-only but one is already waiting, or today's limit is reached; the company continues
   *          with d.ifNoAnswer and the question is asked when the place is free
   */
  askOwner(s, d) {
    const keys = P.ownerOnly.map(o => o.key)
    const category = keys.includes(d.category) ? d.category : 'internal'
    const base = {
      ...d, category,
      question: str(d.question, 600), options: (d.options ?? []).map(o => str(o, 200)).slice(0, 4),
      recommendation: str(d.recommendation, 300), why: str(d.why, 1200), ifNoAnswer: str(d.ifNoAnswer, 600),
    }
    const same = s.decisions.find(x => x.question === base.question && ['open', 'held'].includes(x.status))
    if (same) return { status: same.status, rec: same }
    if (s.charter.autonomy.level === 'ask') return { status: 'open', rec: this.addDecision(s, { ...base, askedAt: now() }) }
    const push = rec => { s.decisions.push(rec); s.decisions = s.decisions.slice(-300); return rec }
    if (category === 'internal') {
      return { status: 'auto', rec: push({ id: newId('d'), ts: now(), ...base, status: 'auto', choice: base.recommendation || base.options[0] || 'as recommended', decidedAt: now() }) }
    }
    if (this.#slotFree(s)) return { status: 'open', rec: this.addDecision(s, { ...base, askedAt: now() }) }
    return { status: 'held', rec: push({ id: newId('d'), ts: now(), ...base, status: 'held' }) }
  }

  addDecision(s, d) {
    const open = s.decisions.filter(x => x.status === 'open')
    if (open.some(x => x.question === d.question)) return null
    const rec = { id: newId('d'), status: 'open', ts: now(), ...d }
    s.decisions.push(rec)
    s.decisions = s.decisions.slice(-300)
    return rec
  }

  // ---------------- views
  overview() {
    const s = this.read()
    const { registry, engine } = this.forge
    const agent = n => { try { const a = registry.getAgent(n); return { name: a.name, description: a.description, model: a.model, provider: a.provider ?? 'claude-code', hired: (a.tags ?? []).includes('hired') } } catch { return { name: n, missing: true } } }
    const departments = s.departments.map(d => ({
      ...d, leadInfo: agent(d.lead),
      teams: d.teams.map(t => { try { const team = registry.getTeam(t); return { name: t, description: team.description, members: team.members.map(agent) } } catch { return { name: t, missing: true, members: [] } } }),
    }))
    let run = null
    const act = this.active()
    if (act?.state) {
      const brief = st => (st.agents ?? []).map(a => ({ n: a.n, label: a.label, agent: a.agent, model: a.model, status: a.status, lastTool: a.lastTool, tools: a.tools }))
      const agents = brief(act.state)
      // the departments work in their own runs (super teams); show their agents too
      for (const sub of s.cycles.find(c => c.id === act.cycleId)?.subRuns ?? []) { try { agents.push(...brief(engine.getRun(sub.runId)).map(a => ({ ...a, label: `${sub.department} · ${a.label}` }))) } catch {} }
      run = { id: act.state.id, status: act.state.status, phase: act.state.phase, log: (act.state.log ?? []).slice(-14), agents, elsewhere: !!act.elsewhere }
    }
    const dayKeys = Object.keys(s.days).sort().slice(-30)
    return {
      charter: s.charter, ceo: s.ceo ? agent(s.ceo) : null, auditor: s.auditor ? agent(s.auditor) : null,
      budget: this.budget(), days: dayKeys.map(k => ({ date: k, ...s.days[k] })),
      departments, initiatives: s.initiatives, decisions: s.decisions.slice(-80).reverse(), hires: s.hires.slice(-60).reverse(),
      orders: s.orders.slice(-60).reverse(), builds: s.builds.slice(-40).reverse(), cycles: s.cycles.slice(-40).reverse(),
      busy: !!act, run, stages: STAGES, setUp: s.departments.length > 0, updatedAt: s.updatedAt,
      ownerOnly: P.ownerOnly,
      profile: { id: P.id, label: P.label, setUpWith: s.profile ?? null, stageLabels: P.stageLabels, gatedStage: P.gatedStage, metering: this.metering, provider: P.models.provider, projectDir: P.projectDir, text: P.text },
      paused: fs.existsSync(path.join(this.dir, 'PAUSED')),
    }
  }

  report(name) {
    if (!/^[\w.-]+\.md$/.test(name)) throw new Error('bad report name')
    return fs.readFileSync(path.join(this.reports, name), 'utf8')
  }
}

const KEY = Symbol.for('company.shared')
/** One Company per process. */
export function company(forge, supers, opts) {
  return (globalThis[KEY] ??= new Company(forge, supers, opts))
}
