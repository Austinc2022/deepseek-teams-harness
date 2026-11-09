/**
 * Multi-agent chat rooms.
 *
 * A room holds a list of forge agents and a shared transcript. When the user
 * posts, agents reply according to the room mode:
 *  - sequential: every agent replies in order and sees earlier replies
 *  - parallel:   every agent replies at once, seeing the transcript up to the user message
 *  - mention:    only @mentioned agents reply (falls back to the first agent)
 *  - handoff:    one lead agent (the room's lead, else the team's first member) answers first; after that
 *                only @mentioned agents get the floor, up to maxHops hand-offs
 *  - workflow:   the message starts the room's chosen orchestration (room.workflow + room.workflowArgs,
 *                plus team=<room team> and message=<text>); its live progress and result post into the chat
 * In the agent modes, a reply that @mentions another room agent hands the floor to that
 * agent (bounded by maxHops), so agents can talk to each other.
 *
 * Each reply is one runAgent call, so agents keep their own model, skills,
 * memory, sub-agents and execution environment. Rooms persist as JSON in forge/chats.
 *
 * Projects group rooms: each project is a tab in the UI holding its own agent-team chats. Projects persist in
 * forge/chat-projects.json; a room's `project` field names its project (no field = the General tab). A project
 * may set a default working directory that new chats in it inherit.
 *
 * Project agent settings: inside a project (or General) each agent can be re-configured for that project's chats
 * only: backend, model, effort, stateless/stateful memory (optionally kept separate per project), skills,
 * permission, execution, limits, extra instructions and backup models. Stored in forge/chat-project-agents.json
 * as { "<project id | _general>": { "<agent>": overrides } } and merged over the agent's own definition.
 *
 * Super teams use rooms as their teams' chats (plugins/super-team): postAndWait() posts a supervisor brief and
 * waits for the room's replies (run through the super team's run, so they count in its cost and transcripts);
 * appendExchange() copies a discussion that ran elsewhere into a room for visibility. Such messages carry
 * `via: { superTeam, title, step }` so the page can show where they came from.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { assertName, deepMerge, normalizeAgent } from './registry.js'
import { runAgent } from './runner.js'

export const CHAT_MODES = ['sequential', 'parallel', 'mention', 'handoff', 'workflow']
export const MAX_HOPS = 50
const GENERAL = '_general'
const clampHops = v => Math.max(0, Math.min(MAX_HOPS, Number(v) || 0))
const TRANSCRIPT_CHARS = 60000

const now = () => new Date().toISOString()
const newId = () => `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`

const mentionsIn = (text, agents, self) => {
  const out = []
  for (const m of String(text ?? '').matchAll(/@([a-z][a-z0-9-]*)/g)) if (agents.includes(m[1]) && m[1] !== self && !out.includes(m[1])) out.push(m[1])
  return out
}

/**
 * Split a room into tasks (one per user message) and describe each: who replied, what caused each reply
 * (the user's message or an earlier agent's @mention), and where the task stands:
 *   working     agents are replying right now
 *   waiting     the last reply hands work to @agents but nobody took it (hand-off limit reached or cut short)
 *   done        the last reply finished without handing off
 *   failed / stopped / interrupted / no-reply
 * progress = finished replies / (finished + running + still-waiting agents).
 */
