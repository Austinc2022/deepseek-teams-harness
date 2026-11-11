/**
 * Company: one CEO agent over department leads, each running several agent teams (a super team), working
 * toward one written goal (the charter) inside a daily budget.
 *
 * This file is the store and the rules. State lives in forge/company/ (git-ignored):
 *   company.json     charter, departments, initiatives, decisions, hires, orders, cycles, day accounts
 *   ledger.jsonl     append-only spend entries
 *   reports/         one CEO brief per cycle
 *
 * What agents may never do is enforced here and in cycle.js, in code, not in prompts:
 *   - an initiative reaches "paper" only through the deterministic gate (quant validator + audit);
 *   - nothing here places a real order: the engine is paper-only and promotion to real money is a human decision;
 *   - a cycle does not start when the day's budget or the provider balance would be exceeded.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, QUANT, STAGES, AGENT_STAGES, now, today, newId, round, str } from './paths.js'
import { providerBalance } from '../../agent-forge/lib/providers.js'
import { runCycle, enroll } from './cycle.js'
import { seed } from './setup.js'

export { ROOT, QUANT, STAGES, AGENT_STAGES, today, newId }

export const DEFAULT_CHARTER = {
  mission: 'Turn a budget of $1,000 a day into as much crypto trading profit as possible. The north star is $10,000,000 a day.',
  scope: 'Crypto only.',
  northStar: { dailyBudgetUsd: 1000, targetDailyUsd: 10_000_000 },
  rules: [
    'Report honest odds. $1,000 a day to $10,000,000 a day is a 10,000x daily return; say plainly how likely each step is and what evidence supports it.',
    'No execution without evidence: an initiative is executed only after it passes the deterministic gate (holdout validation with trial-adjusted significance, safety invariants) and an independent audit.',
    'No execution without the owner: when a proposal passes the gate the CEO asks the owner, and nothing starts until the owner answers Start.',
    'Every proposal sent to the validator raises the significance bar for all later ones. Submit few, well-argued proposals.',
    'Agents are read-only. They never edit config, place, size or close orders, clear the kill switch, or touch the freqtrade bot on port 8080. Deterministic code does the acting.',
    'Paper first. Real-money trading is not built; asking for it is a decision only the owner can make.',
    'Loss limits in the engine config may only be tightened by proposals. Loosening is the owner\'s decision.',
    'Spend the budget where it raises the probability of profit: research, simulation and rehearsal first. Do not spend to look busy.',
    'One question at a time for the owner, with a recommendation. Stay silent otherwise.',
  ],
  budget: {
    dailyUsd: 1000,      // everything the company may spend in a day (models now; data, servers and capital need the owner)
    cycleUsd: 15,        // a cycle is stopped when its model spend passes this
    reserveUsd: 5,       // never spend the provider balance below this
  },
  gate: {
    maxProposalsPerCycle: 2,
    requireAudit: true,
    minConfidence: 0.95, // floor on P(better); the validator's own trial-adjusted bar applies on top
  },
  hiring: { mode: 'auto', maxPerDay: 3, maxAgents: 40 }, // auto | observe (ask the owner) | off
  execution: { ownerApproval: true }, // a proposal that passed the gate starts only after the owner says Start
  autopilot: { enabled: false, everyHours: 6 },
  models: { lead: 'deepseek-v4-pro', worker: 'deepseek-flash', auditor: 'opus' },
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
  }

  // ---------------- state
  read() {
    let s
    try { s = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { s = {} }
    s.charter = { ...DEFAULT_CHARTER, ...(s.charter ?? {}) }
    for (const k of ['northStar', 'budget', 'gate', 'hiring', 'execution', 'autopilot', 'models']) s.charter[k] = { ...DEFAULT_CHARTER[k], ...(s.charter[k] ?? {}) }
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
    const bal = await providerBalance('deepseek')
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
    if (spent > 0) this.ledger({ kind: 'model', provider: 'deepseek', usd: spent, note: note ?? 'balance change' })
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

  ledger(entry) {
    fs.appendFileSync(this.ledgerFile, JSON.stringify({ ts: now(), date: today(), ...entry }) + '\n')
  }

  ledgerRead(limit = 200) {
    try { return fs.readFileSync(this.ledgerFile, 'utf8').trim().split('\n').filter(Boolean).slice(-limit).map(l => JSON.parse(l)) } catch { return [] }
  }

  /** Why a cycle may not start now, or null. */
  async blocked() {
    const m = await this.meter('before cycle')
    const s = this.read()
    if (!s.departments.length) return 'the company is not set up yet (run setup)'
    if (m.balanceUsd == null) return 'the DeepSeek balance cannot be read (check DEEPSEEK_API_KEY in .dsh-home/.env and the network)'
    if (m.balanceUsd - m.reserveUsd < 0.5) return `the DeepSeek balance ($${m.balanceUsd}) is at the reserve ($${m.reserveUsd}); top up or lower the reserve`
    if (m.remainingTodayUsd <= 0) return `today's budget ($${m.dailyUsd}) is spent`
    if (fs.existsSync(path.join(this.dir, 'PAUSED'))) return 'paused (delete forge/company/PAUSED to resume)'
    return null
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
    const { id: runId, done } = engine.startCustom('company: CEO cycle', api => runCycle(this, api, { cycleId, focus }), { trigger, focus: focus ?? '' }, { cwd: QUANT, meta: { company: cycleId } })
    this.live = { cycleId, runId }
    this.update(s => {
      s.cycles.push({ id: cycleId, runId, trigger, focus: focus ?? null, status: 'running', startedAt: now(), startBalanceUsd: startBalance, subRuns: [] })
      s.cycles = s.cycles.slice(-200)
      const day = (s.days[today()] ??= { startBalanceUsd: startBalance, modelUsd: 0, claudeEstUsd: 0, cycles: 0 })
      day.cycles++
    })
    const finished = done.then(async st => {
      const m = await this.meter(`cycle ${cycleId}`)
      this.update(s => {
        const c = s.cycles.find(x => x.id === cycleId)
        if (!c) return
        c.status = st.status
        c.endedAt = now()
        c.error = st.error ? String(st.error).split('\n')[0] : undefined
        c.spendUsd = typeof c.startBalanceUsd === 'number' && m.balanceUsd != null ? round(Math.max(0, c.startBalanceUsd - m.balanceUsd)) : null
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
      if (patch.execution?.ownerApproval !== undefined) c.execution.ownerApproval = patch.execution.ownerApproval !== false
      if (patch.gate) {
        c.gate.maxProposalsPerCycle = num(patch.gate.maxProposalsPerCycle, 0, 5, c.gate.maxProposalsPerCycle)
        c.gate.minConfidence = num(patch.gate.minConfidence, 0.5, 0.9999, c.gate.minConfidence)
        if (patch.gate.requireAudit !== undefined) c.gate.requireAudit = patch.gate.requireAudit !== false
      }
      return c
    })
  }

  /** The owner answers a decision. choice is one of its options (or free text); the next cycle sees it. */
  decide(id, { choice, note } = {}) {
    return this.update(s => {
      const d = s.decisions.find(x => x.id === id)
      if (!d) throw new Error('no such decision')
      if (d.status !== 'open') throw new Error('this decision is already answered')
      d.status = 'answered'
      d.choice = str(choice, 600).trim()
      d.note = str(note, 2000).trim() || undefined
      d.answeredAt = now()
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

  /** The owner's answer on a verified proposal: Start moves it to proposals/approved/ (the paper daemon runs it). */
  #resolveOrder(orderId, start) {
    const o = this.read().orders.find(x => x.id === orderId)
    if (!o || o.status !== 'awaiting-owner') return
    const held = path.join(QUANT, 'proposals', 'awaiting-owner', o.proposal)
    const dest = start ? path.join(QUANT, 'proposals', 'approved', o.proposal) : path.join(QUANT, 'proposals', 'done', `declined-by-owner-${o.proposal}`)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.renameSync(held, dest)
    this.update(s => {
      const x = s.orders.find(y => y.id === orderId)
      x.status = start ? 'active' : 'declined'; x.decidedAt = now()
      const i = s.initiatives.find(y => y.id === x.initiative)
      if (i) {
        delete i.awaitingOwner
        if (start) i.stage = 'paper'
        i.history.push({ ts: now(), stage: i.stage, note: start ? `the owner approved: paper book ${x.book} started` : 'the owner declined to start it' })
      }
    })
    this.ledger({ kind: 'order', usd: 0, note: start ? `owner approved: paper execution order ${o.book}` : `owner declined ${o.book}` })
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
