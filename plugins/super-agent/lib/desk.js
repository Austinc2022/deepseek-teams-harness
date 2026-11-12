/**
 * Desk chat: the owner talks to any unit on the dashboard (a super agent, the COO, a department, a team, an agent).
 *
 * It runs beside the unit's work. A reply is its own run: it does not queue behind the super agent's decisions,
 * does not enter the feed or the trigger queue, and does not use the unit's work sessions. Only what the owner
 * explicitly asks for reaches the work: assign_task and schedule become ordinary events for the responsible super
 * agent, remember writes to the agent's memory, and the skill tools change the agent's setup (through the same
 * audited paths the super agent uses).
 *
 * Transcripts live in forge/super-agent/desk/<unit>.json, one file per unit.
 */
import fs from 'node:fs'
import path from 'node:path'
import { toolsMcp } from '../../agent-forge/lib/runner.js'
import { saveNote, deleteNote, memoryDir } from '../../agent-forge/lib/memory.js'
import { now, newId, str, clip, slug } from './store.js'
import { entity, structure } from './board.js'
import { PROTECTED } from './org.js'
import { profile as P } from '../../company/lib/profile.js'

const S = { type: 'string' }
const A = { type: 'array', items: S }
const tool = (name, description, properties = {}, required = Object.keys(properties)) => ({ name, description, inputSchema: { type: 'object', properties, required } })
const HISTORY = 14
const KEEP = 200

const TOOLS = [
  tool('remember', 'Save something to an agent\'s long-term memory because the owner asked you to memorise or note it. Saving under an existing title replaces that note. Default agent: you.', { title: S, content: S, tags: A, agent: S }, ['title', 'content']),
  tool('forget', 'Delete one memory note by its id (the id is shown in the facts).', { id: S, agent: S }, ['id']),
  tool('schedule', 'Schedule work for this unit at a time. The responsible super agent receives it as an event when it is due. when is an ISO 8601 timestamp with the owner\'s time zone offset. everyHours repeats it.', { text: S, when: S, everyHours: { type: 'number' } }, ['text', 'when']),
  tool('list_schedules', 'List the active schedules of this unit.', {}, []),
  tool('cancel_schedule', 'Cancel a schedule by id.', { id: S }),
  tool('assign_task', 'Give this unit new work. It is queued as an event for the responsible super agent and carried out through the normal route; it does not interrupt anything that is running. Use it when the owner asks for something to be done.', { text: S }),
  tool('find_skills', 'Search GitHub for repositories of agent skills.', { query: S }),
  tool('list_repo_skills', 'List the SKILL.md files in a GitHub repository.', { repo: { type: 'string', description: 'owner/name' } }),
  tool('install_skill', 'Download one SKILL.md from GitHub. The independent auditor reads it first; it is installed only when judged safe. Afterwards give it to an agent with update_agent.', { repo: S, path: S, name: S }, ['repo', 'path']),
  tool('update_agent', 'Change an agent: its role text, description, model, effort or skills (the full list of skill names it should have). The old version is kept. Protected agents (the auditor, the workers) refuse.', { name: S, role: S, description: S, model: S, effort: S, skills: A, why: S }, ['name']),
]

const slugRef = ref => String(ref).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 80)

export class Desk {
  constructor(sa) {
    this.sa = sa
    this.dir = path.join(sa.store.dir, 'desk')
    fs.mkdirSync(this.dir, { recursive: true })
    this.live = new Map() // ref -> { runId }
  }

  #file(ref) { return path.join(this.dir, `${slugRef(ref)}.json`) }

