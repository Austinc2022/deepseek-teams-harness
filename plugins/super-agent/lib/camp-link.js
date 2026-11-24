/**
 * The training camp, connected to the leaders. The COO owns the workforce: it opens a camp for a goal, approves the
 * workflow, and the camp trains every role and the team until they pass. The CEO has the same tools.
 *
 *   tools     camp_list, camp_new, camp_status, camp_workflow, camp_change, camp_approve, camp_train, camp_pause,
 *             camp_redo, camp_set, camp_publish, camp_rollback (COO and super agents)
 *   watcher   once a minute, code looks at every camp and does what needs no judgement:
 *               paused by a quota, a busy provider, a restart or an error  -> resumes it, waiting longer each time
 *               passed its final exams ("ready")                           -> publishes it
 *             and tells the COO what needs a decision:
 *               a proposed workflow to approve or change
 *               a pause on the budget or the call limit
 *               a camp that keeps pausing, or that makes no progress
 *               roles or the team that did not pass
 *               what was published
 *   health    a camp that waits or keeps failing is a check on the dashboard
 *
 * A camp the owner or a leader paused on purpose (the page's Pause, camp_pause) is left alone.
 * State: sourceState.camps in the super agent's state (what was last seen per camp); the camps themselves are in
 * forge/camps/ and belong to plugins/training-camp.
 */
import fs from 'node:fs'
import path from 'node:path'
import { now, str, clip, slug } from './store.js'
import { profile as P } from '../../company/lib/profile.js'
import { addDepartment } from '../../company/lib/setup.js'
import { runNamed } from '../../agent-forge/lib/engine.js'
import { SCOUT } from './growth.js'
import { COO_ID } from './company-leaders.js'

const S = { type: 'string' }
const tool = (name, description, properties = {}, required = Object.keys(properties)) => ({ name, description, inputSchema: { type: 'object', properties, required } })
const MIN = 60_000
const WAITS = [2, 10, 20, 40, 60] // minutes before each automatic resume
const TRANSIENT_LIMIT = /429|quota|rate.?limit|usage limit|overloaded|exhausted|cooldown|too many requests|busy|50[023]\b/i
const HARD_LIMIT = /budget|call limit|model calls|maxCalls|limit of \d+ calls/i
// The owner's standing rule: quality first. A leader may train more, or slower, never less: it cannot take a camp
// below these depths (or below camp.protect.floor when the owner set one), and it cannot drop roles from a workflow.
export const FLOOR = { rounds: 2, candidates: 2, 'dataset.train': 5, 'dataset.dev': 4, 'dataset.holdout': 4 }
const QUALITY_RULE = 'The owner\'s rule for training is quality first: never cut roles, coaching rounds, candidates or task sets to fit a quota or a call limit. When a provider limits the camp, train fewer things at once (parallelAgents, parallelCalls) and let it take longer; when a limit of the camp itself blocks it, or the models are too weak, tell the owner what you need (reply_owner).'
const SETTABLE = { rounds: [0, 6], candidates: [1, 4], parallelAgents: [1, 8], parallelCalls: [1, 16], 'dataset.train': [2, 12], 'dataset.dev': [2, 10], 'dataset.holdout': [2, 10] }

