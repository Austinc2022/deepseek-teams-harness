/**
 * Super agent: an always-on lead that reacts to events, modelled on DeepSeek's dsh-superagent prototype
 * (Source -> Trigger -> Eval -> Ticket -> Executor -> Channel), pointed at the company charter instead of a repository.
 *
 *   Sources    the owner's messages, the company (build requests, finished CEO cycles), the profile's health checks,
 *              a daily clock, and replies from agents, teams, super teams and other super agents
 *   Trigger    one event, addressed to one super agent
 *   Eval       that super agent reads its pending triggers and acts through tools (it has no other way to act)
 *   Ticket     a unit of work with its own folder; a sandboxed worker with a shell builds it and reports
 *   Channel    the feed: what the owner reads, and where questions wait
 *
 * Super agents form a tree. The root (the CEO) reaches everything; a super agent below it reaches what it leads:
 * super teams, teams, agents, and super agents under it. Each can create more of those within fixed templates.
 *
 * Limits enforced here, not in prompts: workers write only inside their ticket folder (OS sandbox); nothing is
 * accepted except through the company gate; budget, reserve and daily limits stop new work.
 */
import fs from 'node:fs'
import path from 'node:path'
import { toolsMcp } from '../../agent-forge/lib/runner.js'
import { profile as P } from '../../company/lib/profile.js'
import { gatherFacts, gate } from '../../company/lib/cycle.js'
import { Store, now, today, newId, str, clip, slug } from './store.js'
import { Org, seedSuper, WORKER } from './org.js'
import { EngineOps, Changes, NullOps, NullChanges } from './engineops.js'
import { progress, rightNow } from './views.js'
import { recordMetrics } from './board.js'

const WORKDIR = P.projectDir

const S = { type: 'string' }
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
const NOTE = obj({ note: { type: 'string', description: 'what you decided for each trigger and why, in a few lines' } })
const REPORT = obj({
  status: { type: 'string', enum: ['ready', 'progress', 'waiting', 'blocked', 'failed', 'dropped'], description: 'ready: the ticket is delivered. progress: real progress, another turn is needed. waiting: you need an answer (put it in question). blocked: you cannot continue and say why. failed: it does not work. dropped: nothing to do.' },
  summary: { type: 'string', description: 'what you did and found, with numbers; say measured (you ran it), simulated or argued' },
  question: { type: 'string', description: 'one concrete question for a person, or empty' },
  files: { type: 'array', items: S, description: 'the files in your folder that matter, most important first' },
  proposal: obj(P.proposal.schema),
})

const tool = (name, description, properties = {}, required = Object.keys(properties)) => ({ name, description, inputSchema: { type: 'object', properties, required } })
const A = { type: 'array', items: S }
const TOOLS = [
  tool('reply_owner', 'Write to the owner. Use only for a result, a decision you need, or something you cannot finish. Set question true when you need an answer.', { text: S, question: { type: 'boolean' } }, ['text']),
  tool('open_ticket', 'Start work that needs building: a worker gets its own folder with a sandboxed shell (code, assets, builds, data, tests) and reports back to you. Write a brief a newcomer could act on.', { title: S, brief: S, doneWhen: { type: 'string', description: 'what must be true for the ticket to be delivered' }, worker: { type: 'string', description: 'optional builder agent; default is the standard worker' }, build: { type: 'string', description: 'optional id of the company build request this ticket answers' } }, ['title', 'brief', 'doneWhen']),
  tool('message_ticket', 'Send more context or a correction to a ticket. Its worker reads it on the next turn; an ended ticket resumes.', { ticket: S, text: S }),
  tool('read_ticket', 'Read a ticket: its reports, its notes and its file list.', { ticket: S }),
  tool('stop_ticket', 'Stop a ticket.', { ticket: S, reason: S }),
  tool('ask_agent', 'Talk to one agent directly and get its answer now.', { agent: S, message: S }),
  tool('ask_team', 'Give a task to a team. It works in its own chat; the reply reaches you later as a trigger.', { team: S, message: S }),
  tool('ask_super_team', 'Give a task to a super team (a lead over several teams). The reply reaches you later as a trigger.', { id: S, message: S }),
  tool('delegate', 'Hand an area of work to a super agent directly below you. Its answer reaches you later as a trigger.', { to: S, message: S }),
  tool('list_org', 'List the super agents, super teams, teams, agents and skills you can use.'),
  tool('create_agent', 'Create an agent. kind analyst is read-only (judges, researches, reviews); kind builder gets a sandboxed shell in a ticket folder.', { name: S, description: S, role: { type: 'string', description: 'what it does, how, and what a good result looks like' }, kind: { type: 'string', enum: ['analyst', 'builder'] }, model: { type: 'string', enum: P.models.choices }, skills: A, team: { type: 'string', description: 'optional existing team to join' } }, ['name', 'description', 'role', 'kind']),
  tool('update_agent', 'Improve an existing agent: its role text, description, model, effort or skills. The old version is kept.', { name: S, role: S, description: S, model: S, effort: S, skills: A, why: S }, ['name']),
  tool('create_team', 'Create a team from existing agents, or change the members of one of your teams.', { name: S, description: S, members: A }),
  tool('create_super_team', 'Create a super team: one supervisor agent over several teams.', { title: S, supervisor: S, teams: A, instructions: S }, ['title', 'supervisor', 'teams']),
  tool('create_super_agent', 'Create a super agent below you that leads the listed super teams, teams and agents.', { id: S, title: S, mission: S, superTeams: A, teams: A, agents: A }, ['id', 'title', 'mission']),
  tool('find_skills', 'Search GitHub for repositories of agent skills.', { query: S }),
  tool('list_repo_skills', 'List the SKILL.md files in a GitHub repository.', { repo: { type: 'string', description: 'owner/name' } }),
  tool('install_skill', 'Download one SKILL.md from GitHub. The independent auditor reads it first; it is installed only when judged safe.', { repo: S, path: S, name: S }, ['repo', 'path']),
  tool('update_plan', 'Rewrite your plan. The owner reads it to know what you are doing, so keep it current, concrete and short: call it whenever your priorities, to-do list or blockers change. It replaces the previous plan.', {
    focus: { type: 'string', description: 'one or two sentences: what you are working toward right now and why this, not something else' },
    priorities: { type: 'array', description: 'at most 3, most important first', items: { type: 'object', properties: { text: S, why: S }, required: ['text', 'why'] } },
    todo: { type: 'array', description: 'at most 12 concrete items', items: { type: 'object', properties: { text: S, owner: { type: 'string', description: 'who does it: you, a super agent, a team, a ticket id, or the owner' }, status: { type: 'string', enum: ['todo', 'doing', 'blocked', 'done'] }, note: S }, required: ['text', 'owner', 'status'] } },
    blockers: { type: 'array', items: S, description: 'what stops progress now, each with what would remove it' },
    waitingOnOwner: { type: 'array', items: S, description: 'what you need from the owner, or empty' },
  }, ['focus', 'priorities', 'todo']),
  tool('report_milestone', 'Tell the owner a milestone of the goal ladder is reached or lost. Only with evidence the owner can check (a file, a ticket, a number).', { key: { type: 'string', enum: P.milestones.map(m => m.key), description: P.milestones.map(m => `${m.key}: ${m.title}.`).join(' ') }, done: { type: 'boolean' }, evidence: S }),
  tool('submit_engine_change', 'Ask for a finished patch from one of your tickets to be installed into the engine. Code checks it, the independent auditor reads it, then the owner is asked; on Install it is tested on a copy, applied with a backup and rolled back if the engine tests fail. The patch must be a unified diff that applies from inside the engine folder and may only touch quantcore/, config/ and tests/. Submit only what you have reviewed yourself.', { ticket: S, patch: { type: 'string', description: 'file name of the patch inside the ticket folder' }, title: S, summary: { type: 'string', description: 'what it changes and why, in plain words' } }),
  tool('run_company_cycle', 'Run one full CEO cycle of the company (all departments). Slow and costs a few dollars; use when a broad review is worth it.', { focus: S }, []),
]