export function summarizeTasks(room, live = false) {
  const tasks = []
  room.messages.forEach((m, i) => {
    if (m.from === 'user') tasks.push({ n: tasks.length + 1, index: i, text: m.text, ts: m.ts, replies: [] })
    else if (tasks.length) tasks.at(-1).replies.push({ m, i })
  })
  return tasks.map((t, k) => {
    const isLast = k === tasks.length - 1
    const replies = t.replies.map(({ m, i }, j) => {
      let cause = 'user'
      for (let q = j - 1; q >= 0; q--) { const prev = t.replies[q].m; if (prev.status === 'done' && mentionsIn(prev.text, room.agents, prev.from).includes(m.from)) { cause = t.replies[q].i; break } }
      return {
        index: i, from: m.from, status: m.status ?? 'done', ts: m.ts, durationMs: m.durationMs ?? null, tools: (m.tools ?? []).length,
        lastTool: (m.tools ?? []).at(-1) ?? null, runId: m.runId, cause, mentions: m.status === 'done' ? mentionsIn(m.text, room.agents, m.from) : [],
        preview: String(m.text ?? '').replace(/\s+/g, ' ').slice(0, 160),
      }
    })
    const last = replies.at(-1)
    const running = replies.filter(r => r.status === 'pending')
    let status, waitingOn = []
    if (isLast && live) status = 'working'
    else if (!last) status = 'no-reply'
    else if (last.status === 'failed') status = 'failed'
    else if (last.status === 'cancelled') status = 'stopped'
    else if (last.status === 'pending') status = 'interrupted'
    else {
      // the last reply is the newest word in the task: whoever it hands to has not answered yet
      waitingOn = last.mentions
      status = room.mode !== 'workflow' && waitingOn.length ? 'waiting' : 'done'
    }
    const done = replies.filter(r => r.status === 'done').length
    const denom = done + running.length + waitingOn.length + (status === 'working' && !running.length ? 1 : 0)
    const endTs = last?.ts ?? t.ts
    return {
      n: t.n, index: t.index, text: t.text, ts: t.ts, status, waitingOn, current: running.map(r => r.from),
      agents: [...new Set(replies.map(r => r.from))], replies, done,
      progress: status === 'done' ? 1 : denom ? done / denom : 0,
      tools: replies.reduce((a, r) => a + r.tools, 0),
      durationMs: replies.reduce((a, r) => a + (r.durationMs ?? 0), 0),
      startedAt: t.ts, lastActivity: endTs,
    }
  })
}

export class ChatStore {
  constructor(registry, { log = () => {}, engine } = {}) {
    this.registry = registry
    this.engine = engine
    this.dir = registry.d.chats
    fs.mkdirSync(this.dir, { recursive: true })
    this.log = log
    this.live = new Map() // id -> { abort: AbortController }
    this.projectsFile = path.join(path.dirname(this.dir), 'chat-projects.json')
    this.overridesFile = path.join(path.dirname(this.dir), 'chat-project-agents.json')
  }

  // ---------------- per-project agent settings
  #readOverrides() { try { const o = JSON.parse(fs.readFileSync(this.overridesFile, 'utf8')); return o && typeof o === 'object' ? o : {} } catch { return {} } }
  #writeOverrides(o) { fs.writeFileSync(`${this.overridesFile}.tmp`, JSON.stringify(o, null, 2)); fs.renameSync(`${this.overridesFile}.tmp`, this.overridesFile) }
  #projectKey(id) { if (!id || id === GENERAL) return GENERAL; this.#assertProject(id); return id }

