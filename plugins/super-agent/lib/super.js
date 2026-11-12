/**
 * Super agent: an always-on lead that reacts to events, modelled on DeepSeek's dsh-superagent prototype
 * (Source -> Trigger -> Eval -> Ticket -> Executor -> Channel), pointed at the company charter instead of a repository.
 *
 *   Sources    the owner's messages, the company (build requests, finished COO cycles), the profile's health checks,
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
import { Growth, GAP } from './growth.js'
import { kindOf, isSuper, rewritePlan, editItems, planText, readyItems, laneOf, workLane, shareOf, wakeReason } from './leaders.js'
import { toolsFor, seedLeaders, companyLeadersOn, companyContext, companyAct, COO_ID } from './company-leaders.js'
import { Desk } from './desk.js'
import { MemoryKeeper } from './dream.js'
import { withMemory } from '../../agent-forge/lib/memctx.js'
import { purposeSlug } from '../../agent-forge/lib/memory.js'
import { purposeOf, recordTicketReport, recordCritique } from '../../company/lib/knowledge-hooks.js'
import { decide as staffDecide, apply as staffApply, teamCandidates, teamInstance } from '../../company/lib/staff.js'
import { agentNameProblem, teamNameProblem } from '../../company/lib/naming.js'

const WORKDIR = P.projectDir

const S = { type: 'string' }
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
/** How every leader works, in every turn (the agents' role files predate parallel work, so it is said here). */
const HOW_YOU_WORK = `# How you work
- You decide: handle each trigger by ignoring it, answering it, or starting work, using your tools. Read files when you need facts.
- Work in parallel. Everything slow runs in the background and reports back as an event: tickets, asks to agents, teams and super teams, critiques, department directives. In one turn, start every independent piece of work that is worth it now (several tickets, several asks, several departments), up to your free capacity. Never wait for one result before starting work that does not depend on it.
- Plan ahead. Your plan holds the next steps too, not only the current ones: give items dependencies (dependsOn), and give build work a ready ticket so it opens by itself the moment its dependencies are done. When a result arrives, the next step should already be in the plan.
- Keep the plan current: plan_items to add, start (doing), finish (done) or block single items; update_plan to rewrite focus and priorities. The owner reads it instead of asking you.
- You have several threads. This turn is one of them; other threads may run at the same time and handle other events. Stay in your thread's area and do not redo work another thread started.
- Know-how first: before new or hard work, and whenever something is not working, use request_know_how (or open the ticket with research: true). The best known methods beat a fresh guess.
- Do not give up on the first "no": find why it failed and start the next distinct approach. Stopping a ticket, killing an initiative or saying it cannot be finished needs three distinct approaches and a rescue challenge (code checks it).
- Improve the people, not only the work: when an agent, team or super team does weak work, say why with report_gap (the remedy is applied and repeats go to the coach); when you learn a reusable method, propose_skill_update.
- Finish with a short note of what you decided and why, written so the owner can follow it.`
const NOTE = obj({ note: { type: 'string', description: 'what you decided for each trigger and why, in a few lines' } })
const REPORT = obj({
  status: { type: 'string', enum: ['ready', 'progress', 'waiting', 'blocked', 'failed', 'dropped'], description: 'ready: the ticket is delivered. progress: real progress, another turn is needed. waiting: you need an answer (put it in question). blocked: you cannot continue and say why. failed: it does not work. dropped: nothing to do.' },
  summary: { type: 'string', description: 'what you did and found, with numbers; say measured (you ran it), simulated or argued' },
  question: { type: 'string', description: 'one concrete question for a person, or empty' },
  files: { type: 'array', items: S, description: 'the files in your folder that matter, most important first' },
  proposal: obj(P.proposal.schema),
  approaches: { type: 'array', items: S, description: 'the distinct approaches you tried on this ticket so far, each with its result in a few words' },
  needKnowHow: { type: 'string', description: 'when you are stuck or the problem is new to you: what know-how you need (best methods, skills); a scout searches before your next turn. Empty otherwise' },
  proposeSkill: { type: 'string', description: 'a reusable method from this work worth a skill, or an improvement to a skill you used (name it); empty otherwise' },
  ownerActions: { type: 'array', items: S, description: 'actions only the owner can take that would unblock this (each: what, why, and the exact command or click); empty when none' },
})