/** Where an open ticket stands, first match wins (the prototype's table). */
export function stage(t, running) {
  if (t.status === 'ended') return t.stopped ? 'stopped' : `ended:${t.outcome ?? 'completed'}`
  if (running) return 'working'
  if (t.attention) return 'person:answer'
  const last = t.assignments.at(-1)?.report
  const unread = t.inputs.some(i => !i.read)
  const personSince = t.inputs.some(i => !i.read && (i.kind === 'person' || i.kind === 'retry'))
  if (last && (last.status === 'blocked' || last.status === 'failed') && !personSince) return `person:${last.status}`
  if (!t.assignments.length || unread) return 'queued'
  return 'idle'
}

export class SuperAgent {
  constructor(forge, co, { log = () => {} } = {}) {
    this.forge = forge
    this.co = co
    this.log = log
    this.store = new Store(forge.registry.home)
    this.org = new Org(this)
    // the engine runner and the patch installer exist only for profiles that have an engine (quant)
    this.ops = P.hasEngine ? new EngineOps(this) : new NullOps()
    this.changes = P.hasEngine ? new Changes(this) : new NullChanges()
    this.live = { evals: new Map(), tickets: new Map(), jobs: new Map() }
    this.holdReason = null
    this.holdAt = 0
    this.recovered = false
    this.ticking = false
    this.timer = null
  }

  setup(opts) { return seedSuper(this, opts) }

  // ---------------- feed and triggers
  say({ from, text, kind = 'message', ticket, question }) {
    this.store.update(s => { s.feed.push({ id: newId('m'), ts: now(), from, kind, text: str(text, 6000), ...(ticket ? { ticket } : {}), ...(question ? { question: true } : {}) }) })
  }

  trigger(t) {
    return this.store.update(s => {
      if (t.key && s.triggers.some(x => x.key === t.key)) return null
      const rec = { id: newId('t'), ts: now(), status: 'pending', attempts: 0, to: 'ceo', ...t, text: str(t.text, 12000) }
      if (!s.agents.some(a => a.id === rec.to)) rec.to = 'ceo'
      s.triggers.push(rec)
      return rec
    })
  }

  // ---------------- the loop
  /** Start the loop in this process. Only one process runs it at a time; the others queue commands. */
  start() {
    clearInterval(this.timer)
    const run = () => this.tick().catch(e => this.log(`tick: ${e.message}`))
    this.timer = setInterval(run, 15_000)
    this.timer.unref?.()
    setTimeout(run, 2000).unref?.()
    return () => { clearInterval(this.timer); this.store.release() }
  }