  #load(ref) {
    try { return JSON.parse(fs.readFileSync(this.#file(ref), 'utf8')) } catch { return { ref, messages: [] } }
  }

  #save(chat) {
    chat.messages = chat.messages.slice(-KEEP)
    const tmp = `${this.#file(chat.ref)}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(chat))
    fs.renameSync(tmp, this.#file(chat.ref))
  }

  #unit(ref) {
    const { meta } = structure(this.sa)
    if (!meta[ref]) throw new Error('no such unit')
    return meta[ref]
  }

  /** The agent that speaks for a unit. Builders (sandboxed shells) never chat: the root super agent speaks for them. */
  voice(ref) {
    const s = this.sa.store.read(), c = this.sa.co.read(), { registry } = this.sa.forge
    const root = s.agents.find(a => !a.parent)
    const rootAgent = root?.agent
    let name = null
    if (ref === 'company' || ref === 'workers') name = rootAgent
    else if (ref.startsWith('sa:')) name = s.agents.find(a => `sa:${a.id}` === ref)?.agent
    else if (ref === 'ceo') name = c.ceo
    else if (ref === 'audit') name = c.auditor
    else if (ref.startsWith('dep:')) name = c.departments.find(d => d.id === ref.slice(4))?.lead
    else if (ref.startsWith('team:')) { const t = ref.slice(5); name = c.departments.find(d => d.teams.includes(t))?.lead ?? (() => { try { return registry.getTeam(t).members[0] } catch { return null } })() }
    else if (ref.startsWith('agent:')) name = ref.slice(6)
    try { if ((registry.getAgent(name).tags ?? []).includes('builder')) name = rootAgent } catch { name = rootAgent }
    if (!name) throw new Error('nobody can speak for this unit yet: run the setup first')
    return name
  }

  read(ref) {
    const unit = this.#unit(ref)
    const chat = this.#load(ref)
    return { ref, title: unit.name, type: unit.type, voice: this.voice(ref), busy: this.live.has(ref), messages: chat.messages, queued: chat.messages.filter(m => m.status === 'queued').length }
  }

  post(ref, text) {
    const clean = str(text, 6000).trim()
    if (!clean) throw new Error('empty message')
    this.#unit(ref)
    this.voice(ref)
    const chat = this.#load(ref)
    const msg = { id: newId('c'), from: 'owner', text: clean, ts: now(), status: 'queued' }
    chat.messages.push(msg)
    this.#save(chat)
    this.#drain(ref).catch(e => this.sa.log(`desk ${ref}: ${e.message}`))
    return { ok: true, id: msg.id }
  }

  stop(ref) {
    const l = this.live.get(ref)
    if (l?.runId) this.sa.forge.engine.cancel(l.runId)
    return { ok: true, stopped: !!l }
  }

  clear(ref) {
    if (this.live.has(ref)) throw new Error('it is replying now: stop it first')
    fs.rmSync(this.#file(ref), { force: true })
    return { ok: true }
  }

  async #drain(ref) {
    if (this.live.has(ref)) return // the running reply picks up what arrived meanwhile
    this.live.set(ref, {})
    try {
      for (;;) {
        const chat = this.#load(ref)
        const batch = chat.messages.filter(m => m.from === 'owner' && m.status === 'queued')
        if (!batch.length) break
        for (const m of batch) m.status = 'working'
        this.#save(chat)
        const reply = await this.#answer(ref, chat, batch).catch(e => ({ from: 'system', text: `Could not answer: ${e.message}`, tools: [] }))
        const fresh = this.#load(ref)
        for (const m of fresh.messages) if (batch.some(b => b.id === m.id)) m.status = 'answered'
        fresh.messages.push({ id: newId('c'), ts: now(), ...reply })
        this.#save(fresh)
      }
    } finally { this.live.delete(ref) }
  }

  // ---------------------------------------------------------------- one reply
  async #answer(ref, chat, batch) {
    const hold = await this.sa.co.holdReason().catch(e => `budget check failed: ${e.message}`)
    if (hold) return { from: 'system', text: `The company is on a budget hold, so no model call can start: ${hold}`, tools: [] }
    const { engine, registry } = this.sa.forge
    const voice = this.voice(ref)
    const e = entity(this.sa, ref)
    const def = registry.getAgent(voice)
    const history = chat.messages.filter(m => !batch.some(b => b.id === m.id) && m.from !== 'system').slice(-HISTORY)
    const prompt = this.#prompt(ref, voice, e, history, batch)
    const log = []
    const names = e.made.setup.map(x => x.name)
    const { id: runId, done } = engine.startCustom(`desk chat: ${ref}`, async api => {
      const mcp = toolsMcp('desk', TOOLS, (name, args) => this.#tool(ref, voice, names, name, args, api, log))
      return api.agent(voice, prompt, {
        label: `desk:${ref}`, full: true, extraMcp: { desk: mcp }, signal: AbortSignal.timeout(15 * 60_000),
        onEvent: ev => { if (ev.type === 'tool') log.push({ tool: String(ev.name ?? '').replace(/^mcp__desk__/, ''), arg: clip(ev.brief ?? '', 90) }) },
        ...(def.memory?.mode === 'session' ? { overrides: { memory: { namespace: `desk-${slugRef(ref)}` } } } : {}),
      })
    }, { ref, desk: true }, { cwd: P.projectDir, meta: { desk: ref } })
    this.live.set(ref, { runId })
    const st = await done
    this.sa.co.charge(st.costUsd, `desk chat ${ref}`)
    const res = st.result
    if (st.status === 'cancelled') return { from: 'system', text: 'Stopped.', tools: log }
    if (!res?.ok) return { from: 'system', text: `${voice} did not answer: ${res?.error ?? st.error ?? st.status}`.split('\n')[0], tools: log }
    return { from: 'agent', agent: voice, text: str(res.text, 8000).trim() || '(no text)', tools: log, costUsd: st.costUsd ?? null }
  }

  #prompt(ref, voice, e, history, batch) {
    const o = e.outlook, d = e.detail ?? {}
    const list = (a, f) => (a.length ? a.map(f).join('\n') : '(none)')
    const mem = e.made.memory.map(m => `- ${m.agent}: ${m.mode === 'none' ? 'no memory' : `${m.noteCount} notes${m.notes.length ? ': ' + m.notes.slice(0, 12).map(n => `${n.title} [id ${n.id}]`).join('; ') : ''}`}`).join('\n')
    const skills = e.made.setup.map(x => `- ${x.name}: ${x.skills.map(k => k.name).join(', ') || 'no skills'} | tools ${x.tools.join(', ') || 'none'} | ${x.provider}/${x.model}`).join('\n')
    const facts = [
      `Unit: ${e.name} (${e.type}), status ${e.status}. ${e.what ?? ''}`,
      `Goal: ${o.goal.text || '(not written)'}`,
      `Progress: ${o.progress.pct == null ? 'not measurable' : o.progress.pct + '%'} (${o.progress.label}). ${o.progress.basis}${o.progress.secondary ? `\nSecond measure: ${o.progress.secondary.label} (${o.progress.secondary.pct}%). ${o.progress.secondary.basis}` : ''}${o.note ? `\n${o.note}` : ''}`,
      `Timeline: ${o.eta.text}. ${o.eta.basis}`,
      `Expected outcome: ${o.outcome.text}`,
      `Next:\n${list(o.next, x => `- [${x.status}] ${x.text}${x.note ? ' (' + clip(x.note, 140) + ')' : ''}`)}`,
      d.plan ? `Plan focus: ${d.plan.focus}\nPriorities: ${d.plan.priorities.map(p => p.text).join(' | ')}\nBlockers: ${(d.plan.blockers ?? []).join(' | ') || 'none'}` : '',
      `KPIs: ${o.kpis.map(k => `${k.label} ${k.value} (${k.sub})`).join('; ')}`,
      `Doing now: ${e.doing.join(' · ') || 'nothing running'}. Recent work:\n${list(e.recent.slice(0, 5), r => `- ${r.label} [${r.status}]`)}`,
      `Members: ${e.members.map(m => `${m.name} (${m.type}${m.busy ? ', working' : ''})`).join(', ') || 'none'}`,
      `Memory:\n${mem}`,
      `Setup:\n${skills}`,
      `Schedules: ${o.schedules.map(x => `${x.id} "${clip(x.text, 80)}" at ${x.at}${x.everyHours ? ` every ${x.everyHours} h` : ''}`).join('; ') || 'none'}`,
    ].filter(Boolean).join('\n\n')
    return [
      `# Who you are in this chat\nYou are ${voice}, answering for "${e.name}" (${e.type}). The owner is chatting with you from the dashboard. Current local time: ${new Date().toString()}.`,
      `This chat runs beside your normal work. Nothing said here pauses, redirects or replaces what you or your team are doing, and you must not say that you stopped working to talk. If the owner wants work changed or started, use assign_task: it queues the work through the normal route.`,
      `# Facts about this unit (current, from the system)\n${facts}`,
      history.length ? `# Conversation so far\n${history.map(m => `${m.from === 'owner' ? 'Owner' : m.agent ?? 'You'}: ${clip(m.text, 1200)}`).join('\n\n')}` : '',
      `# The owner's new message${batch.length > 1 ? 's' : ''}\n${batch.map(m => m.text).join('\n\n')}`,
      `# How to answer\nYour final message is the only text the owner sees, so it must contain the whole answer: first the answer to every question, then what any tool changed. Answer in plain, short sentences with numbers from the facts. If a fact is missing, say it is missing; never invent numbers, dates or results. Use a tool only when the owner asks for an action: remember or forget (memory), schedule, list_schedules or cancel_schedule, assign_task (do something), find_skills, list_repo_skills, install_skill, update_agent (role, description, model, effort, skills). After a tool, say exactly what changed. You cannot approve spending, change the charter or start real-money trading; say so if asked.`,
    ].filter(Boolean).join('\n\n')
  }