const tool = (name, description, properties = {}, required = Object.keys(properties)) => ({ name, description, inputSchema: { type: 'object', properties, required } })
const A = { type: 'array', items: S }
/** What giving up asks for (stop, kill, cannot-finish). */
const GIVEUP = {
  attempts: { type: 'array', description: 'the distinct approaches tried, each with its result (at least three)', items: { type: 'object', properties: { approach: S, result: S }, required: ['approach', 'result'] } },
  exempt: { type: 'string', enum: ['duplicate', 'superseded', 'owner-asked', 'out-of-scope'], description: 'only when giving up is not about failing' },
  challenge: { type: 'string', description: 'the id of a finished rescue challenge, to proceed after reading it' },
}
const PURPOSE = { type: 'string', description: 'optional: the initiative, workstream or question this serves. Memory is kept per purpose; default: your current thread' }
const PLAN_ITEM = { type: 'object', properties: {
  id: { type: 'string', description: 'keep the id of an existing item; leave out for a new one' },
  text: S, owner: { type: 'string', description: 'who does it: you, a super agent, a department, a team, a ticket id, or the owner' },
  status: { type: 'string', enum: ['todo', 'doing', 'blocked', 'done'] }, note: S,
  dependsOn: { type: 'array', items: S, description: 'ids of items (or tickets) that must be done first' },
  workstream: { type: 'string', description: 'the workstream it belongs to; work in different workstreams runs in parallel threads' },
  ticket: { type: 'object', description: 'optional: a ticket that opens by itself as soon as the dependencies are done, without waiting for you', properties: { title: S, brief: S, doneWhen: S, worker: S, talent: { type: 'string', enum: ['standard', 'principal'] } }, required: ['title', 'brief', 'doneWhen'] },
}, required: ['text', 'owner', 'status'] }
const ALL_TOOLS = [
  tool('reply_owner', 'Write to the owner. purpose result: a finished result the owner can use. purpose cannot-finish: something that cannot be finished, with what was tried. purpose question: an owner-only matter you cannot decide; give category, recommendation and ifNoAnswer. The host decides whether a question is sent: an internal one is not sent and your recommendation stands, and only one owner-only question waits at a time. Never use this for progress.', {
    text: S, purpose: { type: 'string', enum: ['result', 'question', 'cannot-finish'] },
    category: { type: 'string', enum: [...P.ownerOnly.map(o => o.key), 'internal'], description: 'for a question: which owner-only matter it is; internal is anything else' },
    options: A, recommendation: S, ifNoAnswer: { type: 'string', description: 'for a question: what you do until the owner answers; work must be able to continue' },
    attempts: GIVEUP.attempts, exempt: GIVEUP.exempt, challenge: GIVEUP.challenge,
  }, ['text', 'purpose']),
  tool('open_ticket', 'Start work that needs building: a worker gets its own folder with a sandboxed shell (code, assets, builds, data, tests) and reports back to you. Write a brief a newcomer could act on.', { title: S, brief: S, doneWhen: { type: 'string', description: 'what must be true for the ticket to be delivered' }, worker: { type: 'string', description: 'optional builder agent; default is the standard worker' }, build: { type: 'string', description: 'optional id of the company build request this ticket answers' }, workstream: { type: 'string', description: 'optional: the workstream of a larger programme this ticket belongs to, e.g. "world", "combat", "audio", "integration"' }, dependsOn: { type: 'array', items: S, description: 'optional ticket ids that must be delivered first; this ticket starts when they are, and its worker can read their folders. Use it for integration and for anything built on another ticket' }, talent: { type: 'string', enum: ['standard', 'principal'], description: 'principal: the strongest model, for the hardest or most important tickets' }, planItem: { type: 'string', description: 'optional id of the plan item this ticket carries out; the item is marked done when the ticket is delivered' }, research: { type: 'boolean', description: 'true for new or hard work: the Skill Scout finds the best methods and skills before the first turn' } }, ['title', 'brief', 'doneWhen']),
  tool('critique', 'Send a ticket\'s folder to the critique panel. Every critic reads the work through its own lens at the same time and returns a score, what must be fixed and what would lift it. It runs in the background; the verdicts reach you as an event. Use it before the gate, and again after a fix pass, until nothing must be fixed. Then send the fixes to the ticket with message_ticket.', { ticket: S, focus: { type: 'string', description: 'optional: what you most want judged' } }, ['ticket']),
  tool('message_ticket', 'Send more context or a correction to a ticket. Its worker reads it on the next turn; an ended ticket resumes.', { ticket: S, text: S }),
  tool('read_ticket', 'Read a ticket: its reports, its notes and its file list.', { ticket: S }),
  tool('stop_ticket', 'Stop a ticket. Giving up needs three distinct approaches tried (attempts) and a rescue challenge first, unless it is a duplicate, superseded, the owner asked, or out of scope (exempt).', { ticket: S, reason: S, attempts: GIVEUP.attempts, exempt: GIVEUP.exempt, challenge: GIVEUP.challenge }, ['ticket', 'reason']),
  tool('accept_ticket', 'Accept a ticket the verifier keeps failing, as it is, with your reason (for example the done-when was wrong). It closes as delivered.', { ticket: S, reason: S }),
  tool('request_know_how', 'Ask the Skill Scout for know-how: the best known methods for a problem (papers, practitioners, open-source code) and skills worth using, installed through the audit and put on trial for the agent you name. Use it at the start of new or hard work and whenever something is not working. The brief reaches you as an event.', { problem: S, context: S, forAgent: { type: 'string', description: 'optional agent that should get the skills (a team member, a department head, yourself)' } }, ['problem']),
  tool('report_gap', 'Record that an agent, team or super team fell short in capability, from what you saw in its work, with the remedy. Code applies the remedy for the next task and, when it repeats, has the coach fix it for good.', { who: S, category: GAP.properties.category, gap: S, evidence: S, remedy: GAP.properties.remedy, detail: S }, ['who', 'category', 'gap', 'remedy']),
  tool('propose_skill_update', 'Propose a new skill or an improvement to a skill from what the company learned. The Skill Smith writes it, the auditor checks it, and it is trialled before it is kept.', { skill: { type: 'string', description: 'existing skill to improve, or empty for a new one' }, proposal: S, evidence: S, appliesTo: { type: 'string', enum: ['builder', 'leader', 'all'] } }, ['proposal', 'evidence']),
  tool('ask_agent', 'Ask one agent. A quick answer comes back in this turn; a longer one reaches you later as an event, so ask several agents at once when you need several views. agent may be a staffing handle "name@purpose": the agent then works with its memory for that purpose.', { agent: S, message: S, purpose: PURPOSE }, ['agent', 'message']),
  tool('ask_team', 'Give a task to a team. It works in its own chat; the reply reaches you later as a trigger.', { team: S, message: S, purpose: PURPOSE }, ['team', 'message']),
  tool('ask_super_team', 'Give a task to a super team (a lead over several teams). The reply reaches you later as a trigger.', { id: S, message: S, purpose: PURPOSE }, ['id', 'message']),
  tool('staff', 'Get someone for a piece of work. Describe the capability and the purpose; code and the HR reviewer choose the cheapest fit: reuse an agent that already works on it, give an agent its own memory for this purpose (instance), fork a related purpose, fresh eyes (measured facts only), improve an agent, clone one for this purpose, or create one. unit team does the same for teams. You get a handle to use with ask_agent or ask_team.', {
    unit: { type: 'string', enum: ['agent', 'team'] }, capability: { type: 'string', description: 'what the work is and what a good result looks like' }, purpose: { type: 'string', description: 'the initiative, workstream or question it serves; its memory is kept per purpose' },
    kind: { type: 'string', enum: ['analyst', 'builder'] }, fresh: { type: 'boolean', description: 'true when the work must challenge earlier conclusions' },
    name: { type: 'string', description: `only if a new agent or team may be needed: ${P.prefix}<specialty>-<function> for an agent, ${P.prefix}<mission> for a team` }, description: S, role: { type: 'string', description: 'only if a new agent may be needed: what it does, how, and what a good result looks like' }, model: { type: 'string', enum: P.models.choices }, skills: A, members: { type: 'array', items: S, description: 'for a new team: existing agents' },
  }, ['unit', 'capability', 'purpose']),
  tool('delegate', 'Hand an area of work to a super agent directly below you. Its answer reaches you later as a trigger.', { to: S, message: S }),
  tool('list_org', 'List the super agents, super teams, teams, agents and skills you can use.'),
  tool('create_agent_direct', 'Create an agent. kind analyst is read-only (judges, researches, reviews); kind builder gets a sandboxed shell in a ticket folder.', { name: S, description: S, role: { type: 'string', description: 'what it does, how, and what a good result looks like' }, kind: { type: 'string', enum: ['analyst', 'builder'] }, model: { type: 'string', enum: P.models.choices }, skills: A, team: { type: 'string', description: 'optional existing team to join' } }, ['name', 'description', 'role', 'kind']),
  tool('update_agent', 'Improve an existing agent: its role text, description, model, effort or skills. The old version is kept.', { name: S, role: S, description: S, model: S, effort: S, skills: A, why: S }, ['name']),
  tool('create_team_direct', 'Create a team from existing agents, or change the members of one of your teams.', { name: S, description: S, members: A }),
  tool('create_super_team', 'Create a super team: one supervisor agent over several teams.', { title: S, supervisor: S, teams: A, instructions: S }, ['title', 'supervisor', 'teams']),
  tool('create_super_agent', 'Create a super agent below you that leads the listed super teams, teams and agents.', { id: S, title: S, mission: S, superTeams: A, teams: A, agents: A }, ['id', 'title', 'mission']),
  tool('find_skills', 'Search GitHub for repositories of agent skills.', { query: S }),
  tool('list_repo_skills', 'List the SKILL.md files in a GitHub repository.', { repo: { type: 'string', description: 'owner/name' } }),
  tool('install_skill', 'Download one SKILL.md from GitHub. The independent auditor reads it first; it is installed only when judged safe.', { repo: S, path: S, name: S }, ['repo', 'path']),
  tool('update_plan', 'Rewrite your plan. The owner reads it to know what you are doing, so keep it current, concrete and short: call it whenever your priorities, to-do list or blockers change. It replaces the previous plan.', {
    focus: { type: 'string', description: 'one or two sentences: what you are working toward right now and why this, not something else' },
    priorities: { type: 'array', description: 'at most 3, most important first', items: { type: 'object', properties: { text: S, why: S }, required: ['text', 'why'] } },
    todo: { type: 'array', description: 'at most 30 concrete items, including the steps after the current ones so they can start the moment they are unblocked', items: PLAN_ITEM },
    blockers: { type: 'array', items: S, description: 'what stops progress now, each with what would remove it' },
    waitingOnOwner: { type: 'array', items: S, description: 'what you need from the owner, or empty' },
    outcome: { type: 'string', description: 'what the result will be if this plan works, in one or two plain sentences the owner can check later' },
    expectedBy: { type: 'string', description: 'when you expect that result: a date (YYYY-MM-DD) or "unknown". Say unknown when it cannot be estimated; do not guess' },
    pctComplete: { type: 'number', description: 'how far along you are toward your goal, 0 to 100, your honest estimate' },
    pctBasis: { type: 'string', description: 'how you arrived at pctComplete, in one sentence' },
  }, ['focus', 'priorities', 'todo']),
  tool('plan_items', 'Change single items of your plan: add new ones (with dependencies and, for build work, a ticket that opens by itself when they are done), update the status or note of existing ones, remove finished ones. Prefer this to update_plan when only items change: your other threads may be editing the plan at the same time.', {
    add: { type: 'array', items: PLAN_ITEM }, update: { type: 'array', items: { type: 'object', properties: { id: S, status: { type: 'string', enum: ['todo', 'doing', 'blocked', 'done'] }, note: S, text: S, owner: S, dependsOn: A }, required: ['id'] } }, remove: A,
  }, []),
  tool('report_milestone', 'Tell the owner a milestone of the goal ladder is reached or lost. Only with evidence the owner can check (a file, a ticket, a number).', { key: { type: 'string', enum: P.milestones.map(m => m.key), description: P.milestones.map(m => `${m.key}: ${m.title}.`).join(' ') }, done: { type: 'boolean' }, evidence: S }),
  tool('submit_engine_change', 'Ask for a finished patch from one of your tickets to be installed into the engine. Code checks it, the independent auditor reads it, then the owner is asked; on Install it is tested on a copy, applied with a backup and rolled back if the engine tests fail. The patch must be a unified diff that applies from inside the engine folder and may only touch quantcore/, config/ and tests/. Submit only what you have reviewed yourself.', { ticket: S, patch: { type: 'string', description: 'file name of the patch inside the ticket folder' }, title: S, summary: { type: 'string', description: 'what it changes and why, in plain words' } }),
  tool('run_company_cycle', 'Run one full company cycle (led by the COO) of the company (all departments). Slow and costs a few dollars; use when a broad review is worth it.', { focus: S }, []),
]
/** A company without an engine has no engine change to submit. */
// creation goes through staff (one path, with reasons); the direct tools stay for the code behind it
const TOOLS = ALL_TOOLS.filter(t => (P.hasEngine || t.name !== 'submit_engine_change') && !t.name.endsWith('_direct'))
const pick = names => TOOLS.filter(t => names.includes(t.name))
const COMMON = ['update_plan', 'plan_items', 'list_org', 'ask_agent', 'ask_team', 'staff', 'request_know_how', 'report_gap', 'propose_skill_update']
/** What each kind of leader can do. The COO and department heads add their own company tools. */
function leaderTools(me, departments) {
  const k = kindOf(me)
  if (k === 'coo') return [...pick([...COMMON, 'reply_owner', 'open_ticket', 'critique', 'message_ticket', 'read_ticket', 'stop_ticket', 'accept_ticket', 'ask_super_team', 'delegate', 'update_agent']), ...toolsFor('coo', departments)]
  if (k === 'dept') return [...pick([...COMMON, 'update_agent']), ...toolsFor('dept', departments)]
  return TOOLS
}
const CRITIQUE = obj({
  score: { type: 'number', description: '0..1 through your lens; 1 is the best work in the field' },
  verdict: { type: 'string', description: 'two sentences: what this is and how good' },
  mustFix: { type: 'array', items: S, description: 'defects that must be fixed, each with the file or place and the fix' },
  wouldElevate: { type: 'array', items: S, description: 'at most 5 changes that would lift it from good to great' },
  capabilityGaps: { type: 'array', items: GAP, description: 'which capability of the builder (who: "worker") or of anyone else fell short, and the remedy, so they get better and not only this work' },
})

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