export const CAMP_TOOLS = [
  tool('camp_list', 'The training camps: id, goal, status, spend. A training camp trains a set of agents and their team for one goal on generated tasks, tests them on a sealed set, and publishes the ones that pass.'),
  tool('camp_new', 'Open a training camp for a goal: use it when the goal needs a workforce the organisation does not have, or when the existing agents are not good enough at it. An architect proposes the workflow (stages, roles, teams); the proposal reaches you as an event, and nothing trains until you approve it.', { goal: { type: 'string', description: 'the goal the trained team must be able to reach, in plain words' }, name: { type: 'string', description: 'short name' }, idea: { type: 'string', description: 'optional: stages or roles you already have in mind' } }, ['goal']),
  tool('camp_status', 'One camp: status, why it is paused, and the scoreboard of every role (first score, best score, final exam, passed or not).', { id: S }),
  tool('camp_workflow', 'The proposed or approved workflow of a camp: stages, roles, teams.', { id: S }),
  tool('camp_change', 'Ask for a change to a camp\'s workflow in your own words: add stages or roles, reorder, sharpen what a role or a stage delivers. A change that removes a role is undone by code (the owner wants the full team trained), unless you opened the camp yourself and it has never been approved. The new version reaches you as an event; approve it then.', { id: S, request: S }),
  tool('camp_approve', 'Approve the current workflow of a camp and start training. You approve; the owner is not asked. Roles whose definition did not change keep their training.', { id: S }),
  tool('camp_train', 'Start or resume training. Finished work is never repeated.', { id: S }),
  tool('camp_pause', 'Pause a camp on purpose. It stays paused until you or the owner resume it.', { id: S, reason: S }),
  tool('camp_redo', 'Run one part of a camp again: "scout" (find skills), "datasets" (write the tasks again), "rounds" (coach every role again from its first score), or "verify" (the final exams).', { id: S, part: { type: 'string', enum: ['scout', 'datasets', 'rounds', 'verify'] } }),
  tool('camp_set', `Change how a camp trains: ${Object.keys(SETTABLE).join(', ')}. You can train more thoroughly (more rounds, candidates, tasks). The owner wants the agents trained side by side: code already halves the speed when the provider keeps limiting and raises it again afterwards, so lower parallelAgents or parallelCalls yourself only for a reason code cannot see. You cannot go below the owner's depth (${Object.entries(FLOOR).map(([k, v]) => `${k} ${v}`).join(', ')}): quality is not traded for quota. Budget, call limit and models are the owner's.`, { id: S, key: { type: 'string', enum: Object.keys(SETTABLE) }, value: { type: 'number' } }),
  tool('camp_publish', 'Publish a camp\'s trained agents, teams and workflow into the organisation. A camp that passed is published automatically; use this with force to publish what passed when some roles did not.', { id: S, force: { type: 'boolean' } }, ['id']),
  tool('camp_rollback', 'Undo a camp\'s last publish: the agents, teams and workflow go back to what they were.', { id: S }),
  tool('camp_retrain', 'Send an agent that a training camp trained back to training, because its real work keeps falling short. It starts from the agent as it is now; give examples of the real work it got wrong, which become its new practice tasks. The current agent keeps working meanwhile and is replaced only if the retrained one passes its final exam and scores higher. Use it when coaching (a skill, a change of instructions) did not fix a repeated gap.', { agent: { type: 'string', description: 'the agent name' }, why: { type: 'string', description: 'what it keeps getting wrong, concretely' }, examples: { type: 'array', description: 'up to 6 pieces of real work it got wrong', items: { type: 'object', properties: { task: { type: 'string', description: 'the task exactly as it was given, complete and self-contained' }, wrong: { type: 'string', description: 'what was wrong with the result' } }, required: ['task', 'wrong'] } } }, ['agent', 'why']),
  tool('run_workflow', 'Run a published camp workflow from start to finish toward a goal: its trained agents do every stage in order, with the reviews and go / stop decisions the camp trained. It runs in the background for a long time; the full report reaches you as an event, and every agent in it is scored on the work it did. Use it to execute toward the goal with the trained team; run it again with a sharper goal when the result is not there yet.', { workflow: { type: 'string', description: 'the workflow name, as camp_list or camp_status shows it for a published camp' }, goal: { type: 'string', description: 'what this run must achieve, concretely, with what you already know' } }),
]
const NAMES = new Set(CAMP_TOOLS.map(t => t.name))
const hashOf = s => { let h = 0; for (const ch of String(s).slice(0, 200)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h.toString(36) }

export class CampLink {
  constructor(sa, { camps } = {}) {
    this.sa = sa
    this.given = camps ?? null
    this.at = 0
    this.busy = false
  }

  /** The camp service of plugins/training-camp, or null when that plugin is not installed. */
  async cs() {
    if (this.given) return this.given
    if (this.none) return null
    try {
      const { camps } = await import('../../training-camp/lib/camp.js')
      this.given = camps(this.sa.forge, { log: m => this.sa.log(`camp: ${m}`) })
      try { this.adopt() } catch {}
      this.#hooks()
    } catch (e) { this.none = true; this.sa.log(`training camp not available: ${e.message}`) }
    return this.given
  }

  tools() { return CAMP_TOOLS }
  async available() { return !!(await this.cs()) }

  /**
   * One skill pipeline for the company and its camps: the company's scout searches for both, a found skill is
   * installed through the company's auditor and library, the camp is shown what the company's own trials kept,
   * and what a camp measured goes back into the company's skill records.
   */
  #hooks() {
    const sa = this.sa, { registry } = sa.forge
    const h = this.given.hooks ??= {}
    if (registry.listAgents().some(a => a.name === SCOUT)) h.scoutAgent = SCOUT
    h.installSkill = async (a, api) => {
      const before = new Set(fs.readdirSync(registry.d.skills))
      const root = sa.store.read().agents.find(x => !x.parent)
      let msg
      try { msg = await sa.org.installSkill(root, a, { ...api, agent: (n, p, o = {}) => api.agent(n, p, { ...o, full: false }) }) } catch (e) { return { reason: e.message } }
      const name = String(msg).match(/Installed (\S+)\./)?.[1] ?? fs.readdirSync(registry.d.skills).find(n => !before.has(n))
      return name ? { name } : { reason: String(msg) }
    }
    h.suggestSkills = text => sa.growth.suggestFor(text, 6)
    h.skillResult = row => sa.growth.campResult(row)
  }

  /** staff's last rung: open a camp for a lasting role nothing fits, or name the camp that already trains for it. */
  async openFor(me, need) {
    const cs = await this.cs()
    if (!cs) throw new Error('the training camp plugin is not installed')
    const words = t => new Set(String(t).toLowerCase().match(/[a-z][a-z0-9]{3,}/g) ?? [])
    const want = words(`${need.capability} ${need.purpose}`)
    const overlap = c => { const have = words(`${c.name} ${c.goal}`); let n = 0; for (const w of want) if (have.has(w)) n++; return want.size ? n / want.size : 0 }
    const same = cs.list().filter(c => !['published'].includes(c.status)).map(c => ({ c, o: overlap(c) })).sort((a, b) => b.o - a.o)[0]
    if (same && same.o >= 0.5) return { id: same.c.id, name: same.c.name, existing: true }
    const goal = `An agent, with the small team around it if the work needs one, that does this reliably and to a high standard: ${str(need.capability, 1500)}\nIt serves: ${str(need.purpose, 200)}.`
    const c = cs.create({ goal, name: clip(String(need.name ?? need.purpose).replace(/^[a-z]+-/, m => (m === P.prefix ? '' : m)).replace(/-/g, ' '), 50), hint: 'Keep it small: one to three roles and only the stages this capability needs. No market or business stages unless the capability is about them.' })
    cs.store.update(c.id, x => { x.by = me.id; x.log.push({ ts: now(), msg: `opened by ${me.title ?? me.id} through staffing: nothing existing fits this lasting role` }) })
    Promise.resolve(cs.propose(c.id)?.done).then(() => this.#after(c.id, 'propose'), e => this.#tell(c.id, 'propose-failed', `Camp ${c.id}: the workflow proposal failed: ${clip(e?.message ?? e, 400)}`)).catch(() => {})
    this.sa.say({ from: me.id, kind: 'org', text: `Staffing opened the training camp "${c.name}" (${c.id}): nothing existing fits "${clip(need.capability, 200)}".` })
    return { id: c.id, name: c.name, existing: false }
  }

  // ---------------- what a leader does
  /** Returns undefined for a tool that is not ours. */
  act(me, name, a, ctx = { lane: 'main' }) {
    if (!NAMES.has(name)) return undefined
    return this.#act(me, name, a, ctx)
  }

  async #act(me, name, a, ctx) {
    const cs = await this.cs()
    if (!cs) return 'The training camp plugin is not installed in this harness.'
    const who = me.title ?? me.id
    const mark = (id, msg) => cs.store.update(id, c => { c.log.push({ ts: now(), msg: `${who}: ${msg}` }) })
    const follow = (id, what, p) => { Promise.resolve(p?.done).then(() => this.#after(id, what), e => this.#tell(id, `${what}-failed`, `Camp ${id}: ${what} failed: ${clip(e?.message ?? e, 400)}`)).catch(() => {}) }
    switch (name) {
      case 'camp_list': {
        const rows = cs.list()
        return rows.length ? rows.map(c => `- ${c.id} "${c.name}" [${c.status}${c.busy ? ', working' : ''}] goal: ${clip(c.goal, 160)}; ${c.spend.calls} model calls`).join('\n') : 'No training camps yet. Open one with camp_new.'
      }
      case 'camp_new': {
        const goal = str(a.goal, 2000)
        if (goal.length < 20) throw new Error('describe the goal the trained team must be able to reach')
        const c = cs.create({ goal, name: str(a.name, 80) || undefined, hint: str(a.idea, 2000) || undefined })
        cs.store.update(c.id, x => { x.by = me.id; x.log.push({ ts: now(), msg: `opened by ${who}` }) })
        follow(c.id, 'propose', cs.propose(c.id))
        this.sa.say({ from: me.id, kind: 'org', text: `Opened the training camp "${c.name}" (${c.id}) for: ${clip(goal, 300)}` })
        return `Camp ${c.id} "${c.name}" is open and an architect is proposing its workflow. The proposal will reach you as an event; then read it (camp_workflow), change it (camp_change) or approve it (camp_approve).`
      }
      case 'camp_status': return cs.report(String(a.id))
      case 'camp_workflow': {
        const c = cs.get(String(a.id))
        if (!c.workflow) return 'This camp has no workflow yet; the proposal is still being written.'
        const { workflowText } = await import('../../training-camp/lib/workflow.js')
        return `Workflow v${c.workflowVersion} (${c.approvedVersion === c.workflowVersion ? 'approved' : 'not approved'}):\n${workflowText(c.workflow)}`
      }
      case 'camp_change': {
        const id = String(a.id)
        mark(id, `asked for a workflow change: ${clip(a.request, 300)}`)
        const before = cs.get(id)
        this.#save(id, { rolesBefore: (before.workflow?.roles ?? []).map(r => r.name), versionBefore: before.workflowVersion })
        follow(id, 'revise', cs.revise(id, str(a.request, 4000)))
        return 'The architect is revising the workflow. The new version will reach you as an event.'
      }
      case 'camp_approve': {
        const id = String(a.id)
        cs.approve(id)
        mark(id, 'approved the workflow')
        cs.train(id)
        this.sa.say({ from: me.id, kind: 'org', text: `Approved the workflow of the training camp ${id} and started training.` })
        return 'Approved, and training has started. It runs for hours without you: code resumes it after provider limits and publishes it when it passes. You get an event when it needs a decision or is published.'
      }
      case 'camp_train': { cs.train(String(a.id)); mark(String(a.id), 'started training'); return 'Training is running.' }
      case 'camp_pause': {
        const id = String(a.id)
        const r = cs.cancel(id, { by: me.id, reason: str(a.reason, 300) })
        if (!r.ok) cs.store.update(id, c => { if (c.status === 'paused' && c.pause) c.pause.by = me.id })
        mark(id, `paused it: ${clip(a.reason, 200)}`)
        return 'Paused. It stays paused until you or the owner resume it (camp_train).'
      }
      case 'camp_redo': {
        const id = String(a.id)
        cs.redo(id, String(a.part))
        mark(id, `runs "${a.part}" again`)
        cs.train(id)
        return `"${a.part}" will run again, and training has been started.`
      }
      case 'camp_set': {
        const id = String(a.id), key = String(a.key), lim = SETTABLE[key]
        if (!lim) throw new Error(`you can set: ${Object.keys(SETTABLE).join(', ')}`)
        const v = Math.round(Number(a.value))
        if (!(v >= lim[0] && v <= lim[1])) throw new Error(`${key} must be between ${lim[0]} and ${lim[1]}`)
        const floor = cs.get(id).protect?.floor?.[key] ?? FLOOR[key]
        if (floor != null && v < floor) throw new Error(`${key} cannot go below ${floor}. ${QUALITY_RULE}`)
        const [k1, k2] = key.split('.')
        cs.updateSettings(id, k2 ? { [k1]: { [k2]: v } } : { [k1]: v }, { by: me.id })
        mark(id, `set ${key} = ${v}`)
        return `${key} is now ${v}. It applies to work that has not run yet.`
      }
      case 'camp_publish': {
        const id = String(a.id)
        const p = cs.publish(id, { force: a.force === true })
        mark(id, 'published')
        this.#published(id, p, who)
        return this.#publishedText(cs.get(id))
      }
      case 'camp_retrain': {
        const agent = String(a.agent ?? ''), why = str(a.why, 1000)
        if (why.length < 20) throw new Error('say concretely what the agent keeps getting wrong')
        const camp = cs.list().map(r => cs.get(r.id)).find(c => c.workflow?.roles.some(r => r.name === agent) && c.roles?.[agent])
        if (!camp) throw new Error(`${agent} was not trained in a training camp. Coach it instead (update_agent, a skill), or open a camp for its job with camp_new.`)
        if (cs.list().find(r => r.id === camp.id)?.busy) throw new Error(`the camp ${camp.id} is working now; send ${agent} back when it has finished (you get an event), or pause it first`)
        let examples = Array.isArray(a.examples) ? a.examples : []
        // without examples, the gaps reviews recorded for this agent stand in for them
        if (!examples.length) { try { examples = this.sa.perf.g.read().ledger.filter(x => x.who === agent && x.evidence).slice(-4).map(x => ({ task: `${x.gap}\n\nContext from the review: ${x.evidence}`, wrong: x.gap })) } catch {} }
        const c = cs.retrain(camp.id, agent, { why, examples, by: who })
        cs.updateSettings(camp.id, { roles: [agent] })
        cs.train(camp.id)
        this.#save(camp.id, { retraining: agent })
        this.sa.say({ from: me.id, kind: 'org', text: `Sent ${agent} back to the training camp ${camp.id}: ${clip(why, 300)}` })
        return `${agent} is back in training in camp ${camp.id} with ${c.roles[agent].retrain.realTasks} real task(s) added. It keeps working as it is meanwhile. When it has passed its final exam it is republished automatically and you get an event; if the retrained version is not better, the current one stays.`
      }
      case 'run_workflow': {
        const wf = String(a.workflow ?? ''), goal = str(a.goal, 6000)
        const camp = cs.list().map(r => cs.get(r.id)).find(c => c.published?.orchestration === wf)
        if (!camp) throw new Error(`"${wf}" is not the workflow of a published camp. Published: ${cs.list().map(r => cs.get(r.id).published?.orchestration).filter(Boolean).join(', ') || 'none yet'}`)
        if (goal.length < 20) throw new Error('say concretely what this run must achieve')
        const { registry } = this.sa.forge
        return this.sa.startJob(me, 'workflow', wf, goal, ctx.lane, async api => {
          // every agent's last answer in the run is scored, so the work itself tells who is good enough
          const last = new Map()
          const watch = { ...api, agent: async (n, p, o) => { const r = await api.agent(n, p, o); const text = typeof r === 'string' ? r : r?.text ?? (r?.structured ? JSON.stringify(r.structured) : ''); if (text) last.set(String(n), { task: clip(p, 3000), result: clip(text, 6000) }); return r } }
          const cwd = path.join(P.projectDir, 'workflow-runs', `${slug(wf, 30)}-${Date.now().toString(36)}`)
          fs.mkdirSync(cwd, { recursive: true })
          const { result } = await runNamed(registry, wf, watch, { goal, cwd })
          for (const [agent, w] of last) { try { this.sa.perf.judge({ key: agent, gapWho: agent, task: w.task, result: w.result, by: me.id }) } catch {} }
          return `Folder: ${cwd}\n\n${typeof result === 'string' ? result : JSON.stringify(result)}`
        }, { purpose: clip(goal, 80) })
      }
      case 'camp_rollback': { cs.rollback(String(a.id)); mark(String(a.id), 'rolled the publish back'); return 'The publish is rolled back.' }
    }
  }

  // ---------------- what code does by itself
  #state(id) { return this.sa.store.read().sourceState.camps?.[id] ?? {} }
  #save(id, patch) { this.sa.store.update(s => { s.sourceState.camps ??= {}; s.sourceState.camps[id] = { ...(s.sourceState.camps[id] ?? {}), ...patch } }) }

  /** One event to the COO (the CEO when there is no COO), at most once per key. */
  #tell(id, key, text) {
    this.sa.trigger({ source: 'training-camp', kind: 'camp', to: COO_ID, lane: `camp:${id}`, key: `camp:${id}:${key}`, text })
  }

  #publishedText(c) {
    const p = c.published
    if (!p) return 'Nothing was published.'
    return `Published from camp ${c.id} "${c.name}": agents ${p.agents.join(', ') || '-'}; teams ${p.teams.join(', ') || '-'}; workflow "${p.orchestration}"${p.skipped?.length ? `; not published (did not pass): ${p.skipped.join(', ')}` : ''}.`
  }

  #published(id, _p, who) {
    const c = this.given.get(id)
    this.sa.say({ from: 'system', kind: 'org', text: `${this.#publishedText(c)} (${who})` })
    this.#save(id, { publishedAt: c.published?.ts ?? now(), retraining: null })
    // a retrain trained one role only; the next full run trains whatever needs it
    try { if (this.given.get(id).settings?.roles?.length) this.given.updateSettings(id, { roles: [] }) } catch {}
    try { this.deploy(c) } catch (e) { this.sa.log(`camp ${id} deploy: ${e.message}`); this.#tell(id, `deploy-failed-${c.published?.ts}`, `Camp ${id} was published, but its agents could not be put into the company structure: ${clip(e.message, 300)}. They exist as agents and teams; ask them directly meanwhile.`) }
    try { this.onPublished?.(c) } catch (e) { this.sa.log(`camp ${id} after publish: ${e.message}`) }
  }

  /** Graduates the company knows by name (company.json: adopted). Loaded once, and again after every deploy. */
  adopt() {
    for (const n of this.sa.co.read().adopted ?? []) P.adopted.add(n)
  }

  /**
   * Put a published camp into the company: its agents and teams become the company's, and they form a department
   * with a head and a super team, next to the departments that exist. Safe to repeat (a later publish updates it).
   */
  deploy(c) {
    const p = c.published
    if (!p) return null
    const co = this.sa.co, { registry } = this.sa.forge
    const names = [...p.agents, ...p.teams]
    co.update(s => { s.adopted = [...new Set([...(s.adopted ?? []), ...names])] })
    this.adopt()
    const id = `camp-${slug(c.name, 20)}`
    const head = P.name(`head-${slug(c.name, 24)}`)
    const prior = co.read().departments
    if (!registry.listAgents().some(a => a.name === head)) {
      // the head is a leader like the other department heads: same definition, its own mission
      const like = registry.getAgent(prior.find(d => !d.camp)?.lead ?? co.read().ceo)
      registry.saveAgent({ ...like, name: head, title: undefined, description: `Head of ${c.name}: leads the team a training camp trained for "${clip(c.goal, 120)}"`, role: `You head the department "${c.name}". Its people were trained together in a training camp for this goal: ${c.goal}\n\nYou lead them: brief them concretely, check what comes back against the brief, and report plainly what is done, what is not, and what you verified. ${P.hardRules ?? ''}`.trim(), tags: [...new Set([...(like.tags ?? []), 'camp-head'])] })
    }
    const wf = c.workflow
    const dep = addDepartment(co, { id, name: c.name, lead: head, teams: p.teams, camp: c.id, workflow: p.orchestration, mission: `Reach this goal with the team trained for it: ${clip(c.goal, 400)}. The trained way of working is the workflow "${p.orchestration}" (${wf.stages.map(s => s.title).join(' -> ')}).` })
    this.sa.say({ from: 'system', kind: 'org', text: `New department "${c.name}" from the training camp ${c.id}: head ${head}, teams ${p.teams.join(', ') || '-'}, ${p.agents.length} trained agents, workflow "${p.orchestration}".` })
    return dep
  }

  /** After a proposal or a revision finished. */
  #after(id, what) {
    const c = this.given.get(id)
    if (what === 'revise' && this.#keepRoles(c)) return
    if (!c.workflow) return this.#tell(id, `${what}-empty-${c.runs.length}`, `Camp ${id} "${c.name}": the architect did not produce a workflow (${clip(c.log.at(-1)?.msg, 300)}). Try camp_change with a simpler request, or open a camp with a narrower goal.`)
    this.#tellWorkflow(c)
  }

  /**
   * A revision that removed roles from a camp the owner opened, or from one that was approved before, is undone:
   * the earlier version is restored. Returns true when it did that.
   */
  #keepRoles(c) {
    const st = this.#state(c.id)
    const lost = (st.rolesBefore ?? []).filter(n => !c.workflow?.roles.some(r => r.name === n))
    const free = c.by && c.approvedVersion == null && c.protect?.keepRoles !== true
    if (!lost.length || free || c.protect?.keepRoles === false || c.workflowVersion === st.versionBefore) return false
    this.given.restoreWorkflow(c.id, st.versionBefore)
    this.given.store.update(c.id, x => { x.log.push({ ts: now(), msg: `a workflow change removed ${lost.length} role${lost.length === 1 ? '' : 's'} (${lost.slice(0, 8).join(', ')}): undone, version ${st.versionBefore} restored` }) })
    const back = this.given.get(c.id)
    // the restored version is what was approved before: approving it again keeps every role's training
    try { if (st.versionBefore === c.approvedVersion || c.approvedVersion != null) this.given.approve(c.id) } catch {}
    this.#tell(c.id, `kept-roles-${c.workflowVersion}`, `Your change to camp ${c.id} "${c.name}" removed ${lost.length} role${lost.length === 1 ? '' : 's'} (${lost.slice(0, 10).join(', ')}), so code undid it: the workflow is back to version ${st.versionBefore} with all ${back.workflow.roles.length} roles${back.approvedVersion === back.workflowVersion ? ', approved as before' : ''}. ${QUALITY_RULE}`)
    return true
  }

  #tellWorkflow(c) {
    const wf = c.workflow
    this.#tell(c.id, `workflow-v${c.workflowVersion}`, `Camp ${c.id} "${c.name}" has a proposed workflow, version ${c.workflowVersion}: ${wf.stages.length} stages, ${wf.roles.length} roles, ${wf.teams.length} teams.\n${clip(wf.summary, 600)}\nStages: ${wf.stages.map(s => s.title).join(' -> ')}\nRead it with camp_workflow. Approving is yours, not the owner's: check that the stages lead to the goal, that each role is one job, and that nothing is missing or doubled. Change it with camp_change, or approve it with camp_approve, which starts training.`)
  }

  /** A camp event the COO could not handle (its turn failed twice) goes to the CEO, once. */
  #escalate() {
    for (const t of this.sa.store.read().triggers.filter(t => t.source === 'training-camp' && t.status === 'failed' && t.to === COO_ID && t.key).slice(-20)) {
      this.sa.trigger({ source: 'training-camp', kind: 'camp', to: 'ceo', lane: t.lane, key: `${t.key}:ceo`, text: `The COO could not handle this training-camp event (its turn failed: ${clip(t.note, 200)}). It is yours now.\n\n${t.text}` })
    }
  }

  /** Look at every camp. Called from the loop; does its work at most once a minute. */
  async tick({ hold = null } = {}) {
    if (this.busy || Date.now() - this.at < MIN) return
    this.at = Date.now()
    this.busy = true
    try {
      const cs = await this.cs()
      if (!cs) return
      for (const row of cs.list()) {
        try { this.#watch(cs, cs.get(row.id), row.busy, hold) } catch (e) { this.sa.log(`camp ${row.id}: ${e.message}`) }
      }
      try { this.#escalate() } catch {}
    } finally { this.busy = false }
  }

  #watch(cs, c, busy, hold) {
    const id = c.id
    const st = this.#state(id)
    const calls = c.spend?.calls ?? 0
    // progress since the last look
    if (calls !== st.calls) this.#save(id, { calls, callsAt: now() })

    if (c.status === 'workflow' && !busy && c.workflow) return this.#tellWorkflow(c)

    if (c.status === 'ready' && !busy) {
      try {
        const p = cs.publish(id)
        cs.store.update(id, x => { x.log.push({ ts: now(), msg: 'published automatically: every role and the team passed' }) })
        this.#published(id, p, 'automatic, it passed')
        this.#tell(id, `published-${c.runs.length}`, `${this.#publishedText(cs.get(id))}\nThey passed their final exams and were published automatically. They are now the department "${c.name}" in the company. Put them to work: run_workflow "${cs.get(id).published.orchestration}" with a concrete goal runs the trained workflow end to end, and you can also brief the department like any other. Camp goal: "${clip(c.goal, 300)}".`)
      } catch (e) { this.#tell(id, `publish-failed-${c.runs.length}`, `Camp ${id} "${c.name}" passed but could not be published: ${clip(e.message, 400)}`) }
      return
    }

    if (c.status === 'not-passed' && !busy) {
      const failed = c.workflow.roles.filter(r => !c.roles[r.name]?.verify?.passed).map(r => `${r.name} (${c.roles[r.name]?.verify?.error ? `stopped by an error 3 times: ${clip(c.roles[r.name].verify.error, 160)}` : c.roles[r.name]?.verify?.score ?? 'no score'})`)
      const broke = c.workflow.roles.some(r => c.roles[r.name]?.verify?.error)
      return this.#tell(id, `not-passed-${c.runs.length}`, `Camp ${id} "${c.name}" finished, and not everything passed. Did not pass: ${failed.join(', ') || '-'}${c.team?.verify && !c.team.verify.passed ? '; the team as a whole' : ''}.\n${broke ? 'A role stopped by the same error three times was not judged on its work. If the error is in the harness and not in the provider, have it fixed (repair_harness, with the error text), then train again (camp_train): those roles are tried again.\n' : ''}Read camp_status. Your options: coach those roles again (camp_redo rounds, after camp_set rounds or dataset sizes higher), change the workflow so the role is one clearer job (camp_change), or publish what passed (camp_publish with force) and keep training the rest.`)
    }

    if (c.status === 'training' && busy) {
      const idle = Date.now() - new Date(st.callsAt ?? c.active?.ts ?? now()).getTime()
      if (idle > 60 * MIN) {
        // stuck: code stops the run so the next look resumes it; the COO hears when that keeps happening
        cs.cancel(id, { by: '', reason: `no model call for ${Math.round(idle / MIN)} minutes; restarted by code` })
        cs.store.update(id, x => { x.log.push({ ts: now(), msg: `no model call for ${Math.round(idle / MIN)} minutes: the run was stopped by code and will be resumed` }) })
        this.#save(id, { callsAt: now(), stalls: (st.stalls ?? 0) + 1 })
        if ((st.stalls ?? 0) + 1 >= 2) this.#tell(id, `stalled-${new Date().toISOString().slice(0, 10)}`, `Camp ${id} "${c.name}" stopped making model calls twice and was restarted by code each time. Read camp_status and the last log lines. If the provider is refusing calls, train fewer things at once (camp_set); if the harness hangs, have it fixed (repair_harness, with what you see).`)
      }
      if ((st.resumes || st.stalls) && calls - (st.resumeCalls ?? 0) >= 25) this.#save(id, { resumes: 0, stalls: 0, sameError: 0 })
      // the provider lets calls through again: go back toward the speed the owner chose (it applies from the next run)
      const want = c.protect?.parallel, S = c.settings ?? {}
      if (want && calls - (st.resumeCalls ?? 0) >= 60 && (S.parallelAgents < want.agents || S.parallelCalls < want.calls) && Date.now() - new Date(st.spedAt ?? 0).getTime() > 30 * MIN) {
        const next = { parallelAgents: Math.min(want.agents, Math.max(S.parallelAgents * 2, 2)), parallelCalls: Math.min(want.calls, Math.max(S.parallelCalls * 2, 4)) }
        cs.updateSettings(id, next, { by: 'code' })
        cs.store.update(id, x => { x.log.push({ ts: now(), msg: `the provider lets calls through again: back up to ${next.parallelAgents} agents and ${next.parallelCalls} calls at a time from the next run (your setting is ${want.agents} and ${want.calls})` }) })
        this.#save(id, { spedAt: now() })
      }
      return
    }

    if (c.status !== 'paused' || busy || !c.pause) return
    const reason = String(c.pause.reason ?? '')
    if (c.pause.by) return // paused on purpose
    if (HARD_LIMIT.test(reason) && !TRANSIENT_LIMIT.test(reason)) {
      return this.#tell(id, `limit-${c.pause.ts}`, `Camp ${id} "${c.name}" paused at its own limit: ${clip(reason, 300)}\nTraining so far is kept. The budget and the call limit are the owner's settings: tell the owner what is trained, what is left and what you recommend (reply_owner), and ask for the limit to be raised. Do not make the rest cheaper by cutting roles, rounds or tasks.`)
    }
    if (hold) return // the company's budget hold stops new model work
    // a quota, a busy provider, a restart or an error: resume, waiting longer each time it comes back without progress
    const n = st.resumes ?? 0
    const wait = Math.max(WAITS[Math.min(n, WAITS.length - 1)], TRANSIENT_LIMIT.test(reason) && n === 0 ? 10 : 0) * MIN
    if (Date.now() - new Date(c.pause.ts ?? now()).getTime() < wait) return
    // a provider limit that comes straight back: code trains fewer things at once before it tries again
    const S = c.settings ?? {}
    if (n >= 2 && TRANSIENT_LIMIT.test(reason) && ((S.parallelAgents ?? 1) > 1 || (S.parallelCalls ?? 1) > 2)) {
      const was = `${S.parallelAgents} and ${S.parallelCalls}`
      // half as many at a time, each time the limit comes straight back; it climbs back when calls get through
      const less = { parallelAgents: Math.max(1, Math.floor((S.parallelAgents ?? 1) / 2)), parallelCalls: Math.max(2, Math.floor((S.parallelCalls ?? 2) / 2)) }
      cs.updateSettings(id, less, { by: 'code' })
      cs.store.update(id, x => { x.log.push({ ts: now(), msg: `the provider keeps limiting: lowered automatically to ${less.parallelAgents} agent(s) and ${less.parallelCalls} calls at a time (was ${was}); it goes back up when calls get through` }) })
      this.#tell(id, `slowed-${new Date().toISOString().slice(0, 10)}`, `Camp ${id} "${c.name}" kept hitting the provider's limit, so code halved it to ${less.parallelAgents} agent(s) and ${less.parallelCalls} calls at a time (it was ${was}) and resumed it; code raises it again when calls get through. Do not lower it further yourself: the owner wants the agents trained side by side. If the limit keeps coming back, tell the owner that the models' quota is what holds the camp back (reply_owner).`)
    }
    // the same error again and again is not the provider: it needs a fix, not another try
    const sameError = !TRANSIENT_LIMIT.test(reason) && !/restart|stopped|process that ran/.test(reason) && clip(reason, 120) === clip(st.lastReason, 120) ? (st.sameError ?? 0) + 1 : 0
    cs.store.update(id, x => { x.log.push({ ts: now(), msg: `resumed automatically (attempt ${n + 1}) after: ${clip(reason, 160)}` }) })
    cs.train(id)
    this.#save(id, { resumes: n + 1, resumeCalls: calls, lastReason: clip(reason, 300), sameError })
    if (sameError === 2) this.#tell(id, `same-error-${hashOf(reason)}`, `Camp ${id} "${c.name}" has stopped three times on the same error, and resuming does not get past it:\n${clip(reason, 600)}\nRun ${c.runs.at(-1)?.id ?? '-'}. Decide what it is. A fault in one stage or role: run that part again (camp_redo) or make the role a clearer job (camp_change). A fault in the harness itself (an exception, a broken tool, a bad file): have it fixed with repair_harness, giving this error text and the run id; code resumes the camp after the fix. Code keeps retrying meanwhile.`)
    if (n + 1 === 4) this.#tell(id, `keeps-pausing-${new Date().toISOString().slice(0, 10)}`, `Camp ${id} "${c.name}" has paused and been resumed ${n + 1} times with almost no progress. The last reason: ${clip(reason, 300)}\nCode keeps retrying every hour. If the provider's limit is the cause, train fewer things at once (camp_set parallelAgents 1, parallelCalls 2) and let it take longer, and tell the owner that the models' quota is what holds the camp back (reply_owner); do not cut roles or training depth. If a stage fails every time, run it again (camp_redo) or change the workflow (camp_change).`)
  }

  // ---------------- for the leaders' prompt and the dashboard
  /** A short block for a leader's context, or '' when there are no camps. */
  context() {
    const cs = this.given
    if (!cs) return ''
    let rows = []
    try { rows = cs.list() } catch { return '' }
    const how = QUALITY_RULE + ' A training camp trains a set of agents and their team for one goal and publishes the ones that pass their final exam. Open one (camp_new) when a goal needs a workforce you do not have or the agents you have keep falling short; approve its workflow yourself; code resumes and publishes it. Do not poll a camp: events tell you when it needs you. An agent a camp trained that keeps falling short in real work goes back with camp_retrain (with the work it got wrong); the trained workflow of a published camp runs with run_workflow.'
    if (!rows.length) return `# Training camps\n(none) ${how}`
    const wfOf = id => { try { return cs.get(id).published?.orchestration } catch { return null } }
    return `# Training camps\n${rows.slice(-8).map(c => `- ${c.id} "${c.name}" [${c.status}${c.busy ? ', working' : ''}] ${c.spend.calls} model calls${wfOf(c.id) ? `; published workflow "${wfOf(c.id)}" (run_workflow)` : ''}; goal: ${clip(c.goal, 140)}`).join('\n')}\n${how}`
  }

  /** Health checks: one line per camp that waits or keeps failing. */
  checks() {
    const cs = this.given
    if (!cs) return []
    const out = []
    for (const row of (() => { try { return cs.list() } catch { return [] } })()) {
      const st = this.#state(row.id)
      if (row.status === 'paused') {
        let c
        try { c = cs.get(row.id) } catch { continue }
        if (c.pause?.by) continue
        const mins = Math.round((Date.now() - new Date(c.pause?.ts ?? now()).getTime()) / MIN)
        out.push({ id: `camp:${row.id}`, name: `Training camp "${row.name}"`, status: (st.resumes ?? 0) >= 4 ? 'fail' : 'warn', detail: `Paused ${mins} minutes ago: ${clip(c.pause?.reason, 200)}. Resumed automatically ${st.resumes ?? 0} times.`, fix: HARD_LIMIT.test(String(c.pause?.reason)) ? 'Raise the camp\'s budget or call limit in Training camp > Settings, then Resume.' : 'It is retried automatically. If it keeps pausing on a provider limit, lower the parallel settings in Training camp > Settings or choose another model there.' })
      } else if (row.status === 'not-passed') {
        out.push({ id: `camp:${row.id}`, name: `Training camp "${row.name}"`, status: 'warn', detail: 'Some roles or the team did not pass their final exam. The COO has been told.', fix: 'Open Training camp > Results to see which, or leave it to the COO.' })
      }
    }
    return out
  }
}