  async tick() {
    if (this.ticking || !this.store.claim()) return
    this.ticking = true
    try {
      if (!this.recovered) { this.#recover(); this.recovered = true }
      for (const c of this.store.takeCommands()) { try { this.#command(c) } catch (e) { this.log(`command ${c.type}: ${e.message}`) } }
      const s = this.store.read()
      if (!s.agents.length) return
      await this.ops.ensure().catch(e => this.log(`engine: ${e.message}`))
      this.changes.poll()
      this.#seed(s)
      if (Date.now() - (this.metricsAt ?? 0) > 10 * 60_000) { this.metricsAt = Date.now(); try { recordMetrics(this) } catch (e) { this.log(`metrics: ${e.message}`) } }
      const hold = await this.#hold()
      if (s.enabled && !hold) await this.#pollSources()
      if (hold) return
      this.#startEvals()
      this.#dispatch()
    } finally { this.ticking = false }
  }

  /** Why no new model work may start now, or null. Measured on the provider balance, at most once a minute. */
  async #hold() {
    if (Date.now() - this.holdAt < 60_000) return this.holdReason
    this.holdAt = Date.now()
    let why = null
    try { why = await this.co.holdReason() } catch (e) { why = `budget check failed: ${e.message}` }
    this.holdReason = why
    return why
  }

  /** After a restart: work that was running in the old process is over. Put it back in the queue with a note. */
  #recover() {
    const { engine } = this.forge
    this.store.update(s => {
      for (const e of s.evals) if (e.status === 'running') { e.status = 'interrupted'; e.endedAt = now() }
      for (const t of s.triggers) if (t.status === 'evaluating') t.status = 'pending'
      for (const t of s.tickets) {
        const a = t.assignments.at(-1)
        if (a?.status === 'running' && !engine.active.has(a.runId)) {
          a.status = 'ended'; a.endedAt = now(); a.report = { status: 'progress', summary: 'The host restarted during this turn.' }
          t.inputs.push({ id: newId('i'), ts: now(), kind: 'recovery', text: 'The host restarted while you were working. Check your folder and NOTES.md before repeating anything.' })
        }
      }
      for (const j of s.jobs) if (j.status === 'running') { j.status = 'failed'; j.endedAt = now(); j.error = 'the host restarted' }
      for (const g of s.changes ?? []) if (g.status === 'checking' || g.status === 'installing') { g.status = 'failed'; g.note = 'the host restarted during this step; submit it again' }
    })
    // tickets that named their build request only in the title never closed it
    try {
      const builds = this.co.read().builds
      for (const t of this.store.read().tickets) {
        const id = t.build ?? `${t.title}`.match(/\bbuild\s+(b[0-9a-f]{10})\b/i)?.[1]
        const b = id && builds.find(x => x.id === id)
        if (!b || b.status === 'done' || b.status === 'dropped') continue
        if (!t.build) this.store.update(s => { const y = s.tickets.find(z => z.id === t.id); if (y) y.build = id })
        const want = t.status === 'ended' && t.outcome === 'completed' ? 'done' : t.status === 'open' ? 'accepted' : null
        if (want && b.status !== want) this.co.setBuild(id, want)
      }
    } catch (e) { this.log(`build reconcile: ${e.message}`) }
  }

  /** Once per super agent: ask for a written plan, so the owner always has one to read. */
  #seed(s) {
    for (const a of s.agents) {
      if (a.plan) continue
      this.trigger({ key: `plan:init:${a.id}`, source: 'system', kind: 'write-your-plan', to: a.id, text: `The owner cannot see what you are doing or planning. Write your plan now with update_plan (focus, top priorities with reasons, a concrete to-do list with owners and status, blockers, what you need from the owner) and keep it current from now on.${a.parent ? '' : `\nAlso new for you: (1) submit_engine_change installs a finished, reviewed patch from a ticket into the engine (audit, the owner's approval, tested install with rollback). Until now nothing a worker built ever reached the engine; look at the finished tickets and decide what to submit, one change at a time. (2) The host now starts and keeps the engine processes running when the owner switches that on. (3) report_milestone tells the owner when the gate can score a new strategy and when a strategy is profitable on training data.`}` })
    }
  }

  // ---------------- commands (owner actions, from any process)
  #command(c) {
    if (c.type === 'say') {
      const text = str(c.text, 8000).trim()
      if (!text) return
      const to = this.store.read().agents.some(a => a.id === c.to) ? c.to : 'ceo'
      this.say({ from: 'owner', text, kind: 'message', ...(to !== 'ceo' ? { to } : {}) })
      this.trigger({ source: 'owner', kind: 'message', to, text })
    } else if (c.type === 'ticket-say') {
      const text = str(c.text, 8000).trim()
      if (!text) return
      const title = this.store.update(s => {
        const t = s.tickets.find(x => x.id === c.ticket)
        if (!t) throw new Error('no such ticket')
        t.inputs.push({ id: newId('i'), ts: now(), kind: 'person', text })
        t.attention = null
        if (t.status === 'ended') { t.status = 'open'; t.stopped = false; delete t.outcome }
        return t.title
      })
      this.say({ from: 'owner', text, ticket: c.ticket, kind: 'message' })
      this.log(`owner wrote to ticket ${title}`)
    } else if (c.type === 'stop') {
      this.#stopTicket(c.ticket, 'stopped by the owner')
    } else if (c.type === 'retry') {
      this.store.update(s => {
        const t = s.tickets.find(x => x.id === c.ticket)
        if (!t || t.status !== 'open') throw new Error('this ticket is not open')
        t.inputs.push({ id: newId('i'), ts: now(), kind: 'retry', text: 'The owner asked for another try. Read NOTES.md, look at what failed, and continue.' })
        t.attention = null
        t.extraTurns = (t.extraTurns ?? 0) + 4
      })
    } else if (c.type === 'enabled') {
      this.store.update(s => { s.enabled = c.on === true; if (s.enabled) s.sourceState.since ??= now() })
      this.say({ from: 'system', kind: 'system', text: c.on ? 'Proactive mode on: the super agent now reacts to company and engine events and a daily review.' : 'Proactive mode off: the super agent acts only on your messages.' })
    } else if (c.type === 'settings') {
      this.store.update(s => {
        const num = (k, lo, hi) => { const n = Number(c.patch?.[k]); if (Number.isFinite(n)) s.settings[k] = Math.min(hi, Math.max(lo, Math.round(n))) }
        num('maxWorkers', 1, 6); num('maxEvals', 1, 4); num('assignmentMinutes', 5, 180); num('maxAssignments', 1, 30)
        num('maxTicketsPerDay', 0, 100); num('maxEvalsPerDay', 1, 2000); num('maxSuperAgents', 1, 20); num('maxSkillsPerDay', 0, 50)
        for (const k of ['company', 'engine', 'clock']) if (typeof c.patch?.sources?.[k] === 'boolean') s.settings.sources[k] = c.patch.sources[k]
      })
    } else if (c.type === 'engine') {
      const on = c.action === 'start'
      this.store.update(s => { s.settings.engine = { ...(s.settings.engine ?? {}), autostart: on } })
      this.ops.checkedAt = 0
      if (!on) this.ops.stop().catch(e => this.log(`engine stop: ${e.message}`))
      this.say({ from: 'system', kind: 'system', text: on ? 'Engine switched on: the host starts the dry-run chain bot, the collector and the paper daemon and restarts them when they stop.' : 'Engine switched off: the chain bot, the collector and the paper daemon are stopped.' })
    }
  }

  #stopTicket(id, reason) {
    const live = this.live.tickets.get(id)
    if (live) { try { this.forge.engine.cancel(live.runId) } catch {} }
    this.store.update(s => {
      const t = s.tickets.find(x => x.id === id)
      if (!t) throw new Error('no such ticket')
      t.status = 'ended'; t.stopped = true; t.outcome = 'stopped'; t.endedAt = now(); t.attention = null; t.note = str(reason, 300)
    })
  }

  // ---------------- sources
  async #pollSources() {
    const s = this.store.read()
    const src = s.settings.sources
    const since = s.sourceState.since ?? now()
    if (src.company) {
      const c = this.co.read()
      for (const b of c.builds) {
        if (b.status !== 'requested') continue
        this.trigger({ key: `build:${b.id}`, source: 'company', kind: 'build-request', text: `The company's ${b.department} department asks for a build (id ${b.id}): ${b.title}\nSpec: ${b.spec}\nExpected value: ${b.expectedValue}\nDecide whether it is worth a ticket now. Pass build: "${b.id}" to open_ticket when you take it.` })
      }
      const last = c.cycles.at(-1)
      if (last && last.status !== 'running' && last.endedAt && last.endedAt > since) {
        this.trigger({ key: `cycle:${last.id}`, source: 'company', kind: 'cycle-finished', text: `A company CEO cycle finished (${last.status}; spend $${last.spendUsd ?? '?'}). Summary: ${last.summary ?? '(none)'}\nBrief: ${last.report ? path.join(this.co.reports, last.report) : '(none)'}\nRead the brief and decide what follows.` })
      }
    }
    if (src.engine && Date.now() - (this.healthAt ?? 0) > 10 * 60_000) {
      this.healthAt = Date.now()
      let h = null
      try { h = P.health ? await P.health(this.co) : null } catch (e) { this.log(`health: ${e.message}`) }
      if (h) {
        const bad = (h.checks ?? []).filter(c => !/: ok\b/.test(c))
        const sig = `${h.status}|${bad.map(b => b.split(' (')[0]).sort().join(',')}`
        const prev = this.store.read().sourceState.health
        if (sig !== prev) {
          this.store.update(x => { x.sourceState.health = sig })
          if (prev !== undefined || h.status !== 'ok') this.trigger({ key: `health:${sig}:${today()}`, source: 'engine', kind: 'health', text: `${P.label} health is now "${h.status}".\n${bad.join('\n') || 'All checks pass.'}\nDecide whether the owner must act or a ticket can fix it.` })
        }
      }
    }
    if (src.clock) {
      this.trigger({ key: `day:${today()}`, source: 'clock', kind: 'daily-review', text: `${P.prompts.dailyReview} (${today()})` })
    }
  }