/** Keep a ticket's plan item in step with the ticket: delivered is done, anything else that ended is blocked. */
function syncItem(s, t) {
  if (!t?.planItem) return
  const it = s.agents.find(a => a.id === t.owner)?.plan?.todo?.find(x => x.id === t.planItem)
  if (!it || t.status !== 'ended') return
  it.status = t.outcome === 'completed' ? 'done' : 'blocked'
  it.note = str(t.outcome === 'completed' ? `delivered by ticket ${t.id}` : `ticket ${t.id} ended: ${t.outcome}${t.note ? ` (${t.note})` : ''}`, 300)
  it.updatedAt = now()
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
    this.desk = new Desk(this)
    // evals are keyed "<leader>|<lane>": one turn per thread, several threads per leader
    this.live = { evals: new Map(), tickets: new Map(), jobs: new Map() }
    this.memory = new MemoryKeeper(this)
    this.growth = new Growth(this)
    this.wakes = new Map() // leader id -> when it was last woken for spare capacity or to plan ahead
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
      try { this.#runSchedules() } catch (e) { this.log(`schedules: ${e.message}`) }
      const s = this.store.read()
      if (!s.agents.length) return
      await this.ops.ensure().catch(e => this.log(`engine: ${e.message}`))
      this.changes.poll()
      if (Date.now() - (this.leadersAt ?? 0) > 60_000) { this.leadersAt = Date.now(); try { seedLeaders(this) } catch (e) { this.log(`leaders: ${e.message}`) } }
      this.#seed(this.store.read())
      if (Date.now() - (this.metricsAt ?? 0) > 10 * 60_000) { this.metricsAt = Date.now(); try { recordMetrics(this) } catch (e) { this.log(`metrics: ${e.message}`) } }
      const hold = await this.#hold()
      await this.memory.tick({ hold })
      if (!this.growthSeeded) { this.growthSeeded = true; try { this.growth.seed() } catch (e) { this.log(`growth seed: ${e.message}`) } }
      if (s.enabled && !hold) await this.#pollSources()
      if (hold) return
      this.#dispatch()
      this.#wake()
      this.#startEvals()
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
    // plans written before items had ids get them once
    if (s.agents.some(a => a.plan?.todo?.some(t => !t.id))) {
      this.store.update(x => { for (const a of x.agents) for (const t of a.plan?.todo ?? []) if (!t.id) { t.id = newId('p'); t.updatedAt = a.plan.updatedAt } })
    }
    for (const a of s.agents) {
      if (a.paused) continue
      if (a.plan && a.plan.outcome === undefined) {
        this.trigger({ key: `plan:v2:${a.id}`, source: 'system', kind: 'extend-your-plan', to: a.id, text: 'The owner now reads three more things on your dashboard page: the result your plan will produce (outcome), when you expect it (expectedBy: a date, or "unknown" when you cannot estimate it honestly), and how far along you are toward your goal (pctComplete, 0 to 100, with pctBasis). Rewrite your plan once with update_plan and fill these in. Keep everything else as it is unless it is out of date.' })
      }
      if (a.plan && !a.plan.v3) {
        this.store.update(x => { const y = x.agents.find(z => z.id === a.id); if (y?.plan) y.plan.v3 = true })
        this.trigger({ key: `plan:v3:${a.id}`, source: 'system', kind: 'work-in-parallel', to: a.id, text: 'New: you now work in parallel and plan ahead. Several of your turns can run at once (one per thread); asks to agents and critiques run in the background; worker slots are shared fairly between the leaders. Rewrite your plan once with update_plan: list the next steps after the current ones too, give items dependencies (dependsOn), give build work a ready ticket so it opens by itself when its dependencies are done, and group items into workstreams. Then start every independent item that is ready now.' })
      }
      if (a.plan) continue
      this.trigger({ key: `plan:init:${a.id}`, source: 'system', kind: 'write-your-plan', to: a.id, text: `The owner cannot see what you are doing or planning. Write your plan now with update_plan (focus, top priorities with reasons, a concrete to-do list with owners and status, blockers, what you need from the owner) and keep it current from now on.${a.parent ? '' : `\nAlso new for you: (1) submit_engine_change installs a finished, reviewed patch from a ticket into the engine (audit, the owner's approval, tested install with rollback). Until now nothing a worker built ever reached the engine; look at the finished tickets and decide what to submit, one change at a time. (2) The host now starts and keeps the engine processes running when the owner switches that on. (3) report_milestone tells the owner when the gate can score a new strategy and when a strategy is profitable on training data.`}` })
    }
  }

  // ---------------- commands (owner actions, from any process)
  /** The text of an owner instruction about a unit that is not itself a super agent: the responsible super agent carries it out. */
  ownerText(ref, name, text) {
    if (ref.startsWith('sa:')) return text
    return `The owner asks, about "${name}" (${ref}): ${text}\nCarry it out through your tools (delegate, ask_team, ask_agent, open_ticket, update_agent) and tell the owner what you did.`
  }

  #runSchedules() {
    const t = now()
    const due = this.store.read().schedules.filter(x => x.status === 'active' && x.at <= t)
    if (!due.length) return
    const owner = ref => { const s = this.store.read(); return ref.startsWith('sa:') && s.agents.some(a => `sa:${a.id}` === ref) ? ref.slice(3) : s.agents.find(a => !a.parent)?.id ?? 'ceo' }
    for (const x of due) this.trigger({ key: `sched:${x.id}:${x.at}`, source: 'owner', kind: 'scheduled', to: owner(x.ref), text: `Scheduled by the owner for "${x.name ?? x.ref}" (set ${x.createdAt?.slice(0, 16)}):\n${this.ownerText(x.ref, x.name ?? x.ref, x.text)}` })
    this.store.update(s => {
      for (const x of due) {
        const y = s.schedules.find(z => z.id === x.id)
        if (!y) continue
        y.runs = (y.runs ?? 0) + 1; y.lastRunAt = now()
        if (y.everyMin) { let at = new Date(y.at).getTime(); while (at <= Date.now()) at += y.everyMin * 60_000; y.at = new Date(at).toISOString() } else y.status = 'done'
      }
    })
  }

  #command(c) {
    if (c.type === 'dream-now') { this.memory.forceNext = true; return }
    if (c.type === 'schedule-add') {
      const at = new Date(c.at)
      if (Number.isNaN(at.getTime()) || !str(c.text, 1500).trim()) return
      this.store.update(s => { if (s.schedules.filter(x => x.status === 'active').length < 60) s.schedules.push({ id: newId('s'), ref: String(c.ref), name: str(c.name, 120), text: str(c.text, 1500).trim(), at: at.toISOString(), everyMin: c.everyMin ? Number(c.everyMin) : null, status: 'active', createdAt: now(), runs: 0 }) })
    } else if (c.type === 'schedule-cancel') {
      this.store.update(s => { const x = s.schedules.find(y => y.id === c.id); if (x) x.status = 'cancelled' })
    } else if (c.type === 'say') {
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
        num('maxWorkers', 1, 12); num('maxEvals', 1, 8); num('maxLanes', 1, 6); num('maxJobs', 1, 20); num('assignmentMinutes', 5, 180); num('maxAssignments', 1, 30)
        num('maxTicketsPerDay', 0, 200); num('maxEvalsPerDay', 1, 3000); num('maxSuperAgents', 1, 20); num('maxSkillsPerDay', 0, 50)
        num('idleWakeMinutes', 5, 240); num('planAheadMinutes', 30, 1440)
        if (typeof c.patch?.leaders?.company === 'boolean') { s.settings.leaders = { ...(s.settings.leaders ?? {}), company: c.patch.leaders.company }; this.leadersSig = null }
        for (const k of ['company', 'engine', 'clock']) if (typeof c.patch?.sources?.[k] === 'boolean') s.settings.sources[k] = c.patch.sources[k]
        // memory upkeep (dream.js): on/off, how often, and the daily spend cap
        if (c.patch?.dream && typeof c.patch.dream === 'object') {
          const d = (s.settings.dream ??= {})
          if (typeof c.patch.dream.enabled === 'boolean') d.enabled = c.patch.dream.enabled
          const n = (k, lo, hi) => { const v = Number(c.patch.dream[k]); if (Number.isFinite(v)) d[k] = Math.min(hi, Math.max(lo, v)) }
          n('everyHours', 1, 72); n('maxUsdPerDay', 0, 50); n('maxFacts', 1, 40); n('maxInstances', 0, 20); n('retireDays', 3, 90)
        }
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
      syncItem(s, t)
    })
  }

  // ---------------- sources
  async #pollSources() {
    const s = this.store.read()
    const src = s.settings.sources
    const since = s.sourceState.since ?? now()
    if (src.company) {
      const c = this.co.read()
      const coo = companyLeadersOn(this, s) && s.agents.some(a => a.id === COO_ID && !a.paused)
      // in continuous mode the COO reviews on the autopilot timer instead of running a batch cycle
      const ap = c.charter.autopilot
      if (coo && ap.enabled) {
        const every = Math.max(0.25, Number(ap.everyHours) || 6) * 3600_000
        const lastReview = c.cycles.filter(x => x.endedAt).at(-1)?.endedAt
        if (!lastReview || Date.now() - new Date(lastReview).getTime() >= every) {
          this.trigger({ key: `review:${Math.floor(Date.now() / every)}`, source: 'company', kind: 'review', to: COO_ID, text: `Time for your review (every ${ap.everyHours} h). ${P.prompts.review.replace(/Write the brief for the owner/, 'Then write the brief for the owner with write_brief')} Before that, make sure every department has work: give directives where a department is idle, decide the waiting build requests, and plan the next steps.` })
        }
      }
      for (const b of c.builds) {
        if (b.status !== 'requested') continue
        if (coo) { this.trigger({ key: `coo-build:${b.id}`, source: 'company', kind: 'build-request', to: COO_ID, text: `The ${b.department} department asks for a build (id ${b.id}): ${b.title}\nSpec: ${b.spec}\nExpected value: ${b.expectedValue}\nDecide it with decide_build: open the ticket now, forward it to the CEO, or drop it.` }); continue }
        this.trigger({ key: `build:${b.id}`, source: 'company', kind: 'build-request', text: `The company's ${b.department} department asks for a build (id ${b.id}): ${b.title}\nSpec: ${b.spec}\nExpected value: ${b.expectedValue}\nDecide whether it is worth a ticket now. Pass build: "${b.id}" to open_ticket when you take it.` })
      }
      const last = c.cycles.at(-1)
      if (last && last.status !== 'running' && last.endedAt && last.endedAt > since) {
        this.trigger({ key: `cycle:${last.id}`, source: 'company', kind: 'cycle-finished', text: `A company cycle (COO) finished (${last.status}; spend $${last.spendUsd ?? '?'}). Summary: ${last.summary ?? '(none)'}\nBrief: ${last.report ? path.join(this.co.reports, last.report) : '(none)'}\nRead the brief and decide what follows.` })
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
  /** Start a turn for every thread that has events waiting: your messages first, then the oldest waiting event. */
  #startEvals() {
    const s = this.store.read()
    if (this.store.day(s).evals >= s.settings.maxEvalsPerDay) return
    const pending = s.triggers.filter(t => t.status === 'pending')
    const groups = new Map()
    for (const t of pending) {
      const me = s.agents.find(a => a.id === t.to)
      if (!me || me.paused) continue
      const key = `${me.id}|${laneOf(t, s)}`
      if (!groups.has(key)) groups.set(key, { me, lane: laneOf(t, s), triggers: [] })
      groups.get(key).triggers.push(t)
    }
    const order = [...groups.values()].sort((a, b) => (b.lane === 'owner') - (a.lane === 'owner') || a.triggers[0].ts.localeCompare(b.triggers[0].ts))
    const lanesOf = id => [...this.live.evals.keys()].filter(k => k.startsWith(`${id}|`)).length
    for (const g of order) {
      const key = `${g.me.id}|${g.lane}`
      if (this.live.evals.has(key)) continue
      // the owner's thread may use one turn more than the limit, so your message never waits behind long work
      if (this.live.evals.size >= s.settings.maxEvals + (g.lane === 'owner' ? 1 : 0)) continue
      if (lanesOf(g.me.id) >= s.settings.maxLanes && g.lane !== 'owner') continue
      this.#eval(g.me, g.triggers.slice(0, 8), g.lane)
    }
  }

  /** What a leader has running and how many worker slots it may still use. */
  #capacity(s, me) {
    const mine = s.tickets.filter(t => t.owner === me.id && t.status === 'open')
    const running = mine.filter(t => this.live.tickets.has(t.id)).length
    const queued = mine.filter(t => !this.live.tickets.has(t.id) && stage(t, false) === 'queued').length
    const owners = new Set(s.tickets.filter(t => t.status === 'open' && (this.live.tickets.has(t.id) || stage(t, false) === 'queued')).map(t => t.owner)).size || 1
    const share = shareOf(s.settings.maxWorkers, owners)
    const freeAll = s.settings.maxWorkers - this.live.tickets.size
    const jobs = s.jobs.filter(j => j.status === 'running' && j.from === me.id).length
    const lanes = [...this.live.evals.keys()].filter(k => k.startsWith(`${me.id}|`)).map(k => k.split('|')[1])
    // tickets are for super agents and the COO; department heads work through jobs (super team, teams, agents)
    const free = kindOf(me) === 'dept' ? Math.max(0, 2 - jobs) : Math.max(0, Math.min(freeAll, share - running) - queued)
    return { running, queued, share, freeAll, jobs, lanes, free, work: running + queued + jobs }
  }

  /** Wake leaders that sit idle while they could work: ready plan items and free slots, or nothing planned at all. */
  #wake() {
    const s = this.store.read()
    if (this.store.day(s).evals >= s.settings.maxEvalsPerDay) return
    for (const me of s.agents) {
      if (me.paused) continue
      const c = this.#capacity(s, me)
      const lastEval = s.evals.filter(e => e.agent === me.id).at(-1)
      const prev = this.wakes.get(me.id)
      const sig = readyItems(me.plan).map(t => t.id).join(',')
      // waking a leader again for the same ready items it chose not to start: back off 2x each time, up to 8x
      const backoff = prev && prev.sig === sig ? 2 ** Math.min(3, prev.n) : 1
      const why = wakeReason(me, {
        busy: c.lanes.length > 0, pending: s.triggers.some(t => t.to === me.id && t.status === 'pending'), running: c.work,
        free: c.free, lastEvalEnd: lastEval?.endedAt ?? lastEval?.startedAt, lastWake: prev?.at,
        idleWakeMin: s.settings.idleWakeMinutes * backoff, planAheadMin: s.settings.planAheadMinutes * backoff,
      })
      if (!why) continue
      this.wakes.set(me.id, { at: now(), sig, n: prev && prev.sig === sig ? prev.n + 1 : 1 })
      if (why.kind === 'capacity') {
        this.trigger({ source: 'system', kind: 'capacity', to: me.id, text: `You have free capacity (${c.free} slot${c.free === 1 ? '' : 's'}) and ${why.ready.length} plan item${why.ready.length === 1 ? ' is' : 's are'} ready to start: ${why.ready.slice(0, 6).map(t => `${t.id} "${t.text}"`).join('; ')}. Start the ones worth starting now, in parallel (each independent piece at once), mark them doing, and plan the steps that follow them. If an item should not start, say why in its note or remove it.` })
      } else {
        this.trigger({ source: 'system', kind: 'plan-ahead', to: me.id, text: 'Nothing of yours is running and your plan has no open items. Look ahead: what are the next steps toward your goal, and what could run in parallel? Put them in your plan (with dependencies, and with a ready ticket for build work so it starts by itself) and start what can start now. If there is truly nothing worth doing, say so in your note.' })
      }
    }
  }

  #context(me, lane) {
    const s = this.store.read()
    const c = this.co.read()
    const b = this.co.budget()
    const ch = c.charter
    const tk = s.tickets.filter(t => t.status === 'open' || (t.endedAt ?? '') > new Date(Date.now() - 3 * 86400_000).toISOString())
    return [
      `# Charter\nMission: ${ch.mission}\nScope: ${ch.scope}\nRules:\n${ch.rules.map(r => `- ${r}`).join('\n')}`,
      `# You\n${kindOf(me) === 'coo' ? `The COO ("${me.id}"), under the CEO super agent "${me.parent}". You lead the department heads: ${s.agents.filter(a => a.parent === me.id).map(a => a.id).join(', ') || '-'}.` : kindOf(me) === 'dept' ? `Head of the department "${me.title}" ("${me.id}"), under the COO.` : `Super agent "${me.id}" (${me.title}). Above you: ${me.parent ?? 'the owner'}. Below you: ${s.agents.filter(a => a.parent === me.id).map(a => a.id).join(', ') || 'no super agents yet'}.${me.parent ? `\nYou lead: super teams ${me.reports.superTeams.join(', ') || '-'}; teams ${me.reports.teams.join(', ') || '-'}; agents ${me.reports.agents.join(', ') || '-'}.` : '\nYou reach every super team, team and agent (list_org).'}`}`,
      `# Budget today\nSpent $${b.spentTodayUsd} of $${b.dailyUsd}${this.co.metering === 'balance' ? `; ${P.models.provider} balance $${b.balanceUsd ?? '?'} (reserve $${b.reserveUsd})` : ' (estimated from run costs)'}. Tickets opened today: ${this.store.day(s).tickets} of ${s.settings.maxTicketsPerDay}.`,
      kindOf(me) !== 'super' ? '' : `# Company state\nInitiatives:\n${c.initiatives.slice(-12).map(i => `- [${i.stage}] ${i.title}: ${clip(i.note ?? i.thesis ?? '', 200)}`).join('\n') || '(none)'}\n${P.text.ordersTitle} so far: ${c.orders.length}${c.orders.length ? ` (${c.orders.slice(-5).map(o => o.book).join(', ')})` : ''}. Open build requests: ${c.builds.filter(x => x.status === 'requested').length}. Last COO brief: ${c.cycles.filter(x => x.report).at(-1)?.report ? path.join(this.co.reports, c.cycles.filter(x => x.report).at(-1).report) : '(none)'}`,
      `# Your plan (the owner reads this; ids are stable)\n${planText(me.plan)}`,
      kindOf(me) === 'dept' ? '' : this.#goalText(s),
      `# Authority\n${P.ownerOnlyText()}\nQuestions waiting for the owner: ${c.decisions.filter(d => d.status === 'open').length}; held: ${c.decisions.filter(d => d.status === 'held').length}. Do not repeat them.`,
      this.#capacityText(s, me, lane),
      `# Tickets${me.parent ? ' you own' : ''}\n${tk.filter(t => !me.parent || t.owner === me.id).map(t => `- ${t.id} [${stage(t, this.live.tickets.has(t.id))}] "${t.title}" (${t.workstream ? `workstream ${t.workstream}; ` : ''}${t.dependsOn?.length ? `after ${t.dependsOn.join(', ')}; ` : ''}${t.talent ? 'principal; ' : ''}${t.critiques?.length ? `last critique: lowest ${t.critiques.at(-1).min}, ${t.critiques.at(-1).mustFix} must-fix; ` : 'not critiqued; '}owner ${t.owner}; folder ${t.dir})${t.assignments.at(-1)?.report ? `: ${clip(t.assignments.at(-1).report.summary, 300)}` : ''}`).join('\n') || '(none)'}`,
      `# Asked and still running\n${s.jobs.filter(j => j.status === 'running' && (!me.parent || j.from === me.id)).map(j => `- ${j.kind} ${j.target}${j.from !== me.id ? ` (by ${j.from})` : ''}: ${clip(j.message, 140)}`).join('\n') || '(nothing)'}`,
      ...(kindOf(me) === 'super' ? [] : [companyContext(this, me)]),
      `# Recent messages\n${s.feed.slice(-8).map(m => `- ${m.ts.slice(5, 16)} ${m.from}: ${clip(m.text, 240)}`).join('\n') || '(none)'}`,
    ].filter(Boolean).join('\n\n')
  }

  /** Capacity and the leader's other threads, so it starts independent work at once and does not duplicate a thread. */
  #capacityText(s, me, lane) {
    const c = this.#capacity(s, me)
    const others = s.evals.filter(e => e.agent === me.id && e.status === 'running' && (e.lane ?? 'main') !== lane)
    const ready = readyItems(me.plan)
    return [
      `# Capacity and threads`,
      kindOf(me) === 'dept'
        ? `Background asks of yours running: ${c.jobs} (keep up to 2 going: your super team plus teams or agents).`
        : `Worker slots: ${this.live.tickets.size} of ${s.settings.maxWorkers} in use across the company; yours: ${c.running} running, ${c.queued} queued; your fair share is ${c.share}, and slots others leave unused are lent to you. Free for you now: ${c.free}. Tickets opened today: ${this.store.day(s).tickets} of ${s.settings.maxTicketsPerDay}.`,
      `Background asks running for you: ${c.jobs}.`,
      `This turn is your "${lane}" thread. ${others.length ? `Your other threads running now: ${others.map(e => `"${e.lane ?? 'main'}" (handling ${s.triggers.filter(t => e.triggers.includes(t.id)).map(t => t.kind).join(', ')})`).join('; ')}. Do not redo their work; change only the plan items of this thread (plan_items).` : 'No other thread of yours is running.'}`,
      ready.length ? `Plan items ready to start now: ${ready.map(t => t.id).join(', ')}.` : '',
    ].filter(Boolean).join('\n')
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

  #eval(me, triggers, lane = 'main') {
    const { engine } = this.forge
    const evalId = newId('e')
    const ids = triggers.map(t => t.id)
    const actions = []
    const ctx = { lane, since: now(), evalId }
    const trigText = triggers.map(t => t.text).join('\n')
    const lessons = this.growth.lessonsFor(trigText, 5)
    const attach = this.growth.attach(me.agent)
    const prompt = `${this.#context(me, lane)}\n\n# Triggers to handle now\n${triggers.map((t, i) => `## ${i + 1}. ${t.source} / ${t.kind} (${t.ts.slice(0, 16)})\n${t.text}`).join('\n\n')}${lessons.length ? `\n\n# Lessons the company learned that may apply\n${lessons.map(l => `- (${l.kind}) ${l.text}`).join('\n')}` : ''}${attach ? `\n\n# Skills attached to this turn\n${attach.attached.join(', ')} (your playbook and skills on trial; use them)` : ''}\n\n${HOW_YOU_WORK}`
    const tools = leaderTools(me, this.co.read().departments.map(d => d.id))
    const { id: runId, done } = engine.startCustom(`${kindOf(me) === 'super' ? 'super agent' : kindOf(me) === 'coo' ? 'COO' : 'department'}: ${me.id}${lane !== 'main' ? ` (${lane})` : ''}`, async api => {
      const mcp = toolsMcp('super', tools, (name, args) => this.#tool(me, name, args, api, actions, ctx))
      const res = await api.agent(me.agent, prompt, { schema: NOTE, label: `eval:${me.id}`, full: true, extraMcp: { super: mcp }, signal: AbortSignal.timeout(30 * 60_000), ...(attach ? { overrides: { skills: attach.skills } } : {}) })
      if (!res?.ok) throw new Error(res?.error ?? 'the super agent gave no answer')
      return { note: str(res.structured?.note ?? res.text, 3000) }
    }, { agent: me.id, lane, triggers: ids.length }, { cwd: WORKDIR, meta: { superAgent: me.id, lane } })
    this.live.evals.set(`${me.id}|${lane}`, runId)
    this.store.update(s => {
      for (const t of s.triggers) if (ids.includes(t.id)) { t.status = 'evaluating'; t.attempts++ }
      s.evals.push({ id: evalId, agent: me.id, lane, runId, triggers: ids, status: 'running', startedAt: ctx.since })
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
      for (const t of back) this.trigger({ source: 'super-agent', kind: 'reply', to: t.replyTo, ...(t.replyLane ? { lane: t.replyLane } : {}), text: `${me.title ?? me.id} finished what you delegated ("${clip(t.text, 200)}").\nIts note: ${note}` })
      if (!ok && triggers.some(t => t.source === 'owner')) this.say({ from: 'system', kind: 'system', text: `The super agent ${me.id} could not handle your message: ${clip(note, 300)}` })
    }).catch(e => this.log(`eval ${me.id}: ${e.message}`)).finally(() => { this.live.evals.delete(`${me.id}|${lane}`); this.holdAt = 0 })
  }

  async #tool(me, name, a, api, actions, ctx) {
    const cur = this.store.read().agents.find(x => x.id === me.id) ?? me // the plan may have changed in another thread
    const out = (await companyAct(this, cur, name, a, ctx)) ?? await this.#act(cur, name, a, api, ctx)
    if (name === 'update_plan' || name === 'plan_items') return clip(out, 12000)
    if (name !== 'list_org' && name !== 'read_ticket' && name !== 'find_skills' && name !== 'list_repo_skills') actions.push({ tool: name, arg: clip(a.title ?? a.agent ?? a.team ?? a.id ?? a.to ?? a.name ?? a.ticket ?? a.text ?? '', 80) })
    return clip(out, 12000)
  }

  async #act(me, name, a, api, ctx = { lane: 'main' }) {
    const { registry, engine } = this.forge
    const org = this.org
    switch (name) {
      case 'reply_owner': return this.#replyOwner(me, a)
      case 'critique': { const t = this.#myTicket(this.store.read(), me, a.ticket); return this.startJob(me, 'critique', t.id, `critique of "${t.title}"${a.focus ? `: ${str(a.focus, 300)}` : ''}`, ctx.lane, api2 => this.#critique(me, a, api2)) }
      case 'open_ticket': return this.#openTicket(me, a, ctx)
      case 'message_ticket': {
        this.store.update(s => {
          const t = this.#myTicket(s, me, a.ticket)
          if (t.stopped) throw new Error('this ticket was stopped')
          t.inputs.push({ id: newId('i'), ts: now(), kind: 'lead', from: me.id, text: str(a.text, 8000) })
          if (t.status === 'ended') {
            t.status = 'open'; delete t.outcome
            const it = t.planItem && s.agents.find(x => x.id === t.owner)?.plan?.todo?.find(x => x.id === t.planItem)
            if (it) { it.status = 'doing'; it.updatedAt = now() }
          }
        })
        return 'Delivered; the worker reads it on its next turn.'
      }
      case 'read_ticket': { const s = this.store.read(); return JSON.stringify(this.ticketDetail(this.#myTicket(s, me, a.ticket).id), null, 1) }
      case 'stop_ticket': {
        const t = this.#myTicket(this.store.read(), me, a.ticket)
        const wait = this.growth.guard(me, { action: 'stop the ticket', ref: t.id, title: t.title, attempts: a.attempts, exempt: a.exempt, challenge: a.challenge })
        if (wait) return wait
        this.#stopTicket(a.ticket, `stopped by ${me.id}: ${a.reason ?? ''}`)
        this.growth.afterAction({ ...t, outcome: 'stopped' }, { why: `stopped by ${me.id}: ${str(a.reason, 200)}` }).catch(() => {})
        return 'Stopped. An after-action review records what was learned.'
      }
      case 'accept_ticket': {
        const t = this.#myTicket(this.store.read(), me, a.ticket)
        if (str(a.reason, 600).trim().length < 15) throw new Error('say why it is accepted as it is')
        this.store.update(s => { const y = s.tickets.find(z => z.id === t.id); if (y && y.status === 'open') { y.status = 'ended'; y.outcome = 'completed'; y.endedAt = now(); y.verifying = false; (y.reviews ??= []).push({ kind: 'accepted', ts: now(), by: me.id, text: str(a.reason, 600) }); syncItem(s, y) } })
        if (t.build) { try { this.co.setBuild(t.build, 'done') } catch {} }
        return `Accepted ${t.id} as delivered.`
      }
      case 'request_know_how': {
        const target = a.forAgent ? String(a.forAgent) : me.agent
        return this.startJob(me, 'know-how', 'skill scout', str(a.problem, 2000), ctx.lane, () => this.growth.knowHow({ problem: str(a.problem, 4000), context: str(a.context, 6000), forAgent: target, why: `asked by ${me.id}`, by: me.id }))
      }
      case 'report_gap': {
        this.growth.gaps([{ who: a.who, category: a.category, gap: a.gap, evidence: a.evidence ?? '', remedy: a.remedy, detail: a.detail ?? '' }], { source: `review by ${me.id}`, by: me.id })
        return 'Recorded. The remedy is applied for its next task; a repeat goes to the coach.'
      }
      case 'propose_skill_update': {
        return this.startJob(me, 'skill-smith', a.skill || 'new skill', str(a.proposal, 1500), ctx.lane, () => this.growth.smith({ reason: `proposed by ${me.id}`, material: `${str(a.proposal, 4000)}\n\nEvidence: ${str(a.evidence, 2000)}`, appliesTo: a.appliesTo ?? 'builder', skill: a.skill || undefined }))
      }
      case 'ask_agent': {
        // "name@purpose": the agent works with its memory for that purpose (see staff)
        const [agent, handlePurpose] = String(a.agent ?? '').split('@')
        const purpose = a.purpose || handlePurpose || this.purposeOf(me, ctx.lane, 'agent')
        const def = registry.getAgent(agent)
        if ((def.tags ?? []).includes('super-agent')) throw new Error('that is a super agent or a builder: use delegate or open_ticket')
        if (!org.canReach(me, 'agents', agent)) throw new Error(`${agent} is not one of your agents`)
        const msg = `${str(a.message, 12000)}\n\n(Asked by ${me.title ?? me.id}. Answer directly, with your evidence.)`
        return this.startJob(me, 'agent', agent, msg, ctx.lane, async api2 => {
          const r = await api2.agent(agent, msg, { label: `ask:${agent}`, full: true, purpose, signal: AbortSignal.timeout(12 * 60_000) })
          if (!r?.ok) throw new Error(`${agent} did not answer: ${r?.error ?? 'no result'}`)
          return r.text ?? JSON.stringify(r.structured)
        }, { graceMs: 75_000 })
      }
      case 'ask_team': {
        const team = String(a.team ?? '')
        registry.getTeam(team)
        if (!org.canReach(me, 'teams', team)) throw new Error(`${team} is not one of your teams`)
        return this.startJob(me, 'team', team, str(a.message, 12000), ctx.lane, null, { purpose: a.purpose || this.purposeOf(me, ctx.lane, 'team') })
      }
      case 'ask_super_team': {
        const id = String(a.id ?? '')
        this.co.supers.get(id)
        if (!org.canReach(me, 'superTeams', id)) throw new Error(`${id} is not one of your super teams`)
        return this.startJob(me, 'super-team', id, str(a.message, 12000), ctx.lane, null, { purpose: a.purpose || this.purposeOf(me, ctx.lane, 'super-team') })
      }
      case 'delegate': {
        const child = this.store.read().agents.find(x => x.id === a.to && x.parent === me.id)
        if (!child) throw new Error(`${a.to} is not a super agent directly below you`)
        if (child.paused) throw new Error(`${child.id} is paused (the company is in cycle mode)`)
        this.trigger({ source: 'super-agent', kind: 'delegated', to: child.id, replyTo: me.id, replyLane: workLane(ctx.lane), text: `From ${me.title ?? me.id} (above you): ${str(a.message, 10000)}` })
        return `Delegated to ${child.id}. Its answer will reach you as an event.`
      }
      case 'list_org': return org.list(me)
      case 'create_agent_direct': return org.createAgent(me, a)
      case 'staff': return this.#staff(me, a, ctx)
      case 'update_agent': {
        let prev = null
        try { prev = this.forge.registry.getAgent(String(a.name ?? '')) } catch {}
        const out = org.updateAgent(me, a)
        if (prev) this.growth.recordChange(prev.name, prev, me.id, [a.skills ? `skills ${a.skills.join(', ')}` : '', a.role ? 'instructions' : '', a.model ? `model ${a.model}` : '', a.effort ? `effort ${a.effort}` : ''].filter(Boolean).join('; ') || 'description')
        return `${out} Its work is scored from now on; if it gets worse the change is rolled back.`
      }
      case 'create_team_direct': return org.createTeam(me, a)
      case 'create_super_team': return org.createSuperTeam(me, a)
      case 'create_super_agent': return org.createSuperAgent(me, a)
      case 'find_skills': return org.findSkills(a.query)
      case 'list_repo_skills': return org.listRepoSkills(String(a.repo ?? ''))
      case 'install_skill': return org.installSkill(me, a, api)
      case 'update_plan': {
        let plan
        this.store.update(s => {
          const x = s.agents.find(y => y.id === me.id)
          if (!x) return
          plan = rewritePlan(x.plan, a, ctx)
          if (x.plan) (x.planHistory ??= []).push({ at: x.plan.updatedAt, focus: x.plan.focus })
          x.planHistory = (x.planHistory ?? []).slice(-20)
          x.plan = plan
        })
        const ready = readyItems(plan)
        return `Plan saved; the owner sees it. Item ids: ${plan.todo.map(t => `${t.id} "${clip(t.text, 50)}"`).join('; ')}.${ready.length ? ` Ready to start now: ${ready.map(t => t.id).join(', ')}.` : ''}`
      }
      case 'plan_items': {
        let r
        this.store.update(s => { const x = s.agents.find(y => y.id === me.id); if (!x) return; r = editItems(x.plan, a, ctx); x.plan = r.plan })
        return `${r.lines.join('\n')}\nItems ready to start: ${readyItems(r.plan).map(t => t.id).join(', ') || 'none'}.`
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

  /**
   * The purpose work started in a lane serves: the initiative of an "ini:" lane, the workstream of a "ws:" lane.
   * A plain ask to one agent from the main thread gets a purpose of its own per asker, so nothing lands in a
   * shared pile. Teams and super teams asked from the main thread use their team memory.
   */
  purposeOf(me, lane = 'main', kind = 'agent') {
    const l = String(lane ?? 'main')
    if (l.startsWith('ini:')) return purposeOf(this.co.read().initiatives.find(i => i.id === l.slice(4)) ?? { id: l.slice(4), title: 'initiative' })
    if (l.startsWith('ws:')) return `ws-${l.slice(3)}`
    return kind === 'agent' ? `for-${me.id}` : undefined
  }

  /** staff: one creation path, with the reason recorded (plugins/company/lib/staff.js). */
  async #staff(me, a, ctx) {
    const { registry } = this.forge
    const org = this.org
    const purpose = str(a.purpose, 160).trim() || this.purposeOf(me, ctx.lane, a.unit === 'team' ? 'team' : 'agent')
    if (!purpose) throw new Error('name the purpose')
    const leads = this.co.read().departments.map(d => d.lead)
    const need = { capability: str(a.capability, 2000), purpose, kind: a.kind === 'builder' ? 'builder' : 'analyst', fresh: a.fresh === true, name: a.name, description: a.description, role: a.role, excludeLeads: leads }
    if (a.unit === 'team') {
      const cands = teamCandidates(registry, need)
      const best = cands[0]
      if (best && best.fit >= 1.2) {
        const dir = teamInstance(registry, best.name, need)
        org.own(me, 'teams', best.name)
        this.say({ from: me.id, kind: 'org', text: `Staffing: team ${best.name} for "${purpose}" (fit ${best.fit}); its memory for this purpose is ready.` })
        return `REUSE team ${best.name} (fit ${best.fit}: ${best.description}). Its memory for "${purpose}": ${dir}.\nUse ask_team with team "${best.name}" and purpose "${purpose}".`
      }
      if (!a.name || !(a.members ?? []).length) return `No existing team fits well (best: ${best ? `${best.name}, fit ${best.fit}` : 'none'}). To create one, call staff again with unit team, a name (${P.prefix}<mission>) and members (existing agents; staff agents first if needed).`
      const bad = teamNameProblem(a.name, P.prefix)
      if (bad) throw new Error(bad)
      const out = org.createTeam(me, { name: a.name, description: a.description ?? need.capability, members: a.members })
      const name = a.name.startsWith(P.prefix) ? a.name : `${P.prefix}${a.name}`
      try { teamInstance(registry, name, need) } catch {}
      return `CREATE team: ${out} Best existing fit was ${best ? `${best.name} (${best.fit})` : 'none'}.\nUse ask_team with team "${name}" and purpose "${purpose}".`
    }
    const d = await this.#withApi(`staffing for ${me.id}`, api => staffDecide(registry, api, need))
    const r = await staffApply(registry, d, need, {
      by: me.id,
      createFn: async () => {
        if (!a.name || !a.role) throw new Error(`nothing existing fits (${d.reason}); to create an agent call staff again with name (${P.prefix}<specialty>-<function>), description and role`)
        const bad = agentNameProblem(a.name.startsWith(P.prefix) ? a.name : `${P.prefix}${a.name}`, P.prefix)
        if (bad) throw new Error(bad)
        org.createAgent(me, { name: a.name, description: a.description ?? need.capability, role: a.role, kind: need.kind, model: a.model, skills: a.skills })
        return a.name.startsWith(P.prefix) ? a.name : `${P.prefix}${a.name}`
      },
      // updateAgent appends the template's rules itself: hand it the role without them
      updateFn: async (agent, change) => { const cur = registry.getAgent(agent); const own = [P.hardRules, P.workerRules, P.superRules].filter(Boolean).reduce((r, x) => r.split(x).join(''), String(cur.role ?? '')).trim(); org.updateAgent(me, { name: agent, role: `${own}\n\n# Added ${now().slice(0, 10)}\n${str(change, 2000)}`, why: d.reason }) },
    })
    org.own(me, 'agents', r.agent)
    this.say({ from: me.id, kind: 'org', text: `Staffing: ${d.action} ${r.agent} for "${purpose}". ${clip(d.reason, 300)}` })
    return `${r.text}\nCandidates considered: ${d.candidates.map(c => `${c.name} (fit ${c.fit})`).join(', ') || 'none'}. Decided by ${d.source}.`
  }

  /** Run fn(api) as a small engine run of its own (visible in Runs, cost charged) and return its result. */
  async #withApi(label, fn) {
    const { done } = this.forge.engine.startCustom(label, api => fn(api), {}, { cwd: WORKDIR })
    const st = await done
    this.co.charge(st.costUsd, label)
    if (st.status !== 'completed') throw new Error(String(st.error ?? st.status).split('\n')[0])
    return st.result
  }

  /** A message to the owner. A question goes through Company.askOwner: the host decides whether it is sent. */
  #replyOwner(me, a) {
    const text = str(a.text, 6000).trim()
    if (text.length < 10) throw new Error('say what the owner needs to know')
    const purpose = a.purpose ?? (a.question === true ? 'question' : 'result')
    if (purpose === 'cannot-finish') {
      const wait = this.growth.guard(me, { action: 'tell the owner it cannot be finished', ref: `owner:${slug(text, 40)}`, title: clip(text, 160), attempts: a.attempts, exempt: a.exempt, challenge: a.challenge })
      if (wait) return wait
    }
    if (purpose !== 'question') { this.say({ from: me.id, text, kind: purpose === 'cannot-finish' ? 'cannot-finish' : 'message' }); return 'Sent.' }
    if (!str(a.ifNoAnswer, 600).trim()) throw new Error('a question needs ifNoAnswer: what you do until the owner answers')
    const r = this.co.update(s => this.co.askOwner(s, { from: me.id, question: text, options: a.options, recommendation: a.recommendation, why: '', category: a.category, ifNoAnswer: a.ifNoAnswer }))
    if (r.status === 'auto') return `Not sent. This is an internal matter, so it is yours to decide: go with "${r.rec.choice}" and continue. It is recorded as decided by the company; the owner can overrule it.`
    if (r.status === 'held') return `Held. Another question is already waiting for the owner, or today's limit is reached. Continue with: ${r.rec.ifNoAnswer}. It will be asked when the owner is free; do not ask again.`
    this.say({ from: me.id, text: `${text}${r.rec.recommendation ? `\nRecommended: ${r.rec.recommendation}` : ''}\nMeanwhile: ${r.rec.ifNoAnswer}`, question: true })
    return `Asked (${r.rec.category}). It waits under "Needs you". Continue with: ${r.rec.ifNoAnswer}. The answer reaches the next company cycle; do not wait for it.`
  }

  /** The critique panel: every critic of the profile reads the ticket's folder through its own lens, at once. */
  async #critique(me, a, api) {
    const t = this.#myTicket(this.store.read(), me, a.ticket)
    const critics = P.critics.filter(c => { try { this.forge.registry.getAgent(c.agent); return true } catch { return false } })
    if (!critics.length) throw new Error('this company has no critics set up')
    const charter = this.co.read().charter
    const out = await api.parallel(critics.map(c => async () => {
      const r = await api.agent(c.agent, [
        `You are on the critique panel for "${t.title}". The work is in the current directory; read it, do not take the builder's word for it.`,
        `Your lens: ${c.lens}.`,
        `The brief it was built to:\n${clip(t.brief, 3000)}\nDone when: ${clip(t.doneWhen, 800)}`,
        `The company's goal: ${charter.mission}`,
        a.focus ? `The lead most wants judged: ${str(a.focus, 600)}` : '',
        `Judge it against the best work in its field, not against the effort spent. Be specific: name the file or the moment, and the fix. Do not ask for evidence this environment cannot produce.`,
      ].filter(Boolean).join('\n\n'), { schema: CRITIQUE, label: `critic:${c.agent}`, full: true, cwd: t.dir, signal: AbortSignal.timeout(20 * 60_000) })
      return { critic: c.agent, lens: c.lens, ...(r?.structured ?? { error: r?.error ?? 'no verdict' }) }
    }))
    const got = out.filter(x => x && !x.error)
    const scores = got.map(x => Math.min(1, Math.max(0, Number(x.score) || 0)))
    const summary = { ts: now(), by: me.id, critics: got.length, min: scores.length ? Math.min(...scores) : null, mean: scores.length ? Math.round(100 * scores.reduce((n, x) => n + x, 0) / scores.length) / 100 : null, mustFix: got.reduce((n, x) => n + (x.mustFix?.length ?? 0), 0) }
    this.store.update(s => { const y = s.tickets.find(z => z.id === t.id); if (y) { (y.critiques ??= []).push(summary); y.critiques = y.critiques.slice(-12) } })
    recordCritique(t, summary, got)
    for (const x of got) this.growth.gaps(x.capabilityGaps ?? [], { source: `critique by ${x.critic}`, ticket: t.id, by: x.critic })
    if (summary.mean != null) this.growth.score(t.worker, summary.mean, { source: 'critique', ticket: t.id, attached: t.lastAttached ?? [] })
    if (summary.mustFix && t.status === 'open') this.store.update(s => { const y = s.tickets.find(z => z.id === t.id); if (y) (y.reviews ??= []).push({ kind: 'critique', ts: now(), pass: false, text: `${summary.mustFix} must-fix item(s); lowest score ${summary.min}` }) })
    return [
      `Critique of ticket ${t.id} "${t.title}": ${got.length} of ${critics.length} critics answered; lowest score ${summary.min ?? '-'}, mean ${summary.mean ?? '-'}; ${summary.mustFix} must-fix item(s). The gate's bar is ${charter.gate.minConfidence}.`,
      ...out.filter(Boolean).map(x => x.error ? `## ${x.critic}: no verdict (${x.error})` : `## ${x.critic} (score ${x.score})\n${x.verdict}\nMust fix:\n${(x.mustFix ?? []).map(m => `- ${m}`).join('\n') || '- nothing'}\nWould elevate:\n${(x.wouldElevate ?? []).map(m => `- ${m}`).join('\n') || '- nothing'}`),
      summary.mustFix ? 'Send the must-fix items (and the best of the rest) to the ticket with message_ticket, then critique again after the fix pass.' : 'Nothing must be fixed. It can go to the gate.',
    ].join('\n\n')
  }

  #myTicket(s, me, id) {
    const t = s.tickets.find(x => x.id === id)
    if (!t) throw new Error(`no ticket ${id}`)
    if (me.parent && t.owner !== me.id) throw new Error('that ticket belongs to another super agent')
    return t
  }

  // ---------------- asks that take time (teams, super teams)
  /**
   * Background work for a leader: an ask to a team or super team, or `fn` run as its own engine run (an agent, a
   * critique panel, a hire). The result reaches the leader's thread as an event. With graceMs, a result that is ready
   * within that time comes back in the same turn instead.
   */
  async startJob(me, kind, target, message, lane = 'main', fn = null, { graceMs = 0, purpose } = {}) {
    // the work runs under its purpose: agents in it use that purpose's memory (plugins/agent-forge/lib/memctx.js)
    purpose ??= fn ? this.purposeOf(me, lane, kind) : undefined
    if (purpose) return withMemory({ purpose }, () => this.#startJob(me, kind, target, message, lane, fn, { graceMs, purpose }))
    return this.#startJob(me, kind, target, message, lane, fn, { graceMs })
  }

  async #startJob(me, kind, target, message, lane = 'main', fn = null, { graceMs = 0, purpose } = {}) {
    const { chats, engine } = this.forge
    const supers = this.co.supers
    const s0 = this.store.read()
    if (this.live.jobs.size >= s0.settings.maxJobs) throw new Error(`${this.live.jobs.size} background asks are running, the limit is ${s0.settings.maxJobs}; wait for one to report, or open a ticket`)
    if (kind === 'super-team' && supers.list().find(x => x.id === target)?.busy) throw new Error(`super team ${target} is still working; ask one of its teams (ask_team) or wait for its result`)
    const id = newId('j')
    const back = workLane(lane)
    let work
    let runIdOf = null
    if (fn) {
      const { id: runId, done } = engine.startCustom(`${kind}: ${target}`, api => fn(api), { job: id, from: me.id }, { cwd: WORKDIR, meta: { superJob: id } })
      work = done.then(st => { this.co.charge(st.costUsd, `${kind} ${target} for ${me.id}`); if (st.status !== 'completed') throw new Error(String(st.error ?? st.status).split('\n')[0]); return typeof st.result === 'string' ? st.result : JSON.stringify(st.result) })
      runIdOf = runId
    } else if (kind === 'team') {
      // one chat per team and purpose, so a team's discussion of one initiative is not mixed with another's
      const chatKey = purpose ? `${target}@${purposeSlug(purpose)}` : target
      let chatId = this.store.read().teamChats[chatKey]
      try { if (chatId) chats.get(chatId) } catch { chatId = null }
      // a second ask while the team's chat is still answering the first gets a chat of its own
      const busy = chatId && chats.list().find(r => r.id === chatId)?.busy
      if (!chatId || busy) {
        // the super agent's team chats live in the company's chat project (next to the department chats), not in General
        const project = (() => { try { return chats.listProjects().projects.find(p => p.name === P.superProject?.name)?.id } catch { return undefined } })()
        const fresh = chats.create({ title: `${me.title ?? me.id} · ${target}${purpose ? ` · ${clip(purpose, 40)}` : ''}${busy ? ' (parallel)' : ''}`, team: target, mode: 'parallel', cwd: WORKDIR, ...(purpose ? { purpose } : {}), ...(project ? { project } : {}) }).id
        if (!chatId) this.store.update(s => { s.teamChats[chatKey] = fresh })
        chatId = fresh
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
    this.store.update(s => { s.jobs.push({ id, kind, target, from: me.id, lane: back, message: str(message, 2000), status: 'running', startedAt: now(), ...(runIdOf ? { runId: runIdOf } : {}) }) })
    this.live.jobs.set(id, true)
    // with graceMs the turn waits briefly: a result in time is returned in the turn, a later one becomes an event
    let mode = graceMs ? 'waiting' : 'event'
    let early = null
    const notify = r => this.trigger({ source: kind, kind: 'reply', to: me.id, lane: back, text: `${r.ok ? 'Reply' : 'No reply (it failed)'} from ${kind} ${target} to your message "${clip(message, 200)}":\n\n${clip(r.text, 9000)}` })
    const settled = work.then(text => ({ ok: true, text }), e => ({ ok: false, text: e?.message || String(e ?? '') || `the ${kind} ended without an answer or an error message` })).then(r => {
      this.store.update(s => { const j = s.jobs.find(x => x.id === id); if (j) { j.status = r.ok ? 'done' : 'failed'; j.endedAt = now(); j.result = clip(r.text, 4000) } })
      if (mode === 'event') notify(r); else early = r
      return r
    }).finally(() => this.live.jobs.delete(id))
    if (graceMs) {
      const quick = await Promise.race([settled, new Promise(r => setTimeout(() => r(null), graceMs).unref?.())])
      if (quick) { mode = 'in-turn'; return quick.ok ? quick.text : `${target} did not answer: ${quick.text}` }
      mode = 'event'
      if (early) notify(early)
    }
    return `Sent to ${kind} ${target}. The reply will reach you as an event; start other work meanwhile instead of waiting for it.`
  }

  // ---------------- tickets
  /** A know-how search for a ticket; the ticket waits for it (at most 16 minutes). */
  #knowHowFor(ticketId, { problem, why }) {
    const t = this.store.read().tickets.find(x => x.id === ticketId)
    if (!t || t.waitKnowHow) return
    this.store.update(s => { const y = s.tickets.find(z => z.id === ticketId); if (y) y.waitKnowHow = true })
    const release = () => this.store.update(s => { const y = s.tickets.find(z => z.id === ticketId); if (y) y.waitKnowHow = false })
    const timer = setTimeout(release, 16 * 60_000); timer.unref?.()
    this.growth.knowHow({ problem, context: `${t.title}\n${clip(t.brief, 3000)}\nDone when: ${clip(t.doneWhen, 800)}`, forAgent: t.worker, ticket: t, why, by: t.owner })
      .catch(e => this.log(`know-how ${t.short}: ${e.message}`)).finally(() => { clearTimeout(timer); release() })
  }

  /** open_ticket for the company leaders' tools (the COO's decide_build). */
  openTicketFor(me, a, ctx) { return this.#openTicket(me, a, ctx) }

  #openTicket(me, a, ctx = { lane: 'main' }) {
    const s = this.store.read()
    if (this.store.day(s).tickets >= s.settings.maxTicketsPerDay) throw new Error(`the limit of ${s.settings.maxTicketsPerDay} new tickets a day is reached`)
    const title = str(a.title, 140).trim()
    const brief = str(a.brief, 12000).trim()
    if (title.length < 6 || brief.length < 80) throw new Error('a ticket needs a title and a brief a newcomer could act on (80+ characters)')
    const all = this.store.read().tickets
    const dependsOn = [...new Set((a.dependsOn ?? []).map(String))].slice(0, 12)
    for (const d of dependsOn) if (!all.some(x => x.id === d)) throw new Error(`dependsOn: no ticket ${d}`)
    const workstream = a.workstream ? slug(a.workstream, 24) : undefined
    const talent = a.talent === 'principal' ? 'principal' : undefined
    const lane = workLane(ctx.lane, workstream)
    const planItem = a.planItem && me.plan?.todo?.some(t => t.id === String(a.planItem)) ? String(a.planItem) : undefined
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
      st.tickets.push({ id, short, title, brief, doneWhen: str(a.doneWhen, 3000), owner: me.id, worker, dir, status: 'open', createdAt: now(), inputs: [], assignments: [], attention: null, ...(build ? { build } : {}), ...(workstream ? { workstream } : {}), ...(dependsOn.length ? { dependsOn } : {}), ...(talent ? { talent } : {}), lane, ...(planItem ? { planItem } : {}) })
      this.store.day(st).tickets++
      if (planItem) { const x = st.agents.find(y => y.id === me.id); const it = x?.plan?.todo?.find(y => y.id === planItem); if (it) { it.status = 'doing'; it.ref = id; it.updatedAt = now() } }
    })
    if (build) { try { this.co.setBuild(build, 'accepted') } catch {} }
    this.say({ from: me.id, kind: 'ticket', ticket: id, text: `Opened ticket "${title}".` })
    // new or hard work starts from the best known methods: the scout searches before the first turn
    if (a.research === true || talent === 'principal') this.#knowHowFor(id, { problem: `${title}: the best known methods`, why: 'at the start of new or hard work' })
    return `Ticket ${id} opened${dependsOn.length ? `; it starts when ${dependsOn.join(', ')} ${dependsOn.length === 1 ? 'is' : 'are'} delivered` : '; a worker starts shortly'}. Its report will reach you as a trigger.`
  }

  /** Planned tickets whose dependencies are done open by themselves, so the next step starts without a turn. */
  #autostart() {
    const s = this.store.read()
    for (const me of s.agents) {
      if (me.paused || kindOf(me) === 'dept') continue
      const c = this.#capacity(s, me)
      let room = Math.max(0, c.share - c.running - c.queued)
      for (const it of readyItems(me.plan).filter(t => t.ticket && !t.ref)) {
        if (room <= 0) break
        try {
          const out = this.#openTicket(me, { ...it.ticket, workstream: it.workstream, planItem: it.id }, { lane: 'main' })
          room--
          this.log(`plan item ${me.id}/${it.id} opened its ticket: ${clip(out, 120)}`)
        } catch (e) {
          this.store.update(x => { const it2 = x.agents.find(y => y.id === me.id)?.plan?.todo?.find(y => y.id === it.id); if (it2) { it2.status = 'blocked'; it2.note = str(`could not open its ticket: ${e.message}`, 300); it2.updatedAt = now() } })
          this.trigger({ source: 'system', kind: 'plan-item-blocked', to: me.id, text: `Plan item ${it.id} "${it.text}" could not open its ticket by itself: ${e.message}. Decide what to do with it.` })
        }
      }
    }
  }

  #dispatch() {
    try { this.#autostart() } catch (e) { this.log(`autostart: ${e.message}`) }
    const s = this.store.read()
    // fair shares: each leader with work gets an equal share of the worker slots; slots left over go to whoever waits
    const owners = new Set(s.tickets.filter(t => t.status === 'open' && (this.live.tickets.has(t.id) || stage(t, false) === 'queued')).map(t => t.owner))
    const share = shareOf(s.settings.maxWorkers, owners.size)
    const runningOf = o => [...this.live.tickets.keys()].filter(id => s.tickets.find(x => x.id === id)?.owner === o).length
    const deferred = []
    for (const t of s.tickets) {
      if (this.live.tickets.size >= s.settings.maxWorkers) break
      if (t.status !== 'open' || this.live.tickets.has(t.id)) continue
      if (stage(t, false) !== 'queued') continue
      if (t.waitKnowHow || t.verifying) continue // the scout or the verifier is on it
      if (t.dependsOn?.length) {
        const deps = t.dependsOn.map(d => s.tickets.find(x => x.id === d)).filter(Boolean)
        const dead = deps.find(d => d.status === 'ended' && d.outcome !== 'completed')
        if (dead && !t.depWarned) {
          this.store.update(x => { const y = x.tickets.find(z => z.id === t.id); y.depWarned = true })
          this.trigger({ source: 'ticket', kind: 'dependency', to: t.owner, ticket: t.id, text: `Ticket ${t.id} "${t.title}" waits for ticket ${dead.id} "${dead.title}", which ended without being delivered (${dead.outcome}). Decide: reopen ${dead.id} with message_ticket, or stop ${t.id}, or replace the dependency with a new ticket.` })
        }
        if (deps.some(d => !(d.status === 'ended' && d.outcome === 'completed'))) continue
      }
      const limit = s.settings.maxAssignments + (t.extraTurns ?? 0)
      if (t.assignments.length >= limit) {
        if (this.co.read().charter.autonomy.level === 'ask') {
          this.store.update(x => { const y = x.tickets.find(z => z.id === t.id); y.attention = { question: `This ticket used ${y.assignments.length} worker turns without finishing. Retry gives it 4 more; Stop ends it.`, ts: now() } })
          this.say({ from: 'system', kind: 'report', ticket: t.id, question: true, text: `Ticket "${t.title}" used ${t.assignments.length} worker turns without finishing. Retry or stop it.` })
        } else if (!t.autoExtended) {
          // once: four more turns, and the lead is told so it can narrow the scope
          this.store.update(x => { const y = x.tickets.find(z => z.id === t.id); y.autoExtended = true; y.extraTurns = (y.extraTurns ?? 0) + 4 })
          this.trigger({ source: 'ticket', kind: 'turn-limit', to: t.owner, ticket: t.id, text: `Ticket ${t.id} "${t.title}" used ${t.assignments.length} worker turns without finishing. It has been given 4 more, once. Read it (read_ticket) and decide now: narrow its scope or correct its direction with message_ticket, split the rest into a new ticket, or stop it. This is yours to decide.` })
        } else if (this.growth.rescueTicket(t)) {
          // before stopping: a rescue (know-how search, the strongest model) and four more turns
          this.store.update(x => { const y = x.tickets.find(z => z.id === t.id); y.extraTurns = (y.extraTurns ?? 0) + 4 })
          this.#knowHowFor(t.id, { problem: `${t.title}: how to finish it after ${t.assignments.length} turns that did not`, why: 'the ticket hit its turn limit' })
          this.trigger({ source: 'growth', kind: 'rescue', to: t.owner, ticket: t.id, text: `Ticket ${t.id} "${t.title}" used ${t.assignments.length} worker turns without finishing. Before stopping it, the host started a rescue: a know-how search (its brief goes to KNOW-HOW.md in the folder) and the strongest model for 4 more turns. Narrow or redirect it with message_ticket if you see a better route; it is stopped if those turns do not finish it.` })
        } else {
          this.#stopTicket(t.id, `stopped by the host: ${t.assignments.length} worker turns without finishing`)
          this.growth.afterAction({ ...t, outcome: 'stopped' }, { why: 'stopped by the host after its turn limit and a rescue' }).catch(() => {})
          this.say({ from: 'system', kind: 'report', ticket: t.id, text: `Ticket "${t.title}" was stopped after ${t.assignments.length} worker turns without finishing. Its lead decides what follows.` })
          this.trigger({ source: 'ticket', kind: 'stopped', to: t.owner, ticket: t.id, text: `Ticket ${t.id} "${t.title}" was stopped: it used ${t.assignments.length} worker turns, including its one extension, without finishing. What exists is in ${t.dir}. Decide what follows: a smaller ticket that reuses that folder's work, a different approach, or nothing.` })
        }
        continue
      }
      if (runningOf(t.owner) >= share) { deferred.push(t); continue }
      this.#assign(t, s)
    }
    for (const t of deferred) {
      if (this.live.tickets.size >= s.settings.maxWorkers) break
      this.#assign(t, s)
    }
  }

  #assign(t, s) {
    const { engine } = this.forge
    const aid = newId('a')
    const fresh = t.inputs.filter(i => !i.read)
    const prior = t.assignments.filter(x => x.report).slice(-3)
    // know-how: skills from the library that fit (first turn), the worker's playbook and trials, the company's lessons
    const lib = t.libSkills ?? this.growth.match(`${t.title} ${t.brief}`, 2).map(x => x.name)
    const attach = this.growth.attach(t.worker, lib)
    const lessons = this.growth.lessonsFor(`${t.title} ${t.brief}`, 5, 'builder')
    // struggling: fresh eyes and the strongest model from the third turn (or when a review asked for it)
    const stuck = t.boost || (t.assignments.length >= 2 && !prior.some(x => x.report.status === 'ready'))
    let knowHowFile = false
    try { knowHowFile = fs.existsSync(path.join(t.dir, 'KNOW-HOW.md')) } catch {}
    const prompt = [
      `# Ticket: ${t.title}`,
      `Your folder (current directory): ${t.dir}\nTurn ${t.assignments.length + 1} on this ticket. Read TICKET.md and NOTES.md first.`,
      `## Brief\n${t.brief}`,
      `## Done when\n${t.doneWhen}`,
      t.dependsOn?.length ? `## Built before this ticket (read-only to you; build on it, copy what you need into your folder)\n${t.dependsOn.map(d => s.tickets.find(x => x.id === d)).filter(Boolean).map(d => `- ${d.id} "${d.title}"${d.workstream ? ` (${d.workstream})` : ''}: ${d.dir}`).join('\n')}` : '',
      prior.length ? `## Your earlier reports\n${prior.map(x => `- (${x.report.status}) ${clip(x.report.summary, 900)}`).join('\n')}` : '',
      fresh.length ? `## New since your last turn\n${fresh.map(i => `- ${i.kind === 'person' ? 'The owner' : i.kind === 'lead' ? `Your lead (${i.from})` : i.kind}: ${i.text}`).join('\n')}` : '',
      `## Environment\n${P.worker.environment(t)}${P.hasEngine ? '\n- You cannot change the engine yourself. When the ticket needs an engine change, deliver it as one unified diff file in your folder (for example change.patch) that applies with "git apply" from inside the engine folder and touches only quantcore/, config/ and tests/, with the tests that prove it. Your lead submits it; it is audited, the owner approves, and code installs it.' : ''}\n- The company goal: ${this.co.read().charter.mission}`,
      knowHowFile ? '## Know-how\nKNOW-HOW.md in your folder holds the best known methods for this work, found by the Skill Scout. Use them; say in NOTES.md which method you chose and why.' : '',
      lessons.length ? `## What the company learned that may apply\n${lessons.map(l => `- (${l.kind}) ${l.text}`).join('\n')}` : '',
      attach ? `## Skills attached to this turn\n${attach.attached.join(', ')}: read them before you start (your playbook holds what earlier tickets taught).` : '',
      stuck ? `## Fresh eyes\nThis is turn ${t.assignments.length + 1} and the work is not done. Do not repeat what did not work. Step back: list at least three distinct approaches (different method, data or decomposition), pick the most promising with a reason, and say in NOTES.md and in "approaches" what you tried and what happened. If you need know-how you do not have, put it in needKnowHow.` : '',
      `## Report\nWhen you stop, update NOTES.md, then report in the required form. Use "progress" when you made real progress and need another turn; "ready" only when every done-when condition holds and you checked it yourself: an independent verifier checks it before the ticket closes. List the approaches you tried. Use needKnowHow when you are stuck, proposeSkill for a method worth keeping, ownerActions for steps only the owner can take.`,
    ].filter(Boolean).join('\n\n')
    const minutes = s.settings.assignmentMinutes
    const { id: runId, done } = engine.startCustom(`ticket: ${t.short}`, async api => {
      const strong = t.talent === 'principal' || stuck
      const res = await api.agent(t.worker, prompt, { schema: REPORT, label: `worker:${t.short}`, full: true, cwd: t.dir, signal: AbortSignal.timeout(minutes * 60_000), ...(strong ? { model: P.models.ceo, effort: stuck ? 'max' : P.models.ceoEffort ?? 'xhigh' } : {}), ...(attach ? { overrides: { skills: attach.skills } } : {}) })
      return { ok: !!res?.ok, report: res?.structured ?? null, error: res?.error ?? null, turns: res?.turns }
    }, { ticket: t.id, title: t.title }, { cwd: t.dir, meta: { superTicket: t.id } })
    this.live.tickets.set(t.id, { runId })
    this.store.update(x => {
      const y = x.tickets.find(z => z.id === t.id)
      for (const i of y.inputs) if (!i.read) { i.read = true; i.assignment = aid }
      y.assignments.push({ id: aid, runId, status: 'running', startedAt: now(), ...(stuck ? { boosted: true } : {}) })
      y.libSkills = lib; y.lastAttached = attach?.attached ?? []
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
    { const tk = this.store.read().tickets.find(x => x.id === ticketId); if (tk) recordTicketReport(this.co, tk, rep, st.id) }
    const verifyOn = this.store.read().settings.growth?.verify !== false
    let t
    this.store.update(s => {
      t = s.tickets.find(x => x.id === ticketId)
      const a = t?.assignments.find(x => x.id === aid)
      if (!t || !a) return
      a.status = 'ended'; a.endedAt = now(); a.report = rep
      if (t.status !== 'open') return // stopped while working
      const unread = t.inputs.some(i => !i.read)
      if ((rep.approaches ?? []).length) t.approaches = [...new Set([...(t.approaches ?? []), ...rep.approaches.map(x => str(x, 300))])].slice(-12)
      // "ready" is checked by an independent verifier before the ticket closes
      if (rep.status === 'ready' && !unread && verifyOn) t.verifying = true
      else if (rep.status === 'ready' && !unread) { t.status = 'ended'; t.outcome = 'completed'; t.endedAt = now() }
      else if (rep.status === 'dropped') { t.status = 'ended'; t.outcome = 'dropped'; t.endedAt = now() }
      else if (rep.status === 'progress') t.inputs.push({ id: newId('i'), ts: now(), kind: 'continue', text: 'Continue from NOTES.md.' })
      // a worker's question goes to its lead; only in "ask" mode does it wait for the owner
      if (rep.question && rep.status !== 'ready' && this.co.read().charter.autonomy.level === 'ask') t.attention = { question: rep.question, ts: now() }
      if (proposal) t.proposal = { ...proposal, status: 'queued' }
      syncItem(s, t)
    })
    if (!t) return
    if (rep.ownerActions?.length) this.say({ from: 'worker', kind: 'owner-action', ticket: t.id, question: true, text: `Ticket "${t.title}" needs a step only you can take:\n${rep.ownerActions.slice(0, 5).map(x => `- ${str(x, 400)}`).join('\n')}` })
    if (str(rep.proposeSkill, 3000).trim().length > 40) this.growth.smith({ reason: `proposed by the builder of ticket ${t.id}`, material: `${str(rep.proposeSkill, 3000)}\n\nFrom ticket "${t.title}": ${clip(rep.summary, 1500)} [${t.dir}]`, appliesTo: 'builder', agents: [t.worker] }).catch(() => {})
    if (t.verifying) { this.#verifyTicket(t.id); return }
    // trouble, or the worker asked: the Skill Scout searches before the next turn
    const turns = t.assignments.length
    const trouble = ['blocked', 'failed'].includes(rep.status) || (rep.status === 'progress' && turns >= 2 && turns - (t.knowHowTurn ?? -9) >= 2)
    if (t.status === 'open' && str(rep.needKnowHow, 1500).trim()) this.#knowHowFor(t.id, { problem: str(rep.needKnowHow, 1500), why: 'the worker asked for it' })
    else if (t.status === 'open' && trouble) this.#knowHowFor(t.id, { problem: `${t.title}: the obstacle in the last report: ${clip(rep.summary, 800)}`, why: `trouble (${rep.status} after ${turns} turn${turns === 1 ? '' : 's'})` })
    if (t.status === 'ended') this.growth.afterAction(t, { why: `ended ${t.outcome}` }).catch(() => {})
    if (rep.status === 'ready' && t.build && t.status === 'ended') { try { this.co.setBuild(t.build, 'done') } catch {} }
    if (rep.status !== 'progress') {
      this.say({ from: 'worker', kind: 'report', ticket: t.id, question: !!t.attention, text: `Ticket "${t.title}" — ${rep.status}. ${clip(rep.summary, 1200)}${rep.question ? `\nQuestion: ${rep.question}` : ''}` })
      this.trigger({ source: 'ticket', kind: 'report', to: t.owner, ticket: t.id, text: `Worker report on ticket ${t.id} "${t.title}": ${rep.status}.\n${clip(rep.summary, 4000)}${rep.question ? (t.attention ? `\nIts question (the owner sees it too): ${rep.question}` : `\nIts question is for you, not the owner: ${rep.question}\nAnswer it now with message_ticket (the ticket resumes). You decide it. Only if it is an owner-only matter, ask through reply_owner and tell the ticket what to do meanwhile.`) : ''}\nFiles: ${(rep.files ?? []).join(', ') || '-'}\nFolder: ${t.dir}${proposal ? '\nIt sent a proposal to the gate; the result will reach you.' : ''}\nDecide what follows yourself: nothing, new instructions to the ticket (message_ticket), a critique, a follow-up ticket, or a short result for the owner. A blocked or failed ticket is yours to resolve; it is not passed to the owner.` })
    }
    if (proposal) this.#gate(t, proposal)
  }

  /** The verifier checks a delivered ticket; it closes only when every done-when condition holds. */
  async #verifyTicket(id) {
    const t = this.store.read().tickets.find(x => x.id === id)
    if (!t) return
    let v = null
    try { v = await this.growth.verify(t) } catch (e) { this.log(`verify ${t.short}: ${e.message}`) }
    const fails = (t.verifyFails ?? 0) + (v && !v.pass ? 1 : 0)
    let y
    this.store.update(s => {
      y = s.tickets.find(z => z.id === id)
      if (!y) return
      y.verifying = false
      ;(y.reviews ??= []).push({ kind: 'verify', ts: now(), pass: v ? v.pass : null, text: v ? str(v.text, 2000) : 'the verifier could not run; accepted on the builder\'s report' })
      if (y.status !== 'open') return
      if (!v || v.pass) { y.status = 'ended'; y.outcome = 'completed'; y.endedAt = now(); syncItem(s, y); return }
      y.verifyFails = fails
      if (fails < 3) y.inputs.push({ id: newId('i'), ts: now(), kind: 'verifier', text: `The independent verifier did not accept your "ready":\n${v.text}\nFix these, check every done-when condition yourself, then report again.` })
    })
    if (!y) return
    const rep = y.assignments.filter(a => a.report).at(-1)?.report ?? { summary: '' }
    if (v) this.growth.score(y.worker, v.pass ? 1 : 0.3, { source: 'verify', ticket: id, attached: y.lastAttached ?? [] })
    if (v?.gaps?.length) this.growth.gaps(v.gaps, { source: 'verifier', ticket: id, by: 'verifier' })
    if (y.status === 'ended') {
      if (y.build) { try { this.co.setBuild(y.build, 'done') } catch {} }
      this.say({ from: 'worker', kind: 'report', ticket: id, text: `Ticket "${y.title}" delivered and verified${fails ? ` (after ${fails} failed check${fails === 1 ? '' : 's'})` : ''}. ${clip(rep.summary, 1000)}` })
      this.trigger({ source: 'ticket', kind: 'report', to: y.owner, ticket: id, text: `Ticket ${id} "${y.title}" is delivered and passed the independent check${fails ? ` after ${fails} failed one${fails === 1 ? '' : 's'}` : ' at the first try'}.\n${clip(rep.summary, 3500)}\nCheck: ${v ? clip(v.text, 800) : 'the verifier could not run'}\nFiles: ${(rep.files ?? []).join(', ') || '-'}\nFolder: ${y.dir}\nDecide what follows. If its quality says something about who built it or the method, use report_gap or propose_skill_update.` })
      const lead = this.store.read().agents.find(a => a.id === y.owner)
      const important = y.talent === 'principal' || !!y.proposal
      if (lead && important && this.store.read().settings.growth?.critiqueImportant !== false) this.startJob(lead, 'critique', id, `critique of "${y.title}" (automatic: important work)`, workLane('main', y.workstream), api2 => this.#critique(lead, { ticket: id }, api2)).catch(e => this.log(`auto critique ${y.short}: ${e.message}`))
      if (y.proposal?.status === 'queued') { const { status, ...p } = y.proposal; this.#gate(y, p) }
      if (y.assignments.length > 1 || fails || y.talent === 'principal') this.growth.afterAction(y, { why: fails ? `delivered after ${fails} failed check(s)` : `delivered in ${y.assignments.length} turns` }).catch(() => {})
      return
    }
    if (fails >= 3) {
      this.say({ from: 'system', kind: 'report', ticket: id, text: `Ticket "${y.title}" failed the independent check ${fails} times. Its lead decides.` })
      this.trigger({ source: 'ticket', kind: 'verify-failed', to: y.owner, ticket: id, text: `Ticket ${id} "${y.title}" failed the independent check ${fails} times.\nLast check: ${clip(v.text, 2000)}\nDecide: a new route (message_ticket, with request_know_how first if the method is the problem), accept it as it is (accept_ticket, if the done-when was wrong), or stop it (stop_ticket, which needs the approaches tried).` })
    } else if (fails === 2 && !y.knowHowAt) this.#knowHowFor(id, { problem: `${y.title}: what the verifier keeps finding: ${clip(v.text, 800)}`, why: 'the independent check failed twice' })
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
      needsYou: tickets.filter(t => t.stage === 'person:answer' || (this.co.read().charter.autonomy.level === 'ask' && t.stage.startsWith('person:'))),
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