  /** Clean an overrides object down to the supported fields. */
  #cleanOverride(o) {
    const out = {}
    if (!o || typeof o !== 'object') return out
    for (const k of ['backend', 'model', 'effort', 'provider', 'permission', 'fallbackModel', 'instructions']) if (typeof o[k] === 'string' && o[k].trim()) out[k] = o[k].trim()
    for (const k of ['maxTurns', 'maxBudgetUsd']) if (o[k] !== undefined && o[k] !== null && o[k] !== '') { const n = Number(o[k]); if (!(n > 0)) throw new Error(`${k} must be a positive number`); out[k] = n }
    for (const k of ['skills', 'mcp']) if (Array.isArray(o[k])) out[k] = [...new Set(o[k].map(String))]
    for (const k of ['builtinSkills', 'projectMemory']) if (typeof o[k] === 'boolean') out[k] = o[k]
    if (Array.isArray(o.fallbacks)) out.fallbacks = o.fallbacks
    if (o.memory && typeof o.memory === 'object') { const m = {}; for (const k of ['mode', 'scope']) if (o.memory[k]) m[k] = String(o.memory[k]); if (Object.keys(m).length) out.memory = m }
    if (o.execution?.mode) out.execution = { mode: String(o.execution.mode) }
    return out
  }

  /** The agent definition used in a project's chats: its own definition plus the project's overrides. */
  agentDef(projectId, agentName) {
    const base = this.registry.getAgent(agentName)
    let key
    try { key = this.#projectKey(projectId) } catch { key = GENERAL }
    const o = this.#readOverrides()[key]?.[agentName]
    if (!o) return base
    const { instructions, projectMemory, ...patch } = o
    if (instructions) patch.role = `${base.role ? `${base.role.trim()}\n\n` : ''}# Instructions for this project\n${instructions}`
    const def = deepMerge(base, patch)
    // stateful agents can keep a memory (and resumable session) of their own for this project
    if (projectMemory && (def.memory?.mode ?? 'none') !== 'none') def.memory = { ...def.memory, namespace: `project-${key}-${agentName}` }
    return normalizeAgent(def)
  }

  /** Agents with per-project settings: the overrides plus the agent's own and effective settings. */
  projectAgents(projectId) {
    const key = this.#projectKey(projectId)
    const all = this.#readOverrides()[key] ?? {}
    const used = new Set(this.list().filter(r => (r.project ?? GENERAL) === key || (key === GENERAL && !r.project)).flatMap(r => r.agents))
    const brief = d => ({ backend: d.backend, model: d.model, effort: d.effort, provider: d.provider, permission: d.permission, memory: d.memory, skills: d.skills, execution: { mode: d.execution.mode }, maxTurns: d.maxTurns, maxBudgetUsd: d.maxBudgetUsd, fallbackModel: d.fallbackModel, fallbacks: d.fallbacks, builtinSkills: d.builtinSkills === true, mcp: d.mcp })
    const out = []
    for (const a of this.registry.listAgents()) {
      if (a.invalid) continue
      let effective, error
      try { effective = brief(this.agentDef(key, a.name)) } catch (e) { error = e.message }
      out.push({ name: a.name, description: a.description, inChats: used.has(a.name), overrides: all[a.name] ?? null, base: brief(a), effective, error })
    }
    return out
  }

  /** Save (or with an empty object / null, clear) one agent's settings for a project. */
  setProjectAgent(projectId, agentName, patch) {
    const key = this.#projectKey(projectId)
    assertName(agentName, 'agent name')
    this.registry.getAgent(agentName)
    const clean = this.#cleanOverride(patch)
    const all = this.#readOverrides()
    all[key] ??= {}
    const prev = all[key][agentName]
    if (Object.keys(clean).length) all[key][agentName] = clean; else delete all[key][agentName]
    if (!Object.keys(all[key]).length) delete all[key]
    this.#writeOverrides(all)
    try { this.agentDef(key, agentName) } catch (e) {
      // invalid combination: put the previous settings back
      if (prev) { all[key] ??= {}; all[key][agentName] = prev } else if (all[key]) delete all[key][agentName]
      this.#writeOverrides(all)
      throw e
    }
    return { ok: true, overrides: clean }
  }

  // ---------------- projects (tabs that group chats)
  #readProjects() {
    try { const p = JSON.parse(fs.readFileSync(this.projectsFile, 'utf8')); return Array.isArray(p) ? p : [] } catch { return [] }
  }

  #writeProjects(list) {
    fs.writeFileSync(`${this.projectsFile}.tmp`, JSON.stringify(list, null, 2))
    fs.renameSync(`${this.projectsFile}.tmp`, this.projectsFile)
  }

  #assertProject(id) {
    if (!id) return undefined
    if (!this.#readProjects().some(p => p.id === id)) throw new Error(`unknown project ${id}`)
    return id
  }

  /** Projects in creation order, each with its chat count and how many chats are busy. */
  listProjects() {
    const rooms = this.list()
    const stats = id => { const rs = rooms.filter(r => (r.project ?? '') === id); return { chats: rs.length, busy: rs.filter(r => r.busy).length } }
    return { general: stats(''), projects: this.#readProjects().map(p => ({ ...p, ...stats(p.id) })) }
  }

  createProject({ name, cwd, description } = {}) {
    name = String(name ?? '').trim()
    if (!name) throw new Error('project name is required')
    if (name.length > 80) throw new Error('project name is too long (80 characters max)')
    const list = this.#readProjects()
    if (list.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error(`a project named "${name}" already exists`)
    const p = { id: newId(), name, createdAt: now() }
    if (cwd?.trim()) p.cwd = cwd.trim()
    if (description?.trim()) p.description = description.trim()
    list.push(p)
    this.#writeProjects(list)
    return p
  }

  updateProject(id, patch = {}) {
    const list = this.#readProjects()
    const p = list.find(x => x.id === id)
    if (!p) throw new Error(`unknown project ${id}`)
    if (patch.name !== undefined) {
      const name = String(patch.name).trim()
      if (!name) throw new Error('project name is required')
      if (list.some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) throw new Error(`a project named "${name}" already exists`)
      p.name = name
    }
    if (patch.cwd !== undefined) { if (patch.cwd?.trim()) p.cwd = patch.cwd.trim(); else delete p.cwd }
    if (patch.description !== undefined) { if (patch.description?.trim()) p.description = patch.description.trim(); else delete p.description }
    this.#writeProjects(list)
    return p
  }

  /** Delete a project. Its chats are deleted too when deleteChats is set; otherwise they move to General. */
  deleteProject(id, { deleteChats = false } = {}) {
    const list = this.#readProjects()
    if (!list.some(p => p.id === id)) throw new Error(`unknown project ${id}`)
    let moved = 0, deleted = 0
    for (const r of this.list().filter(r => r.project === id)) {
      if (deleteChats) { this.delete(r.id); deleted++ }
      else { const room = this.get(r.id); delete room.busy; delete room.project; this.#save(room); moved++ }
    }
    this.#writeProjects(list.filter(p => p.id !== id))
    const ov = this.#readOverrides()
    if (ov[id]) { delete ov[id]; this.#writeOverrides(ov) }
    return { ok: true, moved, deleted }
  }

  #file(id) {
    if (!/^[\w-]{1,64}$/.test(id)) throw new Error(`invalid chat id ${id}`)
    return path.join(this.dir, `${id}.json`)
  }

  #save(room) {
    room.updatedAt = now()
    const f = this.#file(room.id)
    fs.writeFileSync(`${f}.tmp`, JSON.stringify(room, null, 2))
    fs.renameSync(`${f}.tmp`, f)
  }

  #validate(agents) {
    if (!Array.isArray(agents) || agents.length === 0) throw new Error('pick at least one agent')
    for (const a of agents) { assertName(a, 'agent name'); this.registry.getAgent(a) }
    return [...new Set(agents)]
  }

  list() {
    return fs.readdirSync(this.dir).filter(f => f.endsWith('.json')).map(f => {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'))
        const tasks = summarizeTasks(r, this.live.has(r.id))
        const t = tasks.at(-1)
        const task = t ? { n: t.n, status: t.status, progress: t.progress, current: t.current, waitingOn: t.waitingOn, done: t.done } : null
        return { id: r.id, title: r.title, project: r.project, agents: r.agents, mode: r.mode, team: r.team, workflow: r.workflow, busy: this.live.has(r.id), messages: r.messages.length, updatedAt: r.updatedAt, tasks: tasks.length, task }
      } catch { return null }
    }).filter(Boolean).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  }

  /** The room as the UI shows it: the stored room plus its task summaries. */
  view(id) {
    const room = this.get(id)
    return { ...room, tasks: summarizeTasks(room, room.busy) }
  }

  get(id) {
    const room = JSON.parse(fs.readFileSync(this.#file(id), 'utf8'))
    room.busy = this.live.has(id)
    return room
  }

  create({ title, agents, team, mode = 'sequential', cwd, maxHops = 4, lead, workflow, workflowArgs, project }) {
    project = this.#assertProject(project)
    if (!cwd && project) cwd = this.#readProjects().find(p => p.id === project)?.cwd
    if (team && (!agents || agents.length === 0)) agents = this.registry.getTeam(team).members
    if (!CHAT_MODES.includes(mode)) throw new Error(`mode must be one of ${CHAT_MODES.join(', ')}`)
    const room = {
      id: newId(), title: title?.trim() || `Chat with ${this.#validate(agents).join(', ')}`,
      agents: this.#validate(agents), team: team || undefined, mode, cwd: cwd || undefined,
      maxHops: clampHops(maxHops), createdAt: now(), messages: [],
    }
    if (project) room.project = project
    if (lead) room.lead = lead
    if (workflow) room.workflow = workflow
    if (workflowArgs) room.workflowArgs = this.#args(workflowArgs)
    this.#save(room)
    return room
  }

  update(id, patch) {
    const room = this.get(id)
    if (patch.title !== undefined) room.title = String(patch.title).trim() || room.title
    if (patch.agents !== undefined) room.agents = this.#validate(patch.agents)
    if (patch.mode !== undefined) { if (!CHAT_MODES.includes(patch.mode)) throw new Error('bad mode'); room.mode = patch.mode }
    if (patch.cwd !== undefined) room.cwd = patch.cwd || undefined
    if (patch.project !== undefined) room.project = this.#assertProject(patch.project || undefined)
    if (patch.maxHops !== undefined) room.maxHops = clampHops(patch.maxHops)
    if (patch.lead !== undefined) { if (patch.lead && !room.agents.includes(patch.lead)) throw new Error("lead must be one of this chat's agents"); room.lead = patch.lead || undefined }
    if (patch.workflow !== undefined) { if (patch.workflow) this.registry.orchestrationFile(patch.workflow); room.workflow = patch.workflow || undefined }
    if (patch.workflowArgs !== undefined) room.workflowArgs = this.#args(patch.workflowArgs)
    delete room.busy
    this.#save(room)
    return room
  }

  #args(v) {
    if (v == null || v === '') return undefined
    if (typeof v !== 'object' || Array.isArray(v)) throw new Error('workflowArgs must be an object of key: value')
    return Object.fromEntries(Object.entries(v).filter(([k]) => /^[\w.-]+$/.test(k)).map(([k, x]) => [k, String(x)]))
  }

  /** The agent that opens a handoff-mode turn: the room's lead, else the team's first member in the room, else the first agent. */
  #lead(room) {
    if (room.lead && room.agents.includes(room.lead)) return room.lead
    if (room.team) { try { const m = this.registry.getTeam(room.team).members.find(a => room.agents.includes(a)); if (m) return m } catch {} }
    return room.agents[0]
  }

  delete(id) {
    this.cancel(id)
    fs.rmSync(this.#file(id), { force: true })
  }

  cancel(id) {
    const l = this.live.get(id)
    if (!l) return false
    l.abort.abort()
    return true
  }

  /** Append a user message and start agent replies in the background. */
  post(id, text) {
    this.#start(id, text)
    return { ok: true }
  }

  /** Post a message and start replies; returns the user message and a promise for the end of the replies. */
  #start(id, text, { via, runner } = {}) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('empty message')
    if (this.live.has(id)) throw new Error('agents are still replying; wait or press Stop')
    const room = this.get(id)
    delete room.busy
    const userMsg = { id: newId(), from: 'user', text: text.trim(), ts: now() }
    if (via) userMsg.via = via
    room.messages.push(userMsg)
    this.#save(room)
    const abort = new AbortController()
    this.live.set(id, { abort })
    const done = this.#respond(id, abort.signal, runner)
      .catch(e => this.log(`chat ${id}: ${e?.message ?? e}`))
      .finally(() => this.live.delete(id))
    return { userMsg, done }
  }

  /** Wait until the room is free (nobody replying), up to timeoutMs; throws when it stays busy or signal aborts. */
  async #whenFree(id, { signal, timeoutMs = 15 * 60_000 } = {}) {
    const t0 = Date.now()
    while (this.live.has(id)) {
      if (signal?.aborted) throw new Error('stopped')
      if (Date.now() - t0 > timeoutMs) throw new Error(`chat ${id} stayed busy for ${Math.round(timeoutMs / 60000)} minutes`)
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  /**
   * Post a message from a super team into the room and wait for the replies (room mode, lead, hand-offs,
   * project agent settings and the room's own history all apply). Waits first if the room is busy.
   * runner(agentName, { def, prompt, contextNote, cwd, team, signal, onEvent }) replaces runAgent so the replies
   * run inside the caller's run. Stopping via `signal` stops the room's replies.
   * Returns { replies: [{ from, ok, text, status }] }.
   */
  async postAndWait(id, text, { via, runner, signal, timeoutMs } = {}) {
    this.get(id) // exists
    await this.#whenFree(id, { signal, timeoutMs })
    if (signal?.aborted) throw new Error('stopped')
    const { userMsg, done } = this.#start(id, text, { via, runner })
    const onAbort = () => this.cancel(id)
    signal?.addEventListener('abort', onAbort, { once: true })
    try { await done } finally { signal?.removeEventListener('abort', onAbort) }
    const room = this.get(id)
    const i = room.messages.findIndex(m => m.id === userMsg.id)
    const replies = (i < 0 ? [] : room.messages.slice(i + 1)).filter(m => m.from !== 'user')
    return { replies: replies.map(m => ({ from: m.from, ok: m.status === 'done', status: m.status, text: m.text ?? '' })) }
  }

  /** Copy an exchange that ran elsewhere into the room: the brief as a user message, then the replies (all finished). */
  async appendExchange(id, { text, via, replies = [] }, { signal } = {}) {
    await this.#whenFree(id, { signal, timeoutMs: 5 * 60_000 })
    const room = this.get(id)
    delete room.busy
    const user = { id: newId(), from: 'user', text: String(text ?? '').trim() || '(no brief)', ts: now() }
    if (via) user.via = { ...via, copy: true }
    room.messages.push(user)
    for (const r of replies) room.messages.push({ id: newId(), from: r.from, model: r.model, text: r.text ?? '', status: r.ok ? 'done' : 'failed', tools: [], ts: now(), ...(r.durationMs ? { durationMs: r.durationMs } : {}) })
    this.#save(room)
    return { ok: true }
  }

  /** The chat project with this name, created (with the folder and description) when missing. */
  ensureProject({ name, cwd, description }) {
    name = String(name ?? '').trim().slice(0, 80)
    if (!name) return undefined
    const p = this.#readProjects().find(x => x.name.toLowerCase() === name.toLowerCase())
    return p ?? this.createProject({ name, cwd, description })
  }

  #mentions(text, room) {
    const found = []
    for (const m of text.matchAll(/@([a-z][a-z0-9-]*)/g)) if (room.agents.includes(m[1]) && !found.includes(m[1])) found.push(m[1])
    return found
  }

  async #respond(id, signal, runner) {
    let room = this.get(id)
    const userMsg = room.messages.at(-1)
    const mentioned = this.#mentions(userMsg.text, room)
    if (room.mode === 'workflow') return this.#workflow(id, userMsg.text, signal)
    let first
    if (room.mode === 'mention') first = mentioned.length ? mentioned : [room.agents[0]]
    else if (room.mode === 'handoff') first = mentioned.length ? mentioned : [this.#lead(room)]
    else first = mentioned.length ? mentioned : room.agents

    if (room.mode === 'parallel' && first.length > 1) {
      const cut = room.messages.length
      await Promise.all(first.map(a => this.#reply(id, a, signal, cut, runner)))
    } else {
      for (const a of first) { if (signal.aborted) return; await this.#reply(id, a, signal, undefined, runner) }
    }

    // hand-offs: an agent reply that @mentions another room agent gives it the floor
    let hops = 0
    room = this.get(id)
    while (!signal.aborted && hops < room.maxHops) {
      const last = room.messages.at(-1)
      if (!last || last.from === 'user' || last.status !== 'done') break
      const next = this.#mentions(last.text, room).filter(a => a !== last.from)
      if (!next.length) break
      for (const a of next) { if (signal.aborted) break; await this.#reply(id, a, signal, undefined, runner); hops++ }
      room = this.get(id)
    }
  }

  /** Workflow mode: run the room's orchestration for this message and mirror its progress into one chat message. */
  async #workflow(id, text, signal) {
    let room = this.get(id)
    const msg = { id: newId(), from: `workflow:${room.workflow ?? '?'}`, model: 'workflow', text: '', status: 'pending', tools: [], ts: now() }
    room.messages.push(msg); delete room.busy; this.#save(room)
    const patch = fn => { const r = this.get(id); delete r.busy; const m = r.messages.find(x => x.id === msg.id); if (m) { fn(m); this.#save(r) } }
    const t0 = Date.now()
    const fence = '```'
    try {
      if (!this.engine) throw new Error('workflow mode needs the forge engine (not available in this process)')
      if (!room.workflow) throw new Error('pick a workflow for this chat first (Workflow dropdown in the chat header)')
      const args = { ...(room.team ? { team: room.team } : {}), ...(room.workflowArgs ?? {}), message: text }
      const run = this.engine.start(room.workflow, args, { cwd: room.cwd })
      patch(m => { m.runId = run.id; m.text = `Started workflow **${room.workflow}** (run \`${run.id}\`) with args:\n\n${fence}json\n${JSON.stringify(args, null, 2)}\n${fence}` })
      const onAbort = () => this.engine.cancel(run.id)
      signal.addEventListener('abort', onAbort, { once: true })
      const render = (st, final) => {
        const mark = s => s === 'completed' ? '✓' : s === 'failed' ? '✗' : s === 'running' ? '…' : '·'
        const agents = (st.agents ?? []).map(a => `- ${mark(a.status)} ${a.label ?? a.agent} (${a.agent}) ${a.status}${a.lastTool && a.status === 'running' ? ` — ${a.lastTool}` : ''}`)
        const logs = (st.log ?? []).slice(-8).map(l => `- ${l.msg}`)
        const head = `**${room.workflow}** run \`${st.id}\` — **${st.status}**${st.phase ? ` · phase: ${st.phase}` : ''}${st.costUsd ? ` · $${Number(st.costUsd).toFixed(2)}` : ''}`
        const parts = [head, agents.length ? `**Agents**\n${agents.join('\n')}` : '', logs.length ? `**Log**\n${logs.join('\n')}` : '']
        if (final) {
          if (st.error) parts.push(`**Error**\n${fence}\n${String(st.error).slice(0, 3000)}\n${fence}`)
          if (st.result != null) {
            const r = typeof st.result === 'string' ? st.result : JSON.stringify(st.result, null, 2)
            parts.push(`**Result**\n${fence}\n${r.length > 12000 ? r.slice(0, 12000) + '\n…(truncated; full result in the run folder)' : r}\n${fence}`)
          }
          parts.push(`Full details: Workflows → Runs → \`${st.id}\`.`)
        }
        return parts.filter(Boolean).join('\n\n')
      }
      const timer = setInterval(() => {
        try { const st = this.engine.getRun(run.id); patch(m => { m.text = render(st, false); m.tools = (st.agents ?? []).map(a => `${a.label ?? a.agent}: ${a.status}`) }) } catch {}
      }, 2000)
      let st
      try { st = await run.done } finally { clearInterval(timer); signal.removeEventListener('abort', onAbort) }
      patch(m => { m.text = render(st, true); m.status = st.status === 'completed' ? 'done' : st.status === 'cancelled' ? 'cancelled' : 'failed'; m.durationMs = Date.now() - t0 })
    } catch (e) {
      patch(m => { m.status = 'failed'; m.text = `${m.text ? m.text + '\n\n' : ''}Error: ${e?.message ?? e}`; m.durationMs = Date.now() - t0 })
    }
  }

  #transcript(room, uptoIndex) {
    const msgs = room.messages.slice(0, uptoIndex).filter(m => m.status !== 'failed' && m.status !== 'pending')
    let out = msgs.map(m => `[${m.from === 'user' ? 'user' : `@${m.from}`}]\n${m.text}`).join('\n\n')
    if (out.length > TRANSCRIPT_CHARS) out = `[earlier messages omitted]\n…${out.slice(-TRANSCRIPT_CHARS)}`
    return out
  }

  /** The room's team definition (description plus any extra fields such as WhatsApp channels, inbox/outbox,
   * project memory) so agents in a team chat know which channel and folders are theirs. */
  #teamNote(teamName) {
    if (!teamName) return ''
    let t
    try { t = this.registry.getTeam(teamName) } catch { return '' }
    const { name, members, orchestrations, description, ...extra } = t
    const lines = [`\n\nThis chat belongs to team "${name}"${description ? `: ${description}` : ''}.`]
    if (orchestrations?.length) lines.push(`Team orchestrations: ${orchestrations.join(', ')}.`)
    for (const [k, v] of Object.entries(extra)) lines.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    if (t.whatsapp?.length) lines.push('These are the ONLY WhatsApp chats this team works from: read their messages from the team inbox and the full exports (whatsapp-channels/exports/<team>__<title>.txt next to the inbox folder); write reply drafts only into the team outbox. Never send WhatsApp messages yourself.')
    return lines.join('\n')
  }

  /** When the latest user message came from a super team's supervisor, say so. */
  #viaNote(room) {
    const via = room.messages.findLast(m => m.from === 'user')?.via
    if (!via?.superTeam) return ''
    return `\n\nThe latest "user" message was posted by the supervisor of super team "${via.title ?? via.superTeam}", which coordinates several agent teams; it holds your team's assignment. Earlier messages in this chat may come from the human user directly.`
  }

  async #reply(id, agentName, signal, cutoff, runner) {
    let room = this.get(id)
    const def = this.agentDef(room.project, agentName)
    const transcript = this.#transcript(room, cutoff ?? room.messages.length)
    const msg = { id: newId(), from: agentName, model: def.model, text: '', status: 'pending', tools: [], ts: now() }
    room.messages.push(msg)
    delete room.busy
    this.#save(room)
    const patch = fn => { const r = this.get(id); delete r.busy; const m = r.messages.find(x => x.id === msg.id); if (m) { fn(m); this.#save(r) } }

    const others = room.agents.filter(a => a !== agentName)
    const contextNote = `You are agent "${agentName}" in a live group chat with a human user${others.length ? ` and these other agents: ${others.map(a => `@${a}`).join(', ')}` : ''}. Reply to the latest message as yourself. Use your tools when the request needs real work. To hand a question or task to another agent, mention them as @name in your reply; mention an agent only when you want them to respond next. Keep replies focused; use Markdown.${this.#teamNote(room.team)}${this.#viaNote(room)}`
    const prompt = `Group chat transcript so far:\n\n${transcript}\n\n---\nWrite your next message in this chat. Do not start it with your own name; the chat shows who is speaking.`
    let lastFlush = 0
    const onEvent = e => {
      if (e.type === 'fallback') { const model = e.model; patch(m => { m.model = model; m.fallback = true }) }
      if (e.type !== 'tool' && e.type !== 'fallback') return
      msg.tools.push(e.brief ?? e.name)
      if (Date.now() - lastFlush > 800) { lastFlush = Date.now(); const t = [...msg.tools]; patch(m => { m.tools = t }) }
    }
    const t0 = Date.now()
    let res
    if (runner) {
      try { res = (await runner(agentName, { def, prompt, contextNote, cwd: room.cwd, team: room.team, signal, onEvent })) ?? { ok: false, error: signal.aborted ? 'Stopped.' : 'not run' } }
      catch (e) { res = { ok: false, error: e?.message ?? String(e) } }
      res.durationMs ??= Date.now() - t0
    } else {
      res = await runAgent({ def, registry: this.registry, prompt, cwd: room.cwd, team: room.team, label: `chat:${agentName}`, contextNote, signal, onEvent })
    }
    patch(m => {
      m.tools = msg.tools
      m.durationMs = res.durationMs
      if (res.attempts) m.attempts = res.attempts
      if (res.ok) { m.status = 'done'; m.text = (res.text ?? JSON.stringify(res.structured, null, 2)).replace(new RegExp(`^\\s*\\**@?${agentName}\\**\\s*:\\s*`, 'i'), '') }
      else { m.status = signal.aborted ? 'cancelled' : 'failed'; m.text = signal.aborted ? 'Stopped.' : res.error }
    })
  }
}