  // ---------------- eval
  #startEvals() {
    const s = this.store.read()
    if (this.store.day(s).evals >= s.settings.maxEvalsPerDay) return
    for (const me of s.agents) {
      if (this.live.evals.size >= s.settings.maxEvals) break
      if (this.live.evals.has(me.id)) continue
      const mine = s.triggers.filter(t => t.status === 'pending' && t.to === me.id).slice(0, 8)
      if (!mine.length) continue
      this.#eval(me, mine)
    }
  }

  #context(me) {
    const s = this.store.read()
    const c = this.co.read()
    const b = this.co.budget()
    const ch = c.charter
    const tk = s.tickets.filter(t => t.status === 'open' || (t.endedAt ?? '') > new Date(Date.now() - 3 * 86400_000).toISOString())
    return [
      `# Charter\nMission: ${ch.mission}\nScope: ${ch.scope}\nRules:\n${ch.rules.map(r => `- ${r}`).join('\n')}`,
      `# You\nSuper agent "${me.id}" (${me.title}). Above you: ${me.parent ?? 'the owner'}. Below you: ${s.agents.filter(a => a.parent === me.id).map(a => a.id).join(', ') || 'no super agents yet'}.${me.parent ? `\nYou lead: super teams ${me.reports.superTeams.join(', ') || '-'}; teams ${me.reports.teams.join(', ') || '-'}; agents ${me.reports.agents.join(', ') || '-'}.` : '\nYou reach every super team, team and agent (list_org).'}`,
      `# Budget today\nSpent $${b.spentTodayUsd} of $${b.dailyUsd}${this.co.metering === 'balance' ? `; ${P.models.provider} balance $${b.balanceUsd ?? '?'} (reserve $${b.reserveUsd})` : ' (estimated from run costs)'}. Tickets opened today: ${this.store.day(s).tickets} of ${s.settings.maxTicketsPerDay}.`,
      `# Company state\nInitiatives:\n${c.initiatives.slice(-12).map(i => `- [${i.stage}] ${i.title}: ${clip(i.note ?? i.thesis ?? '', 200)}`).join('\n') || '(none)'}\n${P.text.ordersTitle} so far: ${c.orders.length}${c.orders.length ? ` (${c.orders.slice(-5).map(o => o.book).join(', ')})` : ''}. Open build requests: ${c.builds.filter(x => x.status === 'requested').length}. Last CEO brief: ${c.cycles.filter(x => x.report).at(-1)?.report ? path.join(this.co.reports, c.cycles.filter(x => x.report).at(-1).report) : '(none)'}`,
      `# Your plan (the owner reads this; keep it current with update_plan)\n${me.plan ? `Updated ${me.plan.updatedAt.slice(0, 16)}\nFocus: ${me.plan.focus}\nPriorities:\n${me.plan.priorities.map((p, i) => `${i + 1}. ${p.text} (${p.why})`).join('\n')}\nTo do:\n${me.plan.todo.map(t => `- [${t.status}] ${t.text} (${t.owner})${t.note ? `: ${t.note}` : ''}`).join('\n')}\nBlockers: ${me.plan.blockers.join('; ') || '-'}\nWaiting on the owner: ${me.plan.waitingOnOwner.join('; ') || '-'}` : '(none yet: write it with update_plan)'}`,
      this.#goalText(s),
      `# Tickets\n${tk.map(t => `- ${t.id} [${stage(t, this.live.tickets.has(t.id))}] "${t.title}" (owner ${t.owner}; folder ${t.dir})${t.assignments.at(-1)?.report ? `: ${clip(t.assignments.at(-1).report.summary, 300)}` : ''}`).join('\n') || '(none)'}`,
      `# Asked and still running\n${s.jobs.filter(j => j.status === 'running').map(j => `- ${j.kind} ${j.target}: ${clip(j.message, 140)}`).join('\n') || '(nothing)'}`,
      `# Recent messages\n${s.feed.slice(-8).map(m => `- ${m.ts.slice(5, 16)} ${m.from}: ${clip(m.text, 240)}`).join('\n') || '(none)'}`,
    ].join('\n\n')
  }

  #goalText(s) {
    const g = progress(this)
    const e = this.ops.snapshot()
    const ch = (s.changes ?? []).slice(-5)
    return [
      `# Goal ladder (${g.done} of ${g.total} steps)\n${g.steps.map(x => `- [${x.done ? 'x' : ' '}] ${x.title} (${x.how}): ${x.detail}`).join('\n')}`,
      ...(!P.hasEngine ? [] : [`# Engine now\nEngine heartbeat ${e.engineAgeS ?? '?'} s old, collector ${e.collectorAgeS ?? '?'} s old; kept running by the host: ${e.autostart ? 'yes' : 'no (the owner can switch it on)'}.${e.note ? ` Note: ${e.note}.` : ''}\nPaper books: ${e.books.map(b => `${b.name} $${b.equity} (${b.state})`).join(', ') || 'none'}`,
      `# Engine changes\n${ch.map(x => `- ${x.id} [${x.status}] "${x.title}" from ticket ${x.ticket}${x.note ? `: ${clip(x.note, 200)}` : ''}`).join('\n') || '(none submitted yet)'}`]),
    ].join('\n\n')
  }

  #eval(me, triggers) {
    const { engine } = this.forge
    const evalId = newId('e')
    const ids = triggers.map(t => t.id)
    const actions = []
    const prompt = `${this.#context(me)}\n\n# Triggers to handle now\n${triggers.map((t, i) => `## ${i + 1}. ${t.source} / ${t.kind} (${t.ts.slice(0, 16)})\n${t.text}`).join('\n\n')}\n\n# Your job\nHandle each trigger: ignore it, answer it, or start work, using your tools. Read files when you need facts. Call update_plan in every turn in which your priorities, to-do list or blockers change (the owner reads the plan instead of asking you). Then return a short note of what you decided and why, written so the owner can follow it.`
    const { id: runId, done } = engine.startCustom(`super agent: ${me.id}`, async api => {
      const mcp = toolsMcp('super', TOOLS, (name, args) => this.#tool(me, name, args, api, actions))
      const res = await api.agent(me.agent, prompt, { schema: NOTE, label: `eval:${me.id}`, full: true, extraMcp: { super: mcp }, signal: AbortSignal.timeout(30 * 60_000) })
      if (!res?.ok) throw new Error(res?.error ?? 'the super agent gave no answer')
      return { note: str(res.structured?.note ?? res.text, 3000) }
    }, { agent: me.id, triggers: ids.length }, { cwd: WORKDIR, meta: { superAgent: me.id } })
    this.live.evals.set(me.id, runId)
    this.store.update(s => {
      for (const t of s.triggers) if (ids.includes(t.id)) { t.status = 'evaluating'; t.attempts++ }
      s.evals.push({ id: evalId, agent: me.id, runId, triggers: ids, status: 'running', startedAt: now() })
      this.store.day(s).evals++
    })
    done.then(st => {
      this.co.charge(st.costUsd, `super agent ${me.id} decision`)
      const ok = st.status === 'completed'
      const note = ok ? st.result?.note : String(st.error ?? st.status).split('\n')[0]
      const back = []
      this.store.update(s => {
        const e = s.evals.find(x => x.id === evalId)
        if (e) { e.status = st.status; e.endedAt = now(); e.note = str(note, 3000); e.actions = actions.slice(0, 40) }
        for (const t of s.triggers) {
          if (!ids.includes(t.id)) continue
          // tools that ran are not undone, so a failed eval is retried only when it did nothing
          if (ok || actions.length || t.attempts >= 2) { t.status = ok ? 'done' : 'failed'; t.note = str(note, 600); if (t.replyTo) back.push(t) } else t.status = 'pending'
        }
      })
      for (const t of back) this.trigger({ source: 'super-agent', kind: 'reply', to: t.replyTo, text: `Super agent ${me.id} finished what you delegated ("${clip(t.text, 200)}").\nIts note: ${note}` })
      if (!ok && triggers.some(t => t.source === 'owner')) this.say({ from: 'system', kind: 'system', text: `The super agent ${me.id} could not handle your message: ${clip(note, 300)}` })
    }).catch(e => this.log(`eval ${me.id}: ${e.message}`)).finally(() => { this.live.evals.delete(me.id); this.holdAt = 0 })
  }

  async #tool(me, name, a, api, actions) {
    const out = await this.#act(me, name, a, api)
    if (name === 'update_plan') return clip(out, 12000)
    if (name !== 'list_org' && name !== 'read_ticket' && name !== 'find_skills' && name !== 'list_repo_skills') actions.push({ tool: name, arg: clip(a.title ?? a.agent ?? a.team ?? a.id ?? a.to ?? a.name ?? a.ticket ?? a.text ?? '', 80) })
    return clip(out, 12000)
  }

  async #act(me, name, a, api) {
    const { registry, engine } = this.forge
    const org = this.org
    switch (name) {
      case 'reply_owner': this.say({ from: me.id, text: a.text, question: a.question === true }); return 'Sent.'
      case 'open_ticket': return this.#openTicket(me, a)
      case 'message_ticket': {
        this.store.update(s => {
          const t = this.#myTicket(s, me, a.ticket)
          if (t.stopped) throw new Error('this ticket was stopped')
          t.inputs.push({ id: newId('i'), ts: now(), kind: 'lead', from: me.id, text: str(a.text, 8000) })
          if (t.status === 'ended') { t.status = 'open'; delete t.outcome }
        })
        return 'Delivered; the worker reads it on its next turn.'
      }
      case 'read_ticket': { const s = this.store.read(); return JSON.stringify(this.ticketDetail(this.#myTicket(s, me, a.ticket).id), null, 1) }
      case 'stop_ticket': { this.#myTicket(this.store.read(), me, a.ticket); this.#stopTicket(a.ticket, `stopped by ${me.id}: ${a.reason ?? ''}`); return 'Stopped.' }
      case 'ask_agent': {
        const agent = String(a.agent ?? '')
        const def = registry.getAgent(agent)
        if ((def.tags ?? []).includes('super-agent')) throw new Error('that is a super agent or a builder: use delegate or open_ticket')
        if (!org.canReach(me, 'agents', agent)) throw new Error(`${agent} is not one of your agents`)
        const r = await api.agent(agent, `${str(a.message, 12000)}\n\n(Asked by super agent ${me.id}. Answer directly, with your evidence.)`, { label: `ask:${agent}`, full: true, signal: AbortSignal.timeout(12 * 60_000) })
        return r?.ok ? r.text ?? JSON.stringify(r.structured) : `${agent} did not answer: ${r?.error ?? 'no result'}`
      }
      case 'ask_team': {
        const team = String(a.team ?? '')
        registry.getTeam(team)
        if (!org.canReach(me, 'teams', team)) throw new Error(`${team} is not one of your teams`)
        return this.#job(me, 'team', team, str(a.message, 12000))
      }
      case 'ask_super_team': {
        const id = String(a.id ?? '')
        this.co.supers.get(id)
        if (!org.canReach(me, 'superTeams', id)) throw new Error(`${id} is not one of your super teams`)
        return this.#job(me, 'super-team', id, str(a.message, 12000))
      }
      case 'delegate': {
        const child = this.store.read().agents.find(x => x.id === a.to && x.parent === me.id)
        if (!child) throw new Error(`${a.to} is not a super agent directly below you`)
        this.trigger({ source: 'super-agent', kind: 'delegated', to: child.id, replyTo: me.id, text: `From super agent ${me.id} (above you): ${str(a.message, 10000)}` })
        return `Delegated to ${child.id}. Its answer will reach you as a trigger.`
      }
      case 'list_org': return org.list(me)
      case 'create_agent': return org.createAgent(me, a)
      case 'update_agent': return org.updateAgent(me, a)
      case 'create_team': return org.createTeam(me, a)
      case 'create_super_team': return org.createSuperTeam(me, a)
      case 'create_super_agent': return org.createSuperAgent(me, a)
      case 'find_skills': return org.findSkills(a.query)
      case 'list_repo_skills': return org.listRepoSkills(String(a.repo ?? ''))
      case 'install_skill': return org.installSkill(me, a, api)
      case 'update_plan': {
        const list = (v, n) => (Array.isArray(v) ? v.slice(0, n) : [])
        const plan = {
          focus: str(a.focus, 600).trim(),
          priorities: list(a.priorities, 3).map(p => ({ text: str(p?.text, 300), why: str(p?.why, 400) })).filter(p => p.text),
          todo: list(a.todo, 12).map(t => ({ text: str(t?.text, 300), owner: str(t?.owner, 60), status: ['todo', 'doing', 'blocked', 'done'].includes(t?.status) ? t.status : 'todo', note: str(t?.note, 300) })).filter(t => t.text),
          blockers: list(a.blockers, 8).map(b => str(b, 400)).filter(Boolean),
          waitingOnOwner: list(a.waitingOnOwner, 6).map(b => str(b, 400)).filter(Boolean),
          updatedAt: now(),
        }
        if (!plan.focus || !plan.priorities.length) throw new Error('a plan needs a focus and at least one priority')
        this.store.update(s => { const x = s.agents.find(y => y.id === me.id); if (x) { if (x.plan) (x.planHistory ??= []).push({ at: x.plan.updatedAt, focus: x.plan.focus }); x.planHistory = (x.planHistory ?? []).slice(-20); x.plan = plan } })
        return 'Plan saved; the owner sees it.'
      }
      case 'report_milestone': {
        if (me.parent) throw new Error('only the root super agent reports milestones')
        if (!P.milestones.some(m => m.key === a.key)) throw new Error('unknown milestone')
        if (str(a.evidence, 900).trim().length < 20) throw new Error('say what the evidence is and where the owner can check it')
        this.store.update(s => { (s.milestones ??= {})[a.key] = { done: a.done === true, evidence: str(a.evidence, 900).trim(), ts: now(), by: me.id } })
        this.say({ from: me.id, kind: 'milestone', text: `Milestone "${P.milestones.find(m => m.key === a.key).title}": ${a.done === true ? 'reached' : 'not reached'}. ${str(a.evidence, 900)}` })
        return 'Recorded; the goal ladder shows it as reported by you.'
      }
      case 'submit_engine_change': {
        const t = this.#myTicket(this.store.read(), me, a.ticket)
        if (str(a.title, 140).trim().length < 6 || str(a.summary, 3000).trim().length < 60) throw new Error('give a title and a plain-language summary (60+ characters) of what the change does')
        return this.changes.submit(me, t, a)
      }
      case 'run_company_cycle': {
        if (me.parent) throw new Error('only the root super agent runs a company cycle')
        const { cycleId } = await this.co.startCycle({ trigger: 'super-agent', focus: a.focus ? str(a.focus, 4000) : undefined })
        this.store.update(s => { s.sourceState.since ??= now() })
        return `Cycle ${cycleId} started. Its result reaches you as a trigger when proactive mode is on; otherwise read the brief in the company reports folder.`
      }
      default: throw new Error(`unknown tool ${name}`)
    }
  }

  #myTicket(s, me, id) {
    const t = s.tickets.find(x => x.id === id)
    if (!t) throw new Error(`no ticket ${id}`)
    if (me.parent && t.owner !== me.id) throw new Error('that ticket belongs to another super agent')
    return t
  }

  // ---------------- asks that take time (teams, super teams)
  #job(me, kind, target, message) {
    const { chats, engine } = this.forge
    const supers = this.co.supers
    const id = newId('j')
    let work
    if (kind === 'team') {
      let chatId = this.store.read().teamChats[target]
      try { if (chatId) chats.get(chatId) } catch { chatId = null }
      if (!chatId) {
        chatId = chats.create({ title: `Super agent · ${target}`, team: target, mode: 'parallel', cwd: WORKDIR }).id
        this.store.update(s => { s.teamChats[target] = chatId })
      }
      work = chats.postAndWait(chatId, message, { timeoutMs: 40 * 60_000 }).then(r => r.replies.map(x => `## ${x.from}${x.ok ? '' : ' (failed)'}\n${x.text}`).join('\n\n') || '(no replies)')
    } else {
      const { runId } = supers.post(target, message)
      work = (async () => {
        const t0 = Date.now()
        for (;;) {
          const st = engine.getRun(runId)
          if (st.status !== 'running') break
          if (Date.now() - t0 > 100 * 60_000) { engine.cancel(runId); break }
          await new Promise(r => setTimeout(r, 4000))
        }
        this.co.charge(this.co.runCost(runId), `super team ${target}`)
        return supers.get(target).messages.filter(m => m.from === 'supervisor').at(-1)?.text || '(the super team returned no text)'
      })()
    }
    this.store.update(s => { s.jobs.push({ id, kind, target, from: me.id, message: str(message, 2000), status: 'running', startedAt: now() }) })
    this.live.jobs.set(id, true)
    work.then(text => ({ ok: true, text }), e => ({ ok: false, text: e?.message ?? String(e) })).then(r => {
      this.store.update(s => { const j = s.jobs.find(x => x.id === id); if (j) { j.status = r.ok ? 'done' : 'failed'; j.endedAt = now(); j.result = clip(r.text, 4000) } })
      this.trigger({ source: kind, kind: 'reply', to: me.id, text: `${r.ok ? 'Reply' : 'No reply (it failed)'} from ${kind} ${target} to your message "${clip(message, 200)}":\n\n${clip(r.text, 9000)}` })
    }).finally(() => this.live.jobs.delete(id))
    return `Sent to ${kind} ${target}. The reply will reach you as a trigger; do not wait for it in this turn.`
  }

  // ---------------- tickets
  #openTicket(me, a) {
    const s = this.store.read()
    if (this.store.day(s).tickets >= s.settings.maxTicketsPerDay) throw new Error(`the limit of ${s.settings.maxTicketsPerDay} new tickets a day is reached`)
    const title = str(a.title, 140).trim()
    const brief = str(a.brief, 12000).trim()
    if (title.length < 6 || brief.length < 80) throw new Error('a ticket needs a title and a brief a newcomer could act on (80+ characters)')
    let worker = WORKER
    if (a.worker) {
      const def = this.forge.registry.getAgent(String(a.worker))
      if (!(def.tags ?? []).includes('builder')) throw new Error(`${a.worker} is not a builder agent`)
      worker = def.name
    }
    const id = newId('k')
    const short = `${slug(title, 30)}-${id.slice(-4)}`
    const dir = path.join(this.store.work, short)
    fs.mkdirSync(dir, { recursive: true })
    const builds = this.co.read().builds
    const named = a.build ?? `${title} ${brief}`.match(/\bbuild\s+(b[0-9a-f]{10})\b/i)?.[1]
    const build = named && builds.some(b => b.id === named) ? String(named) : undefined
    fs.writeFileSync(path.join(dir, 'TICKET.md'), `# ${title}\n\nTicket ${id}, opened ${now()} by super agent ${me.id}.\n\n## Brief\n${brief}\n\n## Done when\n${str(a.doneWhen, 3000)}\n`)
    if (!fs.existsSync(path.join(dir, 'NOTES.md'))) fs.writeFileSync(path.join(dir, 'NOTES.md'), '# Notes\n\n(nothing yet)\n')
    this.store.update(st => {
      st.tickets.push({ id, short, title, brief, doneWhen: str(a.doneWhen, 3000), owner: me.id, worker, dir, status: 'open', createdAt: now(), inputs: [], assignments: [], attention: null, ...(build ? { build } : {}) })
      this.store.day(st).tickets++
    })
    if (build) { try { this.co.setBuild(build, 'accepted') } catch {} }
    this.say({ from: me.id, kind: 'ticket', ticket: id, text: `Opened ticket "${title}".` })
    return `Ticket ${id} opened; a worker starts shortly. Its report will reach you as a trigger.`
  }

  #dispatch() {
    const s = this.store.read()
    for (const t of s.tickets) {
      if (this.live.tickets.size >= s.settings.maxWorkers) break
      if (t.status !== 'open' || this.live.tickets.has(t.id)) continue
      if (stage(t, false) !== 'queued') continue
      const limit = s.settings.maxAssignments + (t.extraTurns ?? 0)
      if (t.assignments.length >= limit) {
        this.store.update(x => { const y = x.tickets.find(z => z.id === t.id); y.attention = { question: `This ticket used ${y.assignments.length} worker turns without finishing. Retry gives it 4 more; Stop ends it.`, ts: now() } })
        this.say({ from: 'system', kind: 'report', ticket: t.id, question: true, text: `Ticket "${t.title}" used ${t.assignments.length} worker turns without finishing. Retry or stop it.` })
        continue
      }
      this.#assign(t, s)
    }
  }

  #assign(t, s) {
    const { engine } = this.forge
    const aid = newId('a')
    const fresh = t.inputs.filter(i => !i.read)
    const prior = t.assignments.filter(x => x.report).slice(-3)
    const prompt = [
      `# Ticket: ${t.title}`,
      `Your folder (current directory): ${t.dir}\nTurn ${t.assignments.length + 1} on this ticket. Read TICKET.md and NOTES.md first.`,
      `## Brief\n${t.brief}`,
      `## Done when\n${t.doneWhen}`,
      prior.length ? `## Your earlier reports\n${prior.map(x => `- (${x.report.status}) ${clip(x.report.summary, 900)}`).join('\n')}` : '',
      fresh.length ? `## New since your last turn\n${fresh.map(i => `- ${i.kind === 'person' ? 'The owner' : i.kind === 'lead' ? `Your lead (${i.from})` : i.kind}: ${i.text}`).join('\n')}` : '',
      `## Environment\n${P.worker.environment(t)}${P.hasEngine ? '\n- You cannot change the engine yourself. When the ticket needs an engine change, deliver it as one unified diff file in your folder (for example change.patch) that applies with "git apply" from inside the engine folder and touches only quantcore/, config/ and tests/, with the tests that prove it. Your lead submits it; it is audited, the owner approves, and code installs it.' : ''}\n- The company goal: ${this.co.read().charter.mission}`,
      `## Report\nWhen you stop, update NOTES.md, then report in the required form. Use "progress" when you made real progress and need another turn; "ready" only when the done-when holds and you verified it.`,
    ].filter(Boolean).join('\n\n')
    const minutes = s.settings.assignmentMinutes
    const { id: runId, done } = engine.startCustom(`ticket: ${t.short}`, async api => {
      const res = await api.agent(t.worker, prompt, { schema: REPORT, label: `worker:${t.short}`, full: true, cwd: t.dir, signal: AbortSignal.timeout(minutes * 60_000) })
      return { ok: !!res?.ok, report: res?.structured ?? null, error: res?.error ?? null, turns: res?.turns }
    }, { ticket: t.id, title: t.title }, { cwd: t.dir, meta: { superTicket: t.id } })
    this.live.tickets.set(t.id, { runId })
    this.store.update(x => {
      const y = x.tickets.find(z => z.id === t.id)
      for (const i of y.inputs) if (!i.read) { i.read = true; i.assignment = aid }
      y.assignments.push({ id: aid, runId, status: 'running', startedAt: now() })
    })
    done.then(st => { this.co.charge(st.costUsd, `ticket ${t.short}`); return this.#report(t.id, aid, st, minutes) }).catch(e => this.log(`ticket ${t.short}: ${e.message}`)).finally(() => { this.live.tickets.delete(t.id); this.holdAt = 0 })
  }

  #report(ticketId, aid, st, minutes) {
    const r = st.result
    let rep
    if (st.status === 'cancelled') rep = { status: 'blocked', summary: 'The turn was stopped.' }
    else if (r?.report && typeof r.report.status === 'string') rep = { ...r.report, summary: str(r.report.summary, 6000), question: str(r.report.question, 1500).trim(), files: (r.report.files ?? []).slice(0, 20).map(f => str(f, 300)) }
    else if (/abort|timeout|timed out/i.test(String(r?.error ?? st.error ?? ''))) rep = { status: 'progress', summary: `The turn reached its ${minutes}-minute limit before reporting. The work so far is in the folder and NOTES.md.` }
    else rep = { status: 'failed', summary: `The worker ended without a report: ${clip(String(r?.error ?? st.error ?? st.status).split('\n')[0], 400)}` }
    const proposal = P.proposal.has(rep.proposal) ? rep.proposal : null
    delete rep.proposal
    let t
    this.store.update(s => {
      t = s.tickets.find(x => x.id === ticketId)
      const a = t?.assignments.find(x => x.id === aid)
      if (!t || !a) return
      a.status = 'ended'; a.endedAt = now(); a.report = rep
      if (t.status !== 'open') return // stopped while working
      const unread = t.inputs.some(i => !i.read)
      if (rep.status === 'ready' && !unread) { t.status = 'ended'; t.outcome = 'completed'; t.endedAt = now() }
      else if (rep.status === 'dropped') { t.status = 'ended'; t.outcome = 'dropped'; t.endedAt = now() }
      else if (rep.status === 'progress') t.inputs.push({ id: newId('i'), ts: now(), kind: 'continue', text: 'Continue from NOTES.md.' })
      if (rep.question && rep.status !== 'ready') t.attention = { question: rep.question, ts: now() }
      if (proposal) t.proposal = { ...proposal, status: 'queued' }
    })
    if (!t) return
    if (rep.status === 'ready' && t.build && t.status === 'ended') { try { this.co.setBuild(t.build, 'done') } catch {} }
    if (rep.status !== 'progress') {
      this.say({ from: 'worker', kind: 'report', ticket: t.id, question: !!t.attention, text: `Ticket "${t.title}" — ${rep.status}. ${clip(rep.summary, 1200)}${rep.question ? `\nQuestion: ${rep.question}` : ''}` })
      this.trigger({ source: 'ticket', kind: 'report', to: t.owner, ticket: t.id, text: `Worker report on ticket ${t.id} "${t.title}": ${rep.status}.\n${clip(rep.summary, 4000)}${rep.question ? `\nIts question (the owner sees it too): ${rep.question}` : ''}\nFiles: ${(rep.files ?? []).join(', ') || '-'}\nFolder: ${t.dir}${proposal ? '\nIt sent a proposal to the gate; the result will reach you.' : ''}\nDecide what follows: nothing, a follow-up ticket, a review by an agent or team, or a short result for the owner.` })
    }
    if (proposal) this.#gate(t, proposal)
  }

  /** A worker's proposal goes through the company gate (the profile's checks and the audit). Code only. */
  #gate(t, p) {
    const s = this.store.read()
    const charter = this.co.read().charter
    const setP = fn => this.store.update(x => { const y = x.tickets.find(z => z.id === t.id); if (y?.proposal) fn(y.proposal) })
    if (this.store.day(s).gates >= charter.gate.maxProposalsPerCycle) {
      setP(q => { q.status = 'not-run'; q.note = `the limit of ${charter.gate.maxProposalsPerCycle} gate runs a day is reached` })
      this.trigger({ source: 'gate', kind: 'gate', to: t.owner, ticket: t.id, text: `The proposal "${p.name}" from ticket ${t.id} was not sent to the gate: the limit of ${charter.gate.maxProposalsPerCycle} gate runs a day is reached (raise it in the charter). Message the ticket tomorrow to resubmit if it is still the best candidate.` })
      return
    }
    this.store.update(x => { this.store.day(x).gates++ })
    setP(q => { q.status = 'running' })
    const { done } = this.forge.engine.startCustom(`gate: ${slug(p.name, 40)}`, async api => {
      const facts = gatherFacts(this.co, api.log)
      return gate(this.co, api, { ...p, initiativeId: null, department: 'super-agent' }, { cycleId: t.id, charter, facts })
    }, { ticket: t.id, proposal: p.name }, { cwd: WORKDIR, meta: { superGate: t.id } })
    done.then(st => {
      this.co.charge(st.costUsd, `gate ${p.name}`)
      const g = st.result
      const text = g ? (g.passed ? g.order.status === 'awaiting-owner' ? `PASSED the gate (${P.text.scoreLabel} ${g.order.pImprove}, required ${g.order.required}). Nothing has started: the owner has been asked to approve ${g.order.book} (see "Needs you").` : `PASSED. ${P.text.orderNoun}: ${g.order.book} (${P.text.scoreLabel} ${g.order.pImprove}, required ${g.order.required}).` : `failed: ${g.reasons.join('; ')}`) : `the gate run ${st.status}: ${String(st.error ?? '').split('\n')[0]}`
      setP(q => { q.status = g?.passed ? 'passed' : 'failed'; q.note = clip(text, 600) })
      this.say({ from: 'gate', kind: 'gate', ticket: t.id, text: `Gate result for "${p.name}" (ticket "${t.title}"): ${text}` })
      this.trigger({ source: 'gate', kind: 'gate', to: t.owner, ticket: t.id, text: `Gate result for proposal "${p.name}" from ticket ${t.id}: ${text}` })
    }).catch(e => this.log(`gate ${p.name}: ${e.message}`))
  }

  // ---------------- views
  overview() {
    const s = this.store.read()
    const holder = this.store.holder()
    const tickets = s.tickets.slice(-120).reverse().map(t => {
      const last = t.assignments.at(-1)
      let lastTool = null
      if (this.live.tickets.has(t.id) || last?.status === 'running') { try { const ag = this.forge.engine.getRun(last.runId).agents?.at(-1); lastTool = ag ? { tools: ag.tools, last: ag.lastTool } : null } catch {} }
      const running = last?.status === 'running' && (holder ? true : false)
      return {
        id: t.id, short: t.short, title: t.title, owner: t.owner, worker: t.worker, status: t.status, stage: stage(t, running), createdAt: t.createdAt, endedAt: t.endedAt,
        turns: t.assignments.length, attention: t.attention, build: t.build, proposal: t.proposal ? { name: t.proposal.name, status: t.proposal.status, note: t.proposal.note } : null,
        summary: t.assignments.filter(a => a.report).at(-1)?.report.summary ?? null, reportStatus: t.assignments.filter(a => a.report).at(-1)?.report.status ?? null,
        runId: last?.runId ?? null, activity: lastTool, unread: t.inputs.filter(i => !i.read).length,
      }
    })
    const busy = new Set(s.evals.filter(e => e.status === 'running').map(e => e.agent))
    return {
      setUp: s.agents.length > 0, enabled: s.enabled, hold: this.holdReason, loop: holder ? { pid: holder.pid, mine: holder.mine } : null,
      settings: s.settings, today: this.store.day(s),
      agents: s.agents.map(a => ({ ...a, busy: busy.has(a.id), pending: s.triggers.filter(t => t.to === a.id && t.status === 'pending').length })),
      tickets,
      needsYou: tickets.filter(t => t.stage.startsWith('person:')),
      feed: s.feed.slice(-80).reverse(),
      jobs: s.jobs.slice(-20).reverse(),
      evals: s.evals.slice(-15).reverse(),
      progress: progress(this), now: rightNow(this), engine: this.ops.snapshot(),
      changes: (s.changes ?? []).slice(-12).reverse().map(g => ({ id: g.id, ts: g.ts, status: g.status, title: g.title, ticket: g.ticket, by: g.by, files: g.files, note: g.note, audit: g.audit, risk: g.risk })),
      milestones: s.milestones ?? {},
      triggers: s.triggers.slice(-40).reverse().map(t => ({ id: t.id, ts: t.ts, source: t.source, kind: t.kind, to: t.to, status: t.status, text: clip(t.text, 300), note: t.note })),
      updatedAt: s.updatedAt,
    }
  }

  ticketDetail(id) {
    const t = this.store.read().tickets.find(x => x.id === id)
    if (!t) throw new Error('no such ticket')
    const files = []
    const walk = (dir, rel) => {
      let names
      try { names = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const n of names) {
        if (files.length >= 200) return
        if (['.venv', 'venv', '__pycache__', 'node_modules', '.git'].includes(n.name)) continue
        const r = rel ? `${rel}/${n.name}` : n.name
        if (n.isDirectory()) walk(path.join(dir, n.name), r)
        else if (n.isFile()) { try { files.push({ path: r, bytes: fs.statSync(path.join(dir, n.name)).size }) } catch {} }
      }
    }
    walk(t.dir, '')
    let notes = ''
    try { notes = clip(fs.readFileSync(path.join(t.dir, 'NOTES.md'), 'utf8'), 8000) } catch {}
    return { ...t, stage: stage(t, t.assignments.at(-1)?.status === 'running'), files, notes }
  }

  ticketFile(id, rel) {
    const t = this.store.read().tickets.find(x => x.id === id)
    if (!t) throw new Error('no such ticket')
    const full = path.resolve(t.dir, String(rel))
    if (!full.startsWith(t.dir + path.sep)) throw new Error('path escapes the ticket folder')
    const st = fs.statSync(full)
    if (st.size > 400_000) return `(file is ${st.size} bytes; open it from ${full})`
    return fs.readFileSync(full, 'utf8')
  }
}

const KEY = Symbol.for('super-agent.shared')
/** One SuperAgent per process. */
export function superAgent(forge, co, opts) {
  return (globalThis[KEY] ??= new SuperAgent(forge, co, opts))
}