  // ---------------------------------------------------------------- tools
  async #tool(ref, voice, names, name, a, api, log) {
    try {
      const out = await this.#act(ref, voice, names, name, a ?? {}, api)
      return clip(String(out), 6000)
    } catch (e) { return `Error: ${e.message}` }
  }

  #agentFor(a, voice, names) {
    const n = String(a.agent ?? a.name ?? voice)
    if (!names.includes(n) && n !== voice) throw new Error(`${n} is not one of this unit's agents (${names.join(', ')})`)
    if (!P.isOurs(n)) throw new Error(`${n} is not an agent of this company`)
    return n
  }

  #owner(ref) {
    const s = this.sa.store.read()
    if (ref.startsWith('sa:') && s.agents.some(x => `sa:${x.id}` === ref)) return s.agents.find(x => `sa:${x.id}` === ref).id
    return s.agents.find(x => !x.parent)?.id ?? 'ceo'
  }

  async #act(ref, voice, names, name, a, api) {
    const { registry } = this.sa.forge
    const org = this.sa.org
    const root = this.sa.store.read().agents.find(x => !x.parent)
    switch (name) {
      case 'remember': {
        const n = this.#agentFor(a, voice, names)
        if (PROTECTED.has(n)) throw new Error(`${n} is protected and keeps no notes`)
        const title = str(a.title, 120).trim(), content = str(a.content, 6000).trim()
        if (!title || !content) throw new Error('a note needs a title and content')
        let def = registry.getAgent(n)
        let enabled = false
        if ((def.memory?.mode ?? 'none') === 'none') {
          const dir = path.join(this.sa.store.backup, 'agents')
          fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(path.join(dir, `${n}.${Date.now()}.yaml`), registry.getAgentSource(n))
          registry.saveAgent({ ...def, memory: { ...def.memory, mode: 'markdown', scope: 'agent' } })
          def = registry.getAgent(n); enabled = true
        }
        const team = registry.listTeams().find(t => (t.members ?? []).includes(n))?.name
        saveNote(memoryDir(registry.home, def, team), { title, content, tags: Array.isArray(a.tags) ? a.tags.map(String).slice(0, 8) : [] })
        return `Saved the note "${title}" to ${n}'s memory${enabled ? ' (memory was off for this agent; it is now on, as markdown notes)' : ''}. It is in its memory index from its next run.`
      }
      case 'forget': {
        const n = this.#agentFor(a, voice, names)
        const def = registry.getAgent(n)
        const team = registry.listTeams().find(t => (t.members ?? []).includes(n))?.name
        deleteNote(memoryDir(registry.home, def, team), String(a.id ?? ''))
        return `Deleted note ${a.id} from ${n}'s memory.`
      }
      case 'schedule': {
        const text = str(a.text, 1500).trim()
        const at = new Date(String(a.when ?? ''))
        if (!text) throw new Error('say what to do')
        if (Number.isNaN(at.getTime())) throw new Error('when must be an ISO 8601 timestamp, for example 2026-11-13T09:00:00+11:00')
        if (at.getTime() < Date.now() - 60_000 || at.getTime() > Date.now() + 366 * 86400_000) throw new Error('when must be within the next year')
        const every = a.everyHours == null ? null : Math.round(Number(a.everyHours) * 60)
        if (every != null && (!Number.isFinite(every) || every < 15 || every > 60 * 24 * 90)) throw new Error('everyHours must be between 0.25 and 2160')
        const r = this.sa.store.command({ type: 'schedule-add', ref, name: this.#unit(ref).name, text, at: at.toISOString(), everyMin: every })
        return `Scheduled for ${at.toLocaleString()}${every ? `, repeating every ${a.everyHours} h` : ''}. ${r.loop ? 'It shows under "Next" within a minute.' : 'The super agent loop is not running; it is recorded when it starts.'}`
      }
      case 'list_schedules': {
        const list = (this.sa.store.read().schedules ?? []).filter(x => x.ref === ref && x.status === 'active')
        return list.map(x => `${x.id}: "${x.text}" at ${x.at}${x.everyMin ? ` every ${x.everyMin / 60} h` : ''}`).join('\n') || 'No active schedule.'
      }
      case 'cancel_schedule': {
        const x = (this.sa.store.read().schedules ?? []).find(y => y.id === a.id && y.ref === ref)
        if (!x) throw new Error('no such schedule for this unit')
        this.sa.store.command({ type: 'schedule-cancel', id: x.id })
        return `Cancelled "${clip(x.text, 80)}".`
      }
      case 'assign_task': {
        const text = str(a.text, 6000).trim()
        if (text.length < 8) throw new Error('describe the work')
        const to = this.#owner(ref)
        this.sa.store.command({ type: 'say', to, text: this.sa.ownerText(ref, this.#unit(ref).name, text) })
        return `Queued as new work for ${to}. It does not interrupt what is running; it is picked up as the next event.`
      }
      case 'find_skills': return org.findSkills(String(a.query ?? ''))
      case 'list_repo_skills': return org.listRepoSkills(String(a.repo ?? ''))
      case 'install_skill': return org.installSkill(root, a, api)
      case 'update_agent': {
        const n = this.#agentFor({ name: a.name }, voice, names)
        return org.updateAgent(root, { ...a, name: n })
      }
      default: throw new Error(`unknown tool ${name}`)
    }
  }
}
