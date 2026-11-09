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
 *  - supervisor: the supervisor agent answers and can spawn any number of workers (fresh copies of the
 *                room's worker-role agents) at any time through its forge_team tools. Workers run in the
 *                background (maxConcurrent at once), in the shared room folder or their own git worktree,
 *                and the supervisor is woken with their results when they finish. Claude Code backend only.
 * In the agent modes, a reply that @mentions another room agent hands the floor to that
 * agent (bounded by maxHops), so agents can talk to each other.
 *
 * Channels: parallel conversations of a group chat, so one team can work on several tasks at once with the same
 * context. A channel holds some or all of the chat's agents and its own mode, messages, tasks and busy state; it
 * is stored apart (chats/sides/<group id>/, id "<group id>__<channel id>"). Its agents read the main chat and a
 * digest of the other channels as background, and use the group's project settings, team and folder (or a git
 * worktree of its own, merged with mergeChannel). When a task in a channel finishes, its final reply is posted
 * into the main chat as a note (report). Side chats are private one-agent channels that do not report.
 *
 * Other teams: claude-code agents get forge_chats tools to list team chats, ask one (ask_team opens a channel in
 * that chat, origin = the asking chat, and the answer comes back as a tool result and/or a note), and ask the
 * user to approve opening a new team chat (open_team_chat → room.approvals, decided with decide()). Requests
 * carry a chain of chats and a depth so they cannot loop (MAX_REQUEST_DEPTH, MAX_OPEN_REQUESTS).
 *
 * Direct messages: a user message with `to` goes to one agent (or worker) only, and runs even while the
 * rest of the room is busy; if that agent is replying already, the message is queued and delivered as
 * soon as it finishes.
 *
 * Every message belongs to a task (the id of the user message that started it). Each agent step records
 * the files it changed: Write/Edit tool calls, plus a before/after git snapshot of its working folder.
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
 * Super teams use rooms as their teams' chats (plugins/super-team): postAndWait() posts a supervisor brief as a
 * new task and waits for it; every reply of that task (agents, supervisor, workers) runs through the caller's
 * runner, so it counts in the super team's run (cost, transcripts). appendExchange() copies a discussion that
 * ran elsewhere into a room for visibility. Such messages carry `via: { superTeam, title, step }`.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { assertName, deepMerge, normalizeAgent } from './registry.js'
import { runAgent, resolveCwd, toolsMcp, quickQuery } from './runner.js'
import { listMemory, saveNote, deleteNote } from './memory.js'
import { snapshot, changedFiles, fileDiff, addWorktree, finishWorktree, mergeWorktree, removeWorktree } from './snapshots.js'

export const CHAT_MODES = ['sequential', 'parallel', 'mention', 'handoff', 'workflow', 'supervisor']
export const MAX_HOPS = 50
const GENERAL = '_general'
const MAX_WAKES = 60
const MAX_REQUEST_DEPTH = 3 // a request to another team may be passed on at most this many times
const MAX_OPEN_REQUESTS = 3 // open requests to other teams (or pending approvals) per chat
const clampHops = v => Math.max(0, Math.min(MAX_HOPS, Number(v) || 0))
const clampInt = (v, lo, hi, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt }
const TRANSCRIPT_CHARS = 60000
const SIDE_CONTEXT_CHARS = 40000 // group chat background given to an agent in a side chat
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

const now = () => new Date().toISOString()
const newId = () => `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n)}…` : s }

class Semaphore {
  constructor(n) { this.n = n; this.q = [] }
  async acquire() { if (this.n > 0) { this.n--; return } await new Promise(r => this.q.push(r)) }
  release() { const r = this.q.shift(); if (r) r(); else this.n++ }
}

/** Everyone who can speak or be addressed in a room: its agents plus its spawned workers. */
const speakers = room => [...room.agents, ...Object.keys(room.workers ?? {})]

const mentionsIn = (text, names, self) => {
  const out = []
  for (const m of String(text ?? '').matchAll(/@([a-z][a-z0-9-]*)/g)) if (names.includes(m[1]) && m[1] !== self && !out.includes(m[1])) out.push(m[1])
  return out
}

/**
 * Split a room into tasks (one per user message) and describe each: who replied, what caused each reply
 * (the user's message, an earlier agent's @mention, or the supervisor spawning a worker), and where the task stands:
 *   working     agents are replying right now (or workers are queued for it)
 *   queued      a direct message waiting for its agent to finish another reply
 *   waiting     the last reply hands work to @agents but nobody took it (hand-off limit reached or cut short)
 *   done        the last reply finished without handing off
 *   failed / stopped / interrupted / no-reply
 * progress = finished replies / (finished + running + still-waiting agents).
 */
export function summarizeTasks(room, live = false) {
  const names = speakers(room)
  const tasks = []
  const byId = new Map()
  room.messages.forEach((m, i) => {
    if (m.from === 'user' && (!m.task || m.task === m.id)) {
      const t = { n: tasks.length + 1, id: m.id, index: i, text: m.text, to: m.to, queued: !!m.queued, ts: m.ts, replies: [] }
      tasks.push(t); byId.set(m.id, t)
    } else {
      const t = m.task ? byId.get(m.task) : tasks.at(-1)
      if (t && m.from !== 'user' && !m.note) t.replies.push({ m, i })
    }
  })
  const idxOf = new Map(room.messages.map((m, i) => [m.id, i]))
  const workers = Object.values(room.workers ?? {})
  return tasks.map((t, k) => {
    const isLast = k === tasks.length - 1
    const replies = t.replies.map(({ m, i }, j) => {
      let cause = 'user'
      if (m.cause && m.cause !== 'user' && idxOf.has(m.cause)) cause = idxOf.get(m.cause)
      else if (!m.cause) {
        for (let q = j - 1; q >= 0; q--) { const prev = t.replies[q].m; if (prev.status === 'done' && mentionsIn(prev.text, names, prev.from).includes(m.from)) { cause = t.replies[q].i; break } }
      }
      return {
        index: i, from: m.from, to: m.to, role: m.role, worker: !!m.worker, status: m.status ?? 'done', ts: m.ts, durationMs: m.durationMs ?? null, tools: (m.tools ?? []).length,
        lastTool: (m.tools ?? []).at(-1) ?? null, runId: m.runId, cause, files: (m.files ?? []).length,
        mentions: m.status === 'done' && room.mode !== 'supervisor' ? mentionsIn(m.text, names, m.from) : [],
        preview: String(m.text ?? '').replace(/\s+/g, ' ').slice(0, 160),
      }
    })
    const last = replies.at(-1)
    const running = replies.filter(r => r.status === 'pending')
    const queuedWorkers = live ? workers.filter(w => w.task === t.id && (w.status === 'queued' || w.status === 'running')).map(w => w.id) : []
    let status, waitingOn = []
    if (live && (running.length || queuedWorkers.length)) status = 'working'
    else if (live && t.queued) status = 'queued'
    else if (live && isLast && !last) status = 'working'
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
    const extra = queuedWorkers.filter(w => !running.some(r => r.from === w)).length
    const denom = done + running.length + extra + waitingOn.length + (status === 'working' && !running.length && !extra ? 1 : 0)
    const endTs = last?.ts ?? t.ts
    return {
      n: t.n, id: t.id, index: t.index, text: t.text, to: t.to, ts: t.ts, status, waitingOn, current: [...new Set([...running.map(r => r.from), ...queuedWorkers])],
      agents: [...new Set(replies.map(r => r.from))], replies, done,
      progress: status === 'done' ? 1 : denom ? done / denom : 0,
      tools: replies.reduce((a, r) => a + r.tools, 0),
      files: replies.reduce((a, r) => a + r.files, 0),
      durationMs: replies.reduce((a, r) => a + (r.durationMs ?? 0), 0),
      startedAt: t.ts, lastActivity: endTs,
    }
  })
}

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One sentence: what this project is and where it stands' },
    status: { type: 'string', enum: ['on-track', 'in-progress', 'blocked', 'done', 'idle'] },
    summary: { type: 'string', description: 'Markdown, 1-3 short paragraphs: goal, what has been done, current state' },
    phases: {
      type: 'array', description: 'The project as 3-8 stages in order, for a flow chart',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'short id like p1' },
          title: { type: 'string', description: '2-5 words' },
          detail: { type: 'string', description: 'one sentence' },
          status: { type: 'string', enum: ['done', 'active', 'planned', 'blocked'] },
          agents: { type: 'array', items: { type: 'string' } },
          tasks: { type: 'array', items: { type: 'number' }, description: 'task numbers (#n) in this stage' },
        },
        required: ['id', 'title', 'status'],
      },
    },
    links: {
      type: 'array', description: 'Arrows between phases when the flow is not simply one after another (branches, loops back)',
      items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' } }, required: ['from', 'to'] },
    },
    decisions: { type: 'array', items: { type: 'string' } },
    open: { type: 'array', items: { type: 'string' }, description: 'open questions, blockers, risks' },
    next: { type: 'array', items: { type: 'string' }, description: 'next steps' },
  },
  required: ['headline', 'status', 'summary', 'phases'],
}

export class ChatStore {
  constructor(registry, { log = () => {}, engine } = {}) {
    this.registry = registry
    this.engine = engine
    this.dir = registry.d.chats
    fs.mkdirSync(this.dir, { recursive: true })
    this.log = log
    /** id -> { abort, runs, agents: Map<who, count>, replies: Map<who, Set<AbortController>>, inbox: Map<who, msgId[]>, workers: Map<wid, {task, promise}>, sem, supLock } */
    this.live = new Map()
    this.waiters = new Map() // room id -> [resolve] for agents waiting on a request's answer
    this.summaries = new Set()
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
    const side = id.indexOf('__')
    // side chats live next to their group chat: chats/sides/<parent id>/<parent id>__<side id>.json
    if (side > 0) return path.join(this.dir, 'sides', id.slice(0, side), `${id}.json`)
    return path.join(this.dir, `${id}.json`)
  }

  // ---------------- channels: parallel conversations of a group chat (side chats are one-agent channels)

  #sidesDir(parentId) { return path.join(this.dir, 'sides', parentId) }

  /**
   * Open a channel in a group chat: a parallel conversation with some or all of its agents, running at the same
   * time as the main chat and the other channels. It uses the group chat's project agent settings, team and
   * folder (or a git worktree of its own), and its agents read the main chat as background. When a task in it
   * finishes, the result is posted into the main chat as a note (report: true, the default for team channels;
   * side chats, report: false, stay private). origin marks a channel opened by another chat to ask this team.
   */
  async createChannel(parentId, { agents, title, mode, lead, maxHops, folder = 'shared', report, origin, kind } = {}) {
    if (parentId.includes('__')) throw new Error('channels cannot have channels of their own')
    const parent = this.get(parentId)
    agents = agents?.length ? agents : parent.agents
    for (const a of agents) if (!parent.agents.includes(a)) throw new Error(`"${a}" is not an agent in this chat`)
    agents = [...new Set(agents)]
    if (!['shared', 'worktree'].includes(folder)) throw new Error('folder must be shared or worktree')
    mode ??= agents.length === 1 ? 'mention' : parent.mode === 'workflow' ? 'handoff' : parent.mode
    if (!CHAT_MODES.includes(mode)) throw new Error(`mode must be one of ${CHAT_MODES.join(', ')}`)
    const side = kind === 'side' || (agents.length === 1 && report === false)
    const sid = newId()
    const n = this.sides(parentId).length + 1
    const room = {
      id: `${parentId}__${sid}`, parent: parentId,
      title: String(title ?? '').trim().slice(0, 120) || (side ? `${agents[0]} · side chat` : `Channel ${n}`),
      agents, mode, team: parent.team, cwd: parent.cwd, maxHops: maxHops !== undefined ? clampHops(maxHops) : parent.maxHops ?? 4,
      report: report ?? !side, createdAt: now(), messages: [],
    }
    if (side) room.kind = 'side'
    if (lead && agents.includes(lead)) room.lead = lead
    else if (parent.lead && agents.includes(parent.lead)) room.lead = parent.lead
    if (parent.supervisor && agents.includes(parent.supervisor)) room.supervisor = parent.supervisor
    for (const k of ['workflow', 'workflowArgs', 'workerRoles', 'maxWorkers', 'maxConcurrent']) if (parent[k] !== undefined) room[k] = parent[k]
    if (parent.project) room.project = parent.project
    if (origin) room.origin = origin
    if (folder === 'worktree') {
      const base = this.#roomFolder(parent)
      room.worktree = await addWorktree(base, path.join(this.registry.home, 'worktrees', parentId, sid), `forge/${parentId}/channel-${sid}`)
    }
    fs.mkdirSync(this.#sidesDir(parentId), { recursive: true })
    this.#save(room)
    return room
  }

  /** A private one-to-one side chat with one agent (a channel that does not report to the main chat). */
  createSide(parentId, agent, { title } = {}) {
    return this.createChannel(parentId, { agents: [agent], title: title || `${agent} · side chat ${this.sides(parentId).filter(s => s.kind === 'side' && s.agent === agent).length + 1}`, report: false, kind: 'side' })
  }

  /** The channels (and side chats) of a group chat, newest activity first. */
  sides(parentId) {
    const dir = this.#sidesDir(parentId)
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
        const last = r.messages.filter(m => !m.note).at(-1)
        return {
          id: r.id, title: r.title, agent: r.agents[0], agents: r.agents, mode: r.mode, kind: r.kind === 'side' ? 'side' : 'channel', report: r.report !== false,
          busy: this.#isBusy(r.id), messages: r.messages.length, updatedAt: r.updatedAt, createdAt: r.createdAt, pendingApprovals: (r.approvals ?? []).filter(a => a.status === 'pending').length,
          folder: r.worktree ? 'worktree' : 'shared', branch: r.worktree?.branch, merged: !!r.merged,
          origin: r.origin ? { room: r.origin.room, title: r.origin.title, agent: r.origin.agent } : undefined,
          last: last ? { from: last.from, text: clip(String(last.text ?? '').replace(/\s+/g, ' '), 160), status: last.status } : null,
        }
      } catch { return null }
    }).filter(Boolean).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  }

  /** The group chat a channel belongs to (null when it is gone). */
  #parentOf(room) {
    if (!room.parent) return null
    try { return this.get(room.parent) } catch { return null }
  }

  /** Merge a worktree channel's branch into the group chat's folder (aborted on conflict). */
  async mergeChannel(id) {
    const room = this.get(id)
    if (!room.worktree) throw new Error('this channel works in the shared folder; nothing to merge')
    if (room.merged) throw new Error('already merged')
    if (this.#isBusy(id)) throw new Error('the channel is still working; wait or stop it first')
    const stat = await finishWorktree({ ...room.worktree, id: `channel ${room.title}` })
    const r = await mergeWorktree(room.worktree)
    if (r.ok) this.#mutate(id, x => { x.merged = true; x.mergedAt = now() })
    return { ok: r.ok, output: r.output, stat }
  }

  /** What an agent in a channel (or a main chat with channels) is told about the other parallel conversations. */
  #channelDigest(parentId, selfId) {
    const others = this.sides(parentId).filter(s => s.id !== selfId && s.kind !== 'side').slice(0, 8)
    if (!others.length) return ''
    return others.map(s => `- channel "${s.title}" (${s.agents.map(a => `@${a}`).join(', ')}) ${s.busy ? 'WORKING' : 'idle'}${s.origin ? ` [asked by "${s.origin.title}"]` : ''}${s.last ? ` — latest @${s.last.from === 'user' ? 'user' : s.last.from}: ${s.last.text}` : ''}`).join('\n')
  }

  // ---------------- results of a channel or a cross-team request

  /**
   * Called when a room's live work ends. A channel posts its newest finished task into the main chat (as a note
   * that does not start replies) when report is on; a room opened by another chat (origin) sends its answer
   * back there as a note and wakes any agent waiting for it.
   */
  #taskFinished(id) {
    let room
    try { room = this.get(id) } catch { return }
    if (!room.parent && !room.origin) return
    const task = room.messages.filter(m => m.from === 'user' && m.task === m.id && !m.note).at(-1)
    if (!task || room.reported?.includes(task.id)) return
    const replies = room.messages.filter(m => m.task === task.id && m.from !== 'user' && !m.note)
    const last = replies.filter(m => m.status === 'done').at(-1) ?? replies.at(-1)
    const status = !last ? 'no reply' : last.status === 'done' ? 'done' : last.status === 'cancelled' ? 'stopped' : last.status ?? 'done'
    const answer = last ? String(last.text ?? '') : '(no reply)'
    this.#mutate(id, r => { r.reported = [...(r.reported ?? []), task.id].slice(-200) })
    const note = (target, text) => { try { this.#mutate(target, r => { r.messages.push({ id: newId(), from: 'channel', note: true, channel: id, text, status: 'done', ts: now() }) }) } catch {} }
    const parent = this.#parentOf(room)
    if (room.parent && room.report !== false && parent) {
      note(parent.id, `**Channel "${room.title}"** ${status}: ${clip(task.text.replace(/\s+/g, ' '), 200)}${room.origin ? ` _(asked by "${room.origin.title}")_` : ''}\n\n**@${last?.from ?? '?'}:** ${clip(answer, 3000)}`)
    }
    if (room.origin?.room && task.via?.fromChat === room.origin.room) {
      const where = parent ? `team chat "${parent.title}" (channel "${room.title}")` : `team chat "${room.title}"`
      note(room.origin.room, `**Answer from ${where}** to ${room.origin.agent === 'user' ? 'your' : `@${room.origin.agent}'s`} request (${status}):\n\n${clip(answer, 6000)}`)
      this.#mutate(room.origin.room, r => { const q = (r.requests ?? []).find(x => x.id === id); if (q) { q.status = status; q.endedAt = now() } })
    }
    for (const fn of this.waiters.get(id) ?? []) fn({ status, answer, from: last?.from })
    this.waiters.delete(id)
  }

  /** Wait for a room's current work to end; returns its newest answer, or null on timeout. */
  #waitFor(id, timeoutMs, signal) {
    return new Promise(resolve => {
      const done = v => { clearTimeout(t); signal?.removeEventListener('abort', ab); resolve(v) }
      const t = setTimeout(() => done(null), timeoutMs)
      const ab = () => done({ status: 'stopped', answer: 'Stopped while waiting.' })
      signal?.addEventListener('abort', ab, { once: true })
      if (!this.waiters.has(id)) this.waiters.set(id, [])
      this.waiters.get(id).push(done)
    })
  }

  /** A room's name as other chats see it: "<group chat> · <channel>" for a channel. */
  #fullTitle(room) { const p = room.parent ? this.#parentOf(room) : null; return p ? `${p.title} · ${room.title}` : room.title }

  /** The chain of chats a request passed through (main chat ids), to stop requests from looping. */
  #chainOf(room) {
    const main = room.parent ?? room.id
    const top = room.origin ?? (room.parent ? this.#parentOf(room)?.origin : undefined)
    return { main, chain: [...(top?.chain ?? []), main], depth: top?.depth ?? 0 }
  }

  /**
   * Ask another team chat: opens a channel in it (never its main chat) with its agents, posts the question there
   * and links it back to this chat. Returns { id, chat, title }. who: the asking agent, or 'user'.
   */
  async askTeam(fromId, { chat, question, agents, title } = {}, { who = 'user', msgId } = {}) {
    if (!String(question ?? '').trim()) throw new Error('question is required')
    const src = this.get(fromId)
    let target = this.get(String(chat ?? '').split('__')[0])
    const { main, chain, depth } = this.#chainOf(src)
    if (target.id === main) throw new Error('that is this team chat; to work in parallel here, open a channel instead')
    if (chain.includes(target.id)) throw new Error(`"${target.title}" is already part of this request chain; asking it again would loop`)
    if (depth + 1 > MAX_REQUEST_DEPTH) throw new Error(`requests may be passed on at most ${MAX_REQUEST_DEPTH} times`)
    const open = (src.requests ?? []).filter(q => q.status === 'open' && this.#isBusy(q.id)).length
    if (who !== 'user' && open >= MAX_OPEN_REQUESTS) throw new Error(`this chat already has ${open} open requests to other teams (limit ${MAX_OPEN_REQUESTS}); wait for one to finish`)
    const srcTitle = this.#fullTitle(src)
    const origin = { room: fromId, title: srcTitle, agent: who, msg: msgId, depth: depth + 1, chain }
    const ch = await this.createChannel(target.id, { agents, title: title || `From ${clip(srcTitle, 40)}: ${clip(question.replace(/\s+/g, ' '), 48)}`, report: true, origin })
    this.post(ch.id, question, { via: { fromChat: fromId, fromTitle: srcTitle, agent: who } })
    this.#mutate(fromId, r => { r.requests = [...(r.requests ?? []), { id: ch.id, chat: target.id, chatTitle: target.title, title: ch.title, agent: who, status: 'open', ts: now() }].slice(-100) })
    this.#mutate(fromId, r => { r.messages.push({ id: newId(), from: 'channel', note: true, channel: ch.id, text: `${who === 'user' ? 'You asked' : `@${who} asked`} team chat **"${target.title}"** in a new channel "${ch.title}":\n\n${clip(question, 1500)}`, status: 'done', ts: now() }) })
    return { id: ch.id, chat: target.id, title: ch.title }
  }

  /** Start a new team chat for a task, linked back to this chat (its result returns here as a note). */
  #openTeamChat(fromId, { team, task, title, agents, mode }, who) {
    const src = this.get(fromId)
    const t = this.registry.getTeam(team)
    const { chain, depth } = this.#chainOf(src)
    if (depth + 1 > MAX_REQUEST_DEPTH) throw new Error(`requests may be passed on at most ${MAX_REQUEST_DEPTH} times`)
    const parentSrc = src.parent ? this.#parentOf(src) : src
    const room = this.create({ title: title || `${team}: ${clip(String(task).replace(/\s+/g, ' '), 50)}`, team, agents: agents?.length ? agents : t.members, mode: mode || 'handoff', project: parentSrc?.project })
    const srcTitle = this.#fullTitle(src)
    this.#mutate(room.id, r => { r.origin = { room: fromId, title: srcTitle, agent: who, depth: depth + 1, chain } })
    this.post(room.id, task, { via: { fromChat: fromId, fromTitle: srcTitle, agent: who } })
    this.#mutate(fromId, r => {
      r.requests = [...(r.requests ?? []), { id: room.id, chat: room.id, chatTitle: room.title, title: room.title, agent: who, status: 'open', ts: now(), newChat: true }].slice(-100)
      r.messages.push({ id: newId(), from: 'channel', note: true, channel: room.id, text: `Opened a new team chat **"${room.title}"** (team ${team}) for ${who === 'user' ? 'your' : `@${who}'s`} task:\n\n${clip(task, 1500)}`, status: 'done', ts: now() })
    })
    return room
  }

  /** The user opens a new team chat from this chat (no approval needed). */
  openTeamChat(fromId, b = {}) {
    if (!String(b.task ?? '').trim()) throw new Error('task is required')
    return this.#openTeamChat(fromId, b, 'user')
  }

  /** Approve or deny an agent's pending request (opening a new team chat). */
  decide(id, aid, approve) {
    const room = this.get(id)
    const a = (room.approvals ?? []).find(x => x.id === aid)
    if (!a) throw new Error('no such request')
    if (a.status !== 'pending') throw new Error(`already ${a.status}`)
    let opened
    if (approve) opened = this.#openTeamChat(id, a, a.agent)
    this.#mutate(id, r => {
      const x = r.approvals.find(y => y.id === aid)
      x.status = approve ? 'approved' : 'denied'; x.decidedAt = now(); if (opened) x.chat = opened.id
      r.messages.push({ id: newId(), from: 'channel', note: true, text: approve ? `Approved: @${a.agent} opened team chat **"${opened.title}"**.` : `Denied: @${a.agent}'s request to open a new ${a.team} team chat.`, status: 'done', ts: now() })
    })
    return { ok: true, chat: opened?.id }
  }

  /** Tools that let an agent ask other team chats or (with the user's approval) open a new one. Claude Code backend. */
  #chatTools(id, who, getMsgId, signal) {
    const fmtRoom = r => `- ${r.id} "${r.title}"${r.team ? ` team=${r.team}` : ''} project=${this.#projectName(r.project)} agents=[${r.agents.join(', ')}] ${r.busy ? 'busy' : 'idle'}${r.channels ? ` channels=${r.channels}${r.channelsBusy ? ` (${r.channelsBusy} working)` : ''}` : ''}`
    const defs = [
      { name: 'list_team_chats', description: 'List the other team group chats (id, title, team, project, agents, busy or idle, parallel channels) you can ask for help, plus the agent teams that exist.', inputSchema: { type: 'object', properties: { project_only: { type: 'boolean', description: 'only chats in this chat\'s project' } } } },
      { name: 'ask_team', description: `Ask another team chat a question or hand it a task. It opens a new parallel channel in that chat (its main conversation is not interrupted) where its agents work on it with their own context, then their answer comes back. wait=true (default) waits for the answer (up to timeoutSec, default 900, max 1800) and returns it; wait=false returns at once and the answer is posted into this chat as a note when ready (check_request to look). Make the request self-contained. At most ${MAX_OPEN_REQUESTS} open requests per chat; requests cannot loop back to a chat already in the chain.`,
        inputSchema: { type: 'object', properties: { chat: { type: 'string', description: 'chat id from list_team_chats' }, question: { type: 'string' }, agents: { type: 'array', items: { type: 'string' }, description: 'optional subset of that chat\'s agents' }, wait: { type: 'boolean' }, timeoutSec: { type: 'number' } }, required: ['chat', 'question'] } },
      { name: 'open_team_chat', description: 'Ask the user to approve opening a NEW group chat for an agent team (from list_team_chats) to handle a separate task. Returns at once: the user approves or denies it in this chat; if approved, the new team chat starts on the task and its result is posted into this chat as a note. Use it only for substantial separate work no existing chat fits.',
        inputSchema: { type: 'object', properties: { team: { type: 'string' }, task: { type: 'string', description: 'the full, self-contained task' }, title: { type: 'string' }, reason: { type: 'string', description: 'one line for the user on why' } }, required: ['team', 'task'] } },
      { name: 'check_request', description: 'Status and (when finished) the answer of a request you made with ask_team or open_team_chat, by id. Without id, lists this chat\'s requests.', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
    ]
    const handle = async (name, a) => {
      switch (name) {
        case 'list_team_chats': {
          const me = this.get(id), main = me.parent ?? me.id
          const project = (me.parent ? this.#parentOf(me) : me)?.project
          const rooms = this.list().filter(r => r.id !== main && (!a.project_only || (r.project ?? '') === (project ?? '')))
          const teams = this.registry.listTeams?.().filter(t => !t.invalid).map(t => `- ${t.name}: ${clip(t.description ?? '', 120)} [${(t.members ?? []).join(', ')}]`) ?? []
          return `Team chats:\n${rooms.map(fmtRoom).join('\n') || '(none)'}\n\nAgent teams (for open_team_chat):\n${teams.join('\n') || '(none)'}`
        }
        case 'ask_team': {
          const q = await this.askTeam(id, { chat: a.chat, question: a.question, agents: a.agents }, { who, msgId: getMsgId() })
          if (a.wait === false) return `Asked "${q.title}" (request ${q.id}). The answer will be posted into this chat as a note; check_request("${q.id}") to look.`
          const res = await this.#waitFor(q.id, clampInt(a.timeoutSec, 30, 1800, 900) * 1000, signal)
          if (!res) return `Still working after the timeout. Request ${q.id}: the answer will be posted into this chat as a note; check_request("${q.id}") later.`
          return `Answer (${res.status}) from @${res.from ?? '?'}:\n\n${clip(res.answer, 20000)}`
        }
        case 'open_team_chat': {
          this.registry.getTeam(a.team)
          if (!String(a.task ?? '').trim()) throw new Error('task is required')
          const me = this.get(id)
          const { depth } = this.#chainOf(me)
          if (depth + 1 > MAX_REQUEST_DEPTH) throw new Error(`requests may be passed on at most ${MAX_REQUEST_DEPTH} times`)
          if ((me.approvals ?? []).filter(x => x.status === 'pending').length >= MAX_OPEN_REQUESTS) throw new Error('several requests are already waiting for the user; wait for a decision')
          const aid = newId()
          this.#mutate(id, r => { r.approvals = [...(r.approvals ?? []), { id: aid, kind: 'open_team_chat', team: a.team, task: String(a.task).trim(), title: a.title ? String(a.title).trim() : undefined, reason: a.reason ? String(a.reason) : undefined, agent: who, status: 'pending', ts: now() }].slice(-50) })
          return `Waiting for the user's approval (request ${aid}) to open a new ${a.team} team chat. You do not need to wait: carry on; if approved, its result is posted into this chat as a note.`
        }
        case 'check_request': {
          const me = this.get(id)
          if (!a.id) {
            const qs = [...(me.requests ?? []).map(q => `- ${q.id} → "${q.chatTitle}" ${this.#isBusy(q.id) ? 'working' : q.status}${q.agent !== who ? ` (by ${q.agent === 'user' ? 'the user' : '@' + q.agent})` : ''}`), ...(me.approvals ?? []).map(x => `- ${x.id} open ${x.team} team chat: ${x.status}${x.chat ? ` → ${x.chat}` : ''}`)]
            return qs.join('\n') || 'no requests yet'
          }
          const ap = (me.approvals ?? []).find(x => x.id === a.id)
          if (ap && ap.status !== 'approved') return `request ${a.id}: ${ap.status}`
          const rid = ap?.chat ?? a.id
          let r
          try { r = this.get(rid) } catch { return `request ${a.id}: its chat was deleted` }
          if (this.#isBusy(rid)) return `request ${a.id}: still working (${r.messages.filter(m => m.status === 'done' && m.from !== 'user').length} replies so far)`
          const last = r.messages.filter(m => m.from !== 'user' && !m.note && m.status === 'done').at(-1)
          return last ? `request ${a.id} finished. Answer from @${last.from}:\n\n${clip(last.text, 20000)}` : `request ${a.id}: finished without an answer`
        }
      }
      throw new Error(`unknown tool ${name}`)
    }
    return toolsMcp('forge_chats', defs, handle)
  }

  #projectName(id) { return id ? this.#readProjects().find(p => p.id === id)?.name ?? id : 'General' }

  #save(room) {
    delete room.busy
    room.updatedAt = now()
    const f = this.#file(room.id)
    fs.writeFileSync(`${f}.tmp`, JSON.stringify(room, null, 2))
    fs.renameSync(`${f}.tmp`, f)
  }

  /** Read-modify-write a room synchronously (no await between read and write, so concurrent steps cannot lose updates). */
  #mutate(id, fn) {
    const r = this.get(id)
    const out = fn(r)
    this.#save(r)
    return out
  }

  #validate(agents) {
    if (!Array.isArray(agents) || agents.length === 0) throw new Error('pick at least one agent')
    for (const a of agents) { assertName(a, 'agent name'); this.registry.getAgent(a) }
    return [...new Set(agents)]
  }

  #isBusy(id) { return (this.live.get(id)?.runs ?? 0) > 0 }

  #liveOf(id) {
    let l = this.live.get(id)
    if (!l) { l = { abort: new AbortController(), runs: 0, agents: new Map(), replies: new Map(), inbox: new Map(), workers: new Map(), sem: null, supLock: Promise.resolve(), runners: new Map() }; this.live.set(id, l) }
    return l
  }

  /** Run fn(signal) as part of the room's live work; the room is busy until every tracked run ends. */
  #track(id, fn) {
    const l = this.#liveOf(id)
    l.runs++
    return (async () => fn(l.abort.signal))()
      .catch(e => this.log(`chat ${id}: ${e?.message ?? e}`))
      .finally(() => { if (--l.runs === 0 && this.live.get(id) === l) { this.live.delete(id); this.#taskFinished(id) } })
  }

  list() {
    return fs.readdirSync(this.dir).filter(f => f.endsWith('.json')).map(f => {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'))
        const busy = this.#isBusy(r.id)
        const tasks = summarizeTasks(r, busy)
        const t = tasks.at(-1)
        const task = t ? { n: t.n, status: t.status, progress: t.progress, current: t.current, waitingOn: t.waitingOn, done: t.done } : null
        const workers = Object.values(r.workers ?? {})
        let channels = 0
        try { channels = fs.readdirSync(this.#sidesDir(r.id)).filter(x => x.endsWith('.json')).length } catch {}
        const channelsBusy = channels ? [...this.live.keys()].filter(k => k.startsWith(`${r.id}__`) && this.#isBusy(k)).length : 0
        return { id: r.id, title: r.title, project: r.project, channels, channelsBusy, pendingApprovals: (r.approvals ?? []).filter(a => a.status === 'pending').length, origin: r.origin ? { title: r.origin.title } : undefined, agents: r.agents, mode: r.mode, team: r.team, workflow: r.workflow, busy, messages: r.messages.length, updatedAt: r.updatedAt, tasks: tasks.length, task, workers: workers.length, workersActive: busy ? workers.filter(w => w.status === 'running' || w.status === 'queued').length : 0 }
      } catch { return null }
    }).filter(Boolean).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  }

  /** The room as the UI shows it: the stored room plus its task summaries and live agent activity. */
  view(id) {
    const room = this.get(id)
    const l = this.live.get(id)
    if (!room.busy) for (const w of Object.values(room.workers ?? {})) if (w.status === 'running' || w.status === 'queued') w.status = 'interrupted'
    const parent = room.parent ? this.#parentOf(room) : null
    const side = room.parent
      ? { parentTitle: parent?.title ?? '(group chat deleted)', parentAgents: parent?.agents ?? room.agents, sides: this.sides(room.parent), kind: room.kind === 'side' ? 'side' : 'channel' }
      : { sides: this.sides(id) }
    return { ...room, ...side, tasks: summarizeTasks(room, room.busy), activeAgents: l ? [...l.agents.keys()] : [], inbox: l ? Object.fromEntries([...l.inbox].map(([k, v]) => [k, v.length])) : {}, supervisorAgent: room.mode === 'supervisor' ? this.#supervisor(room) : undefined, workerRolesResolved: room.mode === 'supervisor' ? this.#roles(room) : undefined }
  }

  get(id) {
    const room = JSON.parse(fs.readFileSync(this.#file(id), 'utf8'))
    room.busy = this.#isBusy(id)
    return room
  }

  create({ title, agents, team, mode = 'sequential', cwd, maxHops = 4, lead, workflow, workflowArgs, supervisor, workerRoles, maxWorkers, maxConcurrent, project }) {
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
    this.#applySupervisor(room, { supervisor, workerRoles, maxWorkers, maxConcurrent })
    this.#save(room)
    return room
  }

  #applySupervisor(room, p) {
    if (p.supervisor !== undefined) { if (p.supervisor && !room.agents.includes(p.supervisor)) throw new Error("supervisor must be one of this chat's agents"); room.supervisor = p.supervisor || undefined }
    if (p.workerRoles !== undefined) {
      const roles = (p.workerRoles ?? []).filter(Boolean)
      for (const a of roles) { assertName(a, 'worker role'); this.registry.getAgent(a) }
      room.workerRoles = roles.length ? [...new Set(roles)] : undefined
    }
    if (p.maxWorkers !== undefined) room.maxWorkers = clampInt(p.maxWorkers, 1, 50, 10)
    if (p.maxConcurrent !== undefined) room.maxConcurrent = clampInt(p.maxConcurrent, 1, 16, 4)
  }

  update(id, patch) {
    const room = this.get(id)
    if (patch.title !== undefined) room.title = String(patch.title).trim() || room.title
    if (room.parent) {
      // a channel keeps the group chat's project and folder; its agents are some of the group chat's agents
      delete patch.project; delete patch.cwd
      if (patch.agents !== undefined) { const pa = this.#parentOf(room)?.agents ?? room.agents; for (const a of patch.agents ?? []) if (!pa.includes(a)) throw new Error(`"${a}" is not an agent in the group chat`) }
      if (patch.report !== undefined) room.report = !!patch.report
    }
    if (patch.agents !== undefined) room.agents = this.#validate(patch.agents)
    if (patch.mode !== undefined) { if (!CHAT_MODES.includes(patch.mode)) throw new Error('bad mode'); room.mode = patch.mode }
    if (patch.cwd !== undefined) room.cwd = patch.cwd || undefined
    if (patch.project !== undefined) room.project = this.#assertProject(patch.project || undefined)
    if (patch.maxHops !== undefined) room.maxHops = clampHops(patch.maxHops)
    if (patch.lead !== undefined) { if (patch.lead && !room.agents.includes(patch.lead)) throw new Error("lead must be one of this chat's agents"); room.lead = patch.lead || undefined }
    if (patch.workflow !== undefined) { if (patch.workflow) this.registry.orchestrationFile(patch.workflow); room.workflow = patch.workflow || undefined }
    if (patch.workflowArgs !== undefined) room.workflowArgs = this.#args(patch.workflowArgs)
    this.#applySupervisor(room, patch)
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

  #supervisor(room) { return room.supervisor && room.agents.includes(room.supervisor) ? room.supervisor : this.#lead(room) }

  /** Agent definitions the supervisor may spawn workers from: the chosen roles, else the room's other agents, else itself. */
  #roles(room) {
    const sup = this.#supervisor(room)
    if (room.workerRoles?.length) return room.workerRoles
    const others = room.agents.filter(a => a !== sup)
    return others.length ? others : [sup]
  }

  /** The shared room folder: the chat's working directory, else the supervisor's (or first agent's) default folder. */
  #roomFolder(room) {
    const parent = room.parent ? this.#parentOf(room) : null
    const cwd = room.worktree?.cwd ?? (parent ? parent.cwd : room.cwd)
    return resolveCwd(this.registry, this.agentDef(parent ? parent.project : room.project, room.mode === 'supervisor' ? this.#supervisor(room) : room.agents[0]), cwd)
  }

  delete(id) {
    let room
    try { room = this.get(id) } catch {}
    this.cancel(id)
    for (const w of Object.values(room?.workers ?? {})) if (w.worktree && !w.merged) removeWorktree(w.worktree).catch(() => {})
    if (room?.worktree && !room.merged) removeWorktree(room.worktree).catch(() => {})
    fs.rmSync(this.#file(id), { force: true })
    if (!id.includes('__')) {
      for (const s of this.sides(id)) { this.cancel(s.id); if (s.folder === 'worktree' && !s.merged) { try { removeWorktree(this.get(s.id).worktree).catch(() => {}) } catch {} } }
      fs.rmSync(this.#sidesDir(id), { recursive: true, force: true })
    }
  }

  cancel(id) {
    const l = this.live.get(id)
    if (!l) return false
    l.abort.abort()
    return true
  }

  /** Stop one agent's (or worker's) current reply and drop its queued direct messages. */
  cancelAgent(id, who) {
    const l = this.live.get(id)
    if (!l) return false
    const set = l.replies.get(who)
    const queued = l.inbox.get(who) ?? []
    l.inbox.delete(who)
    if (queued.length) this.#mutate(id, r => { for (const m of r.messages) if (queued.includes(m.id)) { delete m.queued; m.dropped = true } })
    if (set) for (const a of set) a.abort()
    return !!(set?.size || queued.length)
  }

  /**
   * Append a user message and start replies in the background.
   * With `to`, only that agent or worker answers (queued if it is mid-reply); otherwise the room mode decides.
   */
  post(id, text, { to, via } = {}) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('empty message')
    const room = this.get(id)
    if (room.parent && room.agents.length === 1) {
      // one-agent channel (side chat): every message goes to its agent, queued while it is still replying
      const msg = { id: newId(), from: 'user', text: text.trim(), ts: now() }
      msg.task = msg.id
      if (via) msg.via = via
      room.messages.push(msg)
      this.#save(room)
      const queued = this.#deliver(id, room.agents[0], [msg.id]) === 'queued'
      return { ok: true, id: msg.id, queued }
    }
    if (to && !speakers(room).includes(to)) throw new Error(`"${to}" is not an agent or worker in this chat`)
    const busy = this.#isBusy(id)
    if (!to && busy && room.mode !== 'supervisor') throw new Error(`agents are still replying: open a ${room.parent ? 'new ' : ''}channel to run another task in parallel, message one agent directly, wait, or press Stop`)
    const msg = { id: newId(), from: 'user', text: text.trim(), ts: now() }
    msg.task = msg.id
    if (to) msg.to = to
    if (via) msg.via = via
    room.messages.push(msg)
    this.#save(room)
    if (to) this.#deliver(id, to, [msg.id])
    else if (room.mode === 'supervisor' && busy) this.#deliver(id, this.#supervisor(room), [msg.id])
    else this.#track(id, signal => this.#respond(id, msg.id, signal))
    return { ok: true, id: msg.id }
  }

  /** Wait until nobody in the room is replying, up to timeoutMs; throws when it stays busy or signal aborts. */
  async #whenFree(id, { signal, timeoutMs = 15 * 60_000 } = {}) {
    const t0 = Date.now()
    while (this.#isBusy(id)) {
      if (signal?.aborted) throw new Error('stopped')
      if (Date.now() - t0 > timeoutMs) throw new Error(`chat ${id} stayed busy for ${Math.round(timeoutMs / 60000)} minutes`)
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  /**
   * Post a message from a super team into the room as a new task and wait for it (room mode, lead, hand-offs,
   * supervisor and workers, project agent settings and the room's history all apply). Waits first while the
   * room is busy. runner(who, { def, prompt, contextNote, cwd, team, signal, onEvent, extraMcp }) replaces
   * runAgent for every reply of this task. Stopping via `signal` stops the room.
   * Returns { replies: [{ from, ok, text, status }] } (the task's agent replies, in order).
   */
  async postAndWait(id, text, { via, runner, signal, timeoutMs } = {}) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('empty message')
    this.get(id) // exists
    await this.#whenFree(id, { signal, timeoutMs })
    if (signal?.aborted) throw new Error('stopped')
    const room = this.get(id)
    const msg = { id: newId(), from: 'user', text: text.trim(), ts: now() }
    msg.task = msg.id
    if (via) msg.via = via
    room.messages.push(msg)
    this.#save(room)
    const l = this.#liveOf(id)
    if (runner) l.runners.set(msg.id, runner)
    const onAbort = () => this.cancel(id)
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      await this.#track(id, sig => this.#respond(id, msg.id, sig))
      // supervisor mode: workers of this task may still be finishing
      while (this.#isBusy(id) && [...(this.live.get(id)?.workers.values() ?? [])].some(w => w.task === msg.id)) await new Promise(r => setTimeout(r, 500))
    } finally {
      signal?.removeEventListener('abort', onAbort)
      l.runners.delete(msg.id)
    }
    const replies = this.get(id).messages.filter(m => m.task === msg.id && m.from !== 'user' && !m.note && !m.worker)
    return { replies: replies.map(m => ({ from: m.from, ok: m.status === 'done', status: m.status, text: m.text ?? '' })) }
  }

  /** Copy an exchange that ran elsewhere into the room as one finished task: the brief, then the replies. */
  async appendExchange(id, { text, via, replies = [] }, { signal } = {}) {
    await this.#whenFree(id, { signal, timeoutMs: 5 * 60_000 })
    return this.#mutate(id, room => {
      const user = { id: newId(), from: 'user', text: String(text ?? '').trim() || '(no brief)', ts: now() }
      user.task = user.id
      if (via) user.via = { ...via, copy: true }
      room.messages.push(user)
      for (const r of replies) room.messages.push({ id: newId(), from: r.from, model: r.model, text: r.text ?? '', status: r.ok ? 'done' : 'failed', tools: [], ts: now(), task: user.id, cause: 'user', ...(r.durationMs ? { durationMs: r.durationMs } : {}) })
      return { ok: true }
    })
  }

  /** The chat project with this name, created (with the folder and description) when missing. */
  ensureProject({ name, cwd, description }) {
    name = String(name ?? '').trim().slice(0, 80)
    if (!name) return undefined
    const p = this.#readProjects().find(x => x.name.toLowerCase() === name.toLowerCase())
    return p ?? this.createProject({ name, cwd, description })
  }

  /** Hand messages to one agent: run now if it is free, else queue them until its current reply ends. */
  #deliver(id, who, msgIds) {
    const l = this.#liveOf(id)
    if ((l.agents.get(who) ?? 0) > 0) {
      l.inbox.set(who, [...(l.inbox.get(who) ?? []), ...msgIds])
      this.#mutate(id, r => { for (const m of r.messages) if (msgIds.includes(m.id)) m.queued = true })
      return 'queued'
    }
    this.#track(id, signal => this.#directTurn(id, who, msgIds, signal))
    return 'started'
  }

  async #directTurn(id, who, msgIds, signal) {
    const room = this.get(id)
    const first = room.messages.find(m => m.id === msgIds[0])
    const task = first?.task ?? msgIds[0]
    if (room.workers?.[who]) {
      // a follow-up step for a worker: runs after its current step, and is registered so wait_for_workers sees it
      const l = this.#liveOf(id)
      const prev = l.workers.get(who)?.promise
      const p = (async () => { if (prev) await prev.catch(() => {}); return this.#workerTurn(id, who, { messages: msgIds }, signal) })()
      l.workers.set(who, { task: room.workers[who].task, promise: p })
      p.finally(() => { if (l.workers.get(who)?.promise === p) l.workers.delete(who) })
      return p
    }
    if (room.mode === 'supervisor' && who === this.#supervisor(room)) return this.#supervise(id, task, signal, { direct: msgIds })
    await this.#reply(id, who, signal, { task, cause: first?.from === 'user' ? 'user' : msgIds[0], direct: msgIds })
    if (room.mode !== 'workflow' && room.mode !== 'supervisor') await this.#handoffs(id, task, signal)
  }

  async #respond(id, task, signal) {
    const room = this.get(id)
    const userMsg = room.messages.find(m => m.id === task)
    if (room.mode === 'workflow') return this.#workflow(id, task, userMsg.text, signal)
    if (room.mode === 'supervisor') return this.#supervise(id, task, signal, {})
    const mentioned = mentionsIn(userMsg.text, room.agents)
    let first
    if (room.mode === 'mention') first = mentioned.length ? mentioned : [room.agents[0]]
    else if (room.mode === 'handoff') first = mentioned.length ? mentioned : [this.#lead(room)]
    else first = mentioned.length ? mentioned : room.agents

    if (room.mode === 'parallel' && first.length > 1) {
      const cut = room.messages.length
      await Promise.all(first.map(a => this.#reply(id, a, signal, { task, cause: 'user', cutoff: cut })))
    } else {
      for (const a of first) { if (signal.aborted) return; await this.#reply(id, a, signal, { task, cause: 'user' }) }
    }
    await this.#handoffs(id, task, signal)
  }

  /** Hand-offs: while the task's newest reply @mentions another room agent, give that agent the floor. */
  async #handoffs(id, task, signal) {
    let hops = 0
    let room = this.get(id)
    while (!signal.aborted && hops < room.maxHops) {
      const last = room.messages.filter(m => m.task === task && m.from !== 'user').at(-1)
      if (!last || last.status !== 'done') break
      const next = mentionsIn(last.text, room.agents, last.from)
      if (!next.length) break
      for (const a of next) { if (signal.aborted) break; await this.#reply(id, a, signal, { task, cause: last.id }); hops++ }
      room = this.get(id)
    }
  }

  // ---------------- supervisor mode

  /** One supervisor turn for a task, then wake it with worker results until the task's workers are all reported. */
  async #supervise(id, task, signal, { direct }) {
    const l = this.#liveOf(id)
    const sup = this.#supervisor(this.get(id))
    // one supervisor reply at a time per room
    const locked = fn => { const p = l.supLock.then(fn, fn); l.supLock = p.catch(() => {}); return p }
    await locked(() => this.#reply(id, sup, signal, { task, cause: direct ? (this.get(id).messages.find(m => m.id === direct[0])?.from === 'user' ? 'user' : direct[0]) : 'user', direct, supervisorTask: task }))
    for (let wakes = 0; !signal.aborted && wakes < MAX_WAKES; wakes++) {
      const room = this.get(id)
      const unreported = Object.values(room.workers ?? {}).filter(w => w.task === task && !w.reported && ['done', 'failed', 'stopped'].includes(w.status))
      if (!unreported.length) {
        const running = [...l.workers.values()].filter(w => w.task === task).map(w => w.promise)
        if (!running.length) break
        await Promise.race(running)
        await new Promise(r => setTimeout(r, 1500)) // batch workers that finish together
        wakes--
        continue
      }
      const ids = unreported.map(w => w.id)
      this.#mutate(id, r => { for (const w of ids) if (r.workers[w]) r.workers[w].reported = true })
      const updates = unreported.map(w => `### ${w.id} (${w.role}) — ${w.status}${w.diffStat ? `\nBranch ${w.worktree?.branch} (not merged yet; use merge_worker):\n${w.diffStat}` : ''}\n${clip(room.messages.find(m => m.id === w.msgId)?.text ?? w.error ?? '', 6000)}`).join('\n\n')
      const lastMsg = unreported.map(w => w.msgId).filter(Boolean).at(-1)
      await locked(() => this.#reply(id, sup, signal, { task, cause: lastMsg ?? 'user', supervisorTask: task, updates }))
    }
  }

  #supervisorTools(id, task, getMsgId) {
    const room = this.get(id)
    const roles = this.#roles(room)
    const defs = [
      { name: 'spawn_worker', description: `Start a new worker agent in the background and return its id immediately. A worker is a fresh copy of a role agent that works only on the assignment you give it, so make the assignment self-contained (goal, files or areas, constraints, what to report). Roles: ${roles.join(', ')}. isolation "shared" (default): the worker edits the shared room folder directly; use it for independent files, reading or research. isolation "worktree": the worker gets its own git worktree and branch from HEAD (uncommitted changes in the room folder are not included); use it when parallel workers might edit the same files, then call merge_worker when it is done.`,
        inputSchema: { type: 'object', properties: { role: { type: 'string', enum: roles }, task: { type: 'string', description: 'the full assignment' }, isolation: { type: 'string', enum: ['shared', 'worktree'] } }, required: ['role', 'task'] } },
      { name: 'list_workers', description: 'Every worker in this chat: id, role, status (queued, running, done, failed, stopped), assignment, isolation, branch and a preview of its result.', inputSchema: { type: 'object', properties: {} } },
      { name: 'wait_for_workers', description: 'Wait until the given workers (default: all unfinished workers) finish, or timeoutSec passes (default 300, max 1800), and return their full results. You do not have to wait: if you end your turn, you are woken with results automatically as workers finish.',
        inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } }, timeoutSec: { type: 'number' } } } },
      { name: 'message_worker', description: 'Send a message to a worker: more instructions, a correction or a follow-up task. A running worker gets it when its current step ends; a finished worker starts a new step with it.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] } },
      { name: 'stop_worker', description: 'Stop a queued or running worker.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      { name: 'merge_worker', description: "Merge a finished worktree worker's branch into the room folder's current branch (git merge --no-ff). On conflict the merge is aborted and the output is returned so you can resolve it (for example by messaging the worker to rebase).",
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    ]
    const workerOf = wid => { const w = this.get(id).workers?.[wid]; if (!w) throw new Error(`no worker "${wid}"; call list_workers`); return w }
    const handle = async (name, a) => {
      switch (name) {
        case 'spawn_worker': {
          const wid = this.#spawn(id, task, getMsgId(), a)
          return `spawned ${wid} (${a.role}, ${a.isolation ?? 'shared'}). It runs in the background; mention it as @${wid}.`
        }
        case 'list_workers': {
          const ws = Object.values(this.get(id).workers ?? {})
          if (!ws.length) return 'no workers yet'
          return JSON.stringify(ws.map(w => ({ id: w.id, role: w.role, status: w.status, task: w.task === task ? 'this task' : w.task, isolation: w.isolation, branch: w.worktree?.branch, merged: w.merged, assignment: clip(w.assignment, 300), result: clip(this.get(id).messages.find(m => m.id === w.msgId)?.text ?? w.error ?? '', 400) })), null, 2)
        }
        case 'wait_for_workers': {
          const l = this.#liveOf(id)
          const r0 = this.get(id)
          const ids = a.ids?.length ? a.ids : Object.values(r0.workers ?? {}).filter(w => w.status === 'queued' || w.status === 'running' || !w.reported).map(w => w.id)
          for (const w of ids) workerOf(w)
          const promises = ids.map(w => l.workers.get(w)?.promise).filter(Boolean)
          const ms = clampInt((a.timeoutSec ?? 300) * 1000, 1000, 1800000, 300000)
          let timer
          await Promise.race([Promise.all(promises), new Promise(r => { timer = setTimeout(r, ms) }), new Promise(r => l.abort.signal.addEventListener('abort', r, { once: true }))])
          clearTimeout(timer)
          const room = this.get(id)
          const out = ids.map(wid => {
            const w = room.workers[wid]
            const finished = ['done', 'failed', 'stopped'].includes(w.status)
            return `### ${wid} (${w.role}) — ${w.status}${w.diffStat ? `\nBranch ${w.worktree?.branch}${w.merged ? ' (merged)' : ' (not merged yet)'}:\n${w.diffStat}` : ''}${finished ? `\n${clip(room.messages.find(m => m.id === w.msgId)?.text ?? w.error ?? '', 8000)}` : ''}`
          })
          this.#mutate(id, r => { for (const wid of ids) if (['done', 'failed', 'stopped'].includes(r.workers[wid]?.status)) r.workers[wid].reported = true })
          return out.join('\n\n')
        }
        case 'message_worker': {
          workerOf(a.id)
          const sup = this.#supervisor(this.get(id))
          const mid = this.#mutate(id, r => { const m = { id: newId(), from: sup, to: a.id, text: String(a.text), ts: now(), task, cause: getMsgId(), status: 'done', note: true }; r.messages.push(m); return m.id })
          return `message ${this.#deliver(id, a.id, [mid])} for ${a.id}`
        }
        case 'stop_worker': {
          const w = workerOf(a.id)
          this.#mutate(id, r => { if (r.workers[a.id].status === 'queued') r.workers[a.id].status = 'stopped' })
          this.cancelAgent(id, a.id)
          return `stopping ${a.id} (was ${w.status})`
        }
        case 'merge_worker': {
          const w = workerOf(a.id)
          if (!w.worktree) return `${a.id} worked in the shared folder; nothing to merge`
          if (w.merged) return `${a.id} is already merged`
          if (w.status === 'running' || w.status === 'queued') return `${a.id} is still ${w.status}; wait for it first`
          const r = await mergeWorktree(w.worktree)
          if (r.ok) this.#mutate(id, room => { room.workers[a.id].merged = true; room.workers[a.id].mergedAt = now() })
          return `${r.ok ? 'merged' : 'merge failed (aborted)'}: ${clip(r.output, 4000)}`
        }
      }
      throw new Error(`unknown tool ${name}`)
    }
    return toolsMcp('forge_team', defs, handle)
  }

  /** Create a worker record and start it in the background (limited to maxConcurrent at once per room). */
  #spawn(id, task, cause, { role, task: assignment, isolation = 'shared' }) {
    if (!assignment?.trim()) throw new Error('task (the assignment) is required')
    if (!['shared', 'worktree'].includes(isolation)) throw new Error('isolation must be shared or worktree')
    const wid = this.#mutate(id, room => {
      if (!this.#roles(room).includes(role)) throw new Error(`role must be one of ${this.#roles(room).join(', ')}`)
      room.workers ??= {}
      const active = Object.values(room.workers).filter(w => w.status === 'queued' || w.status === 'running').length
      const max = room.maxWorkers ?? 10
      if (active >= max) throw new Error(`already ${active} active workers (limit ${max}); wait for some to finish`)
      room.workerSeq ??= {}
      let n = room.workerSeq[role] ?? 0, wid
      do { n++; wid = `${role}-${n}` } while (room.workers[wid] || room.agents.includes(wid))
      room.workerSeq[role] = n
      room.workers[wid] = { id: wid, role, assignment: assignment.trim(), isolation, status: 'queued', task, cause, spawnedBy: this.#supervisor(room), spawnedAt: now() }
      return wid
    })
    const l = this.#liveOf(id)
    const promise = this.#track(id, signal => this.#workerTurn(id, wid, { first: true }, signal))
    l.workers.set(wid, { task, promise })
    promise.finally(() => { if (l.workers.get(wid)?.promise === promise) l.workers.delete(wid) })
    return wid
  }

  async #workerTurn(id, wid, { first, messages }, signal) {
    const l = this.#liveOf(id)
    l.sem ??= new Semaphore(this.get(id).maxConcurrent ?? 4)
    let room = this.get(id)
    const patchW = fn => this.#mutate(id, r => fn(r.workers[wid]))
    if (!first) patchW(w => { w.status = 'queued'; w.reported = false })
    await l.sem.acquire()
    try {
      room = this.get(id)
      const w = room.workers[wid]
      if (signal.aborted || (first && w.status === 'stopped')) { patchW(x => { x.status = 'stopped'; x.endedAt = now() }); return }
      if (w.isolation === 'worktree' && !w.worktree) {
        try {
          const wt = await addWorktree(this.#roomFolder(room), path.join(this.registry.home, 'worktrees', id, wid), `forge/${id}/${wid}`)
          patchW(x => { x.worktree = wt })
        } catch (e) {
          patchW(x => { x.status = 'failed'; x.error = e.message; x.endedAt = now() })
          this.#mutate(id, r => r.messages.push({ id: newId(), from: wid, role: w.role, worker: true, task: w.task, cause: w.cause, status: 'failed', text: `Could not start: ${e.message}`, tools: [], ts: now() }))
          return
        }
      }
      patchW(x => { x.status = 'running'; x.startedAt ??= now() })
      room = this.get(id)
      const wk = room.workers[wid]
      // a user's direct message starts its own task; a supervisor's message continues the worker's task
      const m0 = messages?.length ? room.messages.find(m => m.id === messages[0]) : null
      const cause = first || !m0 ? wk.cause : m0.from === 'user' ? 'user' : m0.note ? (m0.cause ?? wk.cause) : m0.id
      const res = await this.#reply(id, wid, signal, {
        task: m0?.from === 'user' ? m0.task : wk.task, cause, role: wk.role, cwd: wk.worktree?.cwd ?? this.#roomFolder(room), worker: wk, direct: messages, first,
      })
      let diffStat
      if (wk.worktree) { try { diffStat = await finishWorktree({ ...wk.worktree, id: wid }) } catch (e) { diffStat = `could not commit worktree: ${e.message}` } }
      patchW(x => { x.status = res.ok ? 'done' : signal.aborted || res.cancelled ? 'stopped' : 'failed'; x.endedAt = now(); x.msgId = res.msgId; x.reported = false; x.steps = (x.steps ?? 0) + 1; if (diffStat !== undefined) x.diffStat = diffStat; if (!res.ok) x.error = res.text })
    } finally {
      l.sem.release()
    }
  }

  // ---------------- one agent step

  /**
   * One reply by an agent or worker. opts: task, cause, cutoff (transcript end), direct (message ids addressed
   * to it), role/worker (worker steps), cwd, supervisorTask (adds the worker tools), updates (worker results).
   */
  async #reply(id, who, signal, opts = {}) {
    let room = this.get(id)
    // a side chat follows its group chat's current project, folder and team
    const parent = this.#parentOf(room)
    const inherit = r => { if (parent) { r.project = parent.project; r.cwd = r.worktree?.cwd ?? parent.cwd; r.team = parent.team } }
    inherit(room)
    let def = this.agentDef(room.project, opts.role ?? who)
    // a resumable (session-memory) agent gets a session of its own per side chat, so it neither continues
    // nor overwrites the conversation it has in the group chat; note-based memory stays shared
    if (room.parent && def.memory?.mode === 'session') def = { ...def, memory: { ...def.memory, namespace: `side-${id.slice(id.indexOf('__') + 2)}-${who}` } }
    const l = this.#liveOf(id)
    const ac = new AbortController()
    const onAbort = () => ac.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    if (!l.replies.has(who)) l.replies.set(who, new Set())
    l.replies.get(who).add(ac)
    l.agents.set(who, (l.agents.get(who) ?? 0) + 1)
    if (opts.direct?.length) this.#mutate(id, r => { for (const m of r.messages) if (opts.direct.includes(m.id)) delete m.queued })

    const msg = { id: newId(), from: who, model: def.model, text: '', status: 'pending', tools: [], ts: now(), task: opts.task, cause: opts.cause ?? 'user' }
    if (opts.worker) { msg.worker = true; msg.role = def.name }
    const patch = fn => { try { this.#mutate(id, r => { const m = r.messages.find(x => x.id === msg.id); if (m) fn(m) }) } catch {} }
    try {
      room = this.#mutate(id, r => { r.messages.push(msg); return r })
      inherit(room)
      if (opts.supervisorTask && def.backend !== 'claude-code') throw new Error(`supervisor "${who}" uses the ${def.backend} backend; supervisor mode needs a Claude Code (claude-code backend) agent to get its worker tools`)
      const cwd = resolveCwd(this.registry, def, opts.cwd ?? room.cwd)
      const before = await snapshot(cwd)
      const { prompt, contextNote } = this.#promptFor(room, who, def, opts, msg)
      const edited = new Set()
      let lastFlush = 0
      // a task posted by a super team runs its replies through the super team's run
      const runner = opts.task ? l.runners?.get(opts.task) : undefined
      const run = runner ? (p => runner(who, p).then(r => r ?? { ok: false, error: ac.signal.aborted ? 'Stopped.' : 'not run' })) : runAgent
      const t0 = Date.now()
      const res = await run({
        def, registry: this.registry, prompt, cwd, team: room.team, label: `chat:${who}`, contextNote, signal: ac.signal,
        extraMcp: def.backend === 'claude-code' && !opts.worker
          ? { ...(opts.supervisorTask ? { forge_team: this.#supervisorTools(id, opts.supervisorTask, () => msg.id) } : {}), forge_chats: this.#chatTools(id, who, () => msg.id, ac.signal) }
          : opts.supervisorTask ? { forge_team: this.#supervisorTools(id, opts.supervisorTask, () => msg.id) } : undefined,
        onEvent: e => {
          if (e.type === 'fallback') { const model = e.model; patch(m => { m.model = model; m.fallback = true }) }
          if (e.type !== 'tool' && e.type !== 'fallback') return
          msg.tools.push(e.brief ?? e.name)
          const fp = EDIT_TOOLS.has(e.name) ? (e.input?.file_path ?? e.input?.notebook_path) : null
          if (fp) edited.add(path.resolve(cwd, fp))
          if (Date.now() - lastFlush > 800) { lastFlush = Date.now(); const t = [...msg.tools]; patch(m => { m.tools = t }) }
        },
      })
      res.durationMs ??= Date.now() - t0
      const after = before ? await snapshot(cwd) : null
      let files = []
      if (before && after && before.root === after.root) { try { files = await changedFiles(before.root, before.tree, after.tree) } catch {} }
      const root = before?.root
      const rel = f => root && (f === root || f.startsWith(root + path.sep)) ? path.relative(root, f) : f
      const editedRel = [...edited].map(rel)
      for (const f of files) if (editedRel.includes(f.path)) f.byTool = true
      for (const f of editedRel) if (!files.some(x => x.path === f)) files.push({ path: f, status: 'M', add: null, del: null, byTool: true, untracked: !root || path.isAbsolute(f) })
      const cancelled = ac.signal.aborted
      patch(m => {
        m.tools = msg.tools
        m.durationMs = res.durationMs
        if (res.attempts) m.attempts = res.attempts
        if (res.costUsd) m.costUsd = res.costUsd
        m.cwd = cwd
        if (files.length) m.files = files
        if (before && after) m.tree = { root: before.root, before: before.tree, after: after.tree }
        if (res.ok) { m.status = 'done'; m.text = (res.text ?? JSON.stringify(res.structured, null, 2)).replace(new RegExp(`^\\s*\\**@?${who}\\**\\s*:\\s*`, 'i'), '') }
        else { m.status = cancelled ? 'cancelled' : 'failed'; m.text = cancelled ? 'Stopped.' : res.error }
      })
      return { ok: res.ok, msgId: msg.id, text: res.ok ? res.text : res.error, cancelled }
    } catch (e) {
      patch(m => { m.status = 'failed'; m.text = `Error: ${e?.message ?? e}` })
      return { ok: false, msgId: msg.id, text: e?.message ?? String(e) }
    } finally {
      signal.removeEventListener('abort', onAbort)
      l.replies.get(who)?.delete(ac)
      const n = (l.agents.get(who) ?? 1) - 1
      if (n > 0) l.agents.set(who, n); else l.agents.delete(who)
      // deliver direct messages that arrived while this agent was busy
      const queued = l.inbox.get(who)
      if (n <= 0 && queued?.length && !signal.aborted) { l.inbox.delete(who); this.#track(id, s => this.#directTurn(id, who, queued, s)) }
    }
  }

  /** When the task was posted by a super team's supervisor, say so. */
  #viaNote(room, task) {
    const via = task ? room.messages.find(m => m.id === task)?.via : null
    if (!via?.superTeam) return ''
    return `\n\nThe message that started this task was posted by the supervisor of super team "${via.title ?? via.superTeam}", which coordinates several agent teams; it holds your team's assignment. Other messages in this chat may come from the human user directly.`
  }

  #promptFor(room, who, def, opts, msg) {
    const transcript = this.#transcript(room, opts.cutoff ?? room.messages.length - 1)
    const directMsgs = (opts.direct ?? []).map(i => room.messages.find(m => m.id === i)).filter(Boolean)
    const directText = directMsgs.length ? `\n\nMessages addressed to you directly (answer these):\n${directMsgs.map(m => `[${m.from === 'user' ? 'user' : '@' + m.from} → you]\n${m.text}`).join('\n\n')}` : ''
    const tools = def.backend === 'claude-code' && !opts.worker ? '\n\nOther teams: with the forge_chats tools you can list the other team chats, ask one of them (ask_team opens a parallel channel there and returns its answer), or ask the user to approve opening a new team chat (open_team_chat). Use them when part of the work clearly belongs to another team; do not hand off what you can do yourself.' : ''
    const originNote = room.origin ? `\n\nThis conversation was opened by ${room.origin.agent === 'user' ? 'the user' : `@${room.origin.agent}`} in team chat "${room.origin.title}" to ask your team for help. Your final reply to each task is sent back to them as the answer, so make it complete and self-contained.` : ''
    const parent = room.parent ? this.#parentOf(room) : null
    const folderNote = room.worktree ? ` This channel works in its own git worktree on branch ${room.worktree.branch} (folder ${room.worktree.cwd}); commit your work there with clear messages, the user merges it.` : ' Other channels may be working in the same folder at the same time: stay within this channel\'s task, do not revert changes you did not make, and avoid broad reformatting.'
    if (room.parent && room.agents.length === 1 && !opts.worker) {
      const others = parent ? parent.agents.filter(a => a !== who) : []
      const group = parent ? this.#transcript(parent, parent.messages.length, SIDE_CONTEXT_CHARS) : ''
      const digest = parent ? this.#channelDigest(parent.id, room.id) : ''
      const latest = directMsgs.length ? directMsgs.map(m => m.text).join('\n\n') : ''
      const solo = room.kind === 'side' && !room.origin
      return {
        contextNote: `You are agent "${who}" in a ${solo ? 'private one-to-one side conversation with the human user' : `one-agent channel "${room.title}"`}. It runs alongside your team's group chat${parent ? ` "${parent.title}"${others.length ? ` (with ${others.map(a => `@${a}`).join(', ')})` : ''}` : ''}, which carries on independently: nothing said here is posted there${room.report !== false ? ' (except that each finished task\'s final reply is posted into the main chat as a summary)' : ''}, and the other agents do not see this conversation. The group chat transcript is background context only; do not hand off to or @mention other agents, since nobody else answers here. Do what is asked, using your tools when the request needs real work.${folderNote} Keep replies focused; use Markdown.${this.#teamNote(room.team)}${originNote}${tools}`,
        prompt: `${group ? `Background: your team's group chat so far (read-only, latest at the end):\n\n${group}\n\n---\n` : ''}${digest ? `Other parallel channels of the team right now:\n${digest}\n\n---\n` : ''}This ${solo ? 'side conversation' : 'channel'} so far:\n\n${transcript || '(just started)'}${latest ? `\n\n---\nThe latest message to you:\n${latest}` : ''}\n\n---\nReply in this ${solo ? 'side conversation' : 'channel'}. Do not start with your own name.`,
      }
    }
    const p = this.#promptCore(room, who, def, opts, msg, directMsgs, directText, transcript)
    if (opts.worker) return p
    if (room.parent) {
      const group = parent ? this.#transcript(parent, parent.messages.length, SIDE_CONTEXT_CHARS) : ''
      const digest = parent ? this.#channelDigest(parent.id, room.id) : ''
      p.contextNote += `\n\nThis conversation is channel "${room.title}" of your team's group chat${parent ? ` "${parent.title}"` : ''}: one of several conversations the team runs in parallel. Only this channel's agents (${room.agents.map(a => `@${a}`).join(', ')}) answer here. The main chat and the other channels are background: read them for context, but nothing said here appears there${room.report !== false ? ', except that when a task here finishes, its final reply is posted into the main chat as a summary' : ''}.${folderNote}${originNote}`
      p.prompt = `${group ? `Background: the team's main chat so far (read-only, latest at the end):\n\n${group}\n\n---\n` : ''}${digest ? `Other parallel channels right now:\n${digest}\n\n---\n` : ''}${p.prompt.replace(/^Group chat transcript so far:/, 'This channel so far:')}`
    } else {
      const digest = this.#channelDigest(room.id, null)
      if (digest) p.contextNote += `\n\nParallel channels of this chat (other conversations of your team running alongside; their final results are posted here as notes):\n${digest}`
      p.contextNote += originNote
    }
    p.contextNote += tools
    return p
  }

  #promptCore(room, who, def, opts, msg, directMsgs, directText, transcript) {
    if (opts.worker) {
      const w = opts.worker
      const sup = w.spawnedBy
      const taskMsg = room.messages.find(m => m.id === w.task)
      const iso = w.worktree
        ? `You work in your own git worktree on branch ${w.worktree.branch} (folder ${w.worktree.cwd}). Commit your work there with clear messages; the supervisor merges your branch.`
        : 'You work in the shared room folder. Other workers may be editing files in the same folder at the same time: stay within your assignment, do not revert changes you did not make, and avoid broad reformatting.'
      const prev = !opts.first && w.msgId ? room.messages.find(m => m.id === w.msgId) : null
      return {
        contextNote: `You are worker "${who}", a copy of the "${def.name}" agent, spawned by @${sup} (the supervisor) in a group chat with a human user. You work on one assignment and report back. Do the real work with your tools. Do not @mention other agents; your reply goes to the supervisor and the user. ${iso}${this.#teamNote(room.team)}`,
        prompt: `Your assignment from @${sup}:\n${w.assignment}\n\nThe user's request that started this task:\n${clip(taskMsg?.text ?? '', 4000)}${prev ? `\n\nYour previous report:\n${clip(prev.text, 4000)}` : ''}${directText}\n\n---\nWhen finished, reply with a concise report: what you did, files changed, anything left open. Do not start it with your own name.`,
      }
    }
    const others = speakers(room).filter(a => a !== who)
    if (opts.supervisorTask) {
      const roles = this.#roles(room).map(r => { try { const d = this.agentDef(room.project, r); return `- ${r}: ${clip(d.description || d.role || '', 200)}` } catch { return `- ${r}` } }).join('\n')
      const ws = Object.values(room.workers ?? {})
      const wlist = ws.length ? ws.map(w => `- ${w.id} (${w.role}) ${w.status}${w.worktree ? ` [worktree ${w.worktree.branch}${w.merged ? ', merged' : ''}]` : ''}: ${clip(w.assignment, 120)}`).join('\n') : '(none yet)'
      return {
        contextNote: `You are "${who}", the supervisor of a live group chat with a human user. You plan the work and delegate it to worker agents you spawn with the forge_team tools (spawn_worker, list_workers, wait_for_workers, message_worker, stop_worker, merge_worker), at any time, as many as the work needs (up to ${room.maxWorkers ?? 10} active, ${room.maxConcurrent ?? 4} running at once; extra workers queue). Split work into independent, self-contained assignments. Choose isolation per worker: "shared" when workers touch different files or only read, "worktree" when parallel workers may edit the same files (then merge_worker each one and check the result). After spawning you may wait_for_workers, or end your turn with a short status for the user: you are woken automatically with worker results as they finish. Do small things yourself. When all work is done, give the user a clear final summary. The shared room folder is ${this.#roomFolder(room)}.\n\nWorker roles you can spawn:\n${roles}\n\nWorkers so far:\n${wlist}${this.#teamNote(room.team)}${this.#viaNote(room, opts.task)}`,
        prompt: `Group chat transcript so far:\n\n${transcript}${directText}${opts.updates ? `\n\n---\nWorker updates since your last message:\n\n${opts.updates}\n\nDecide what is next: spawn more workers, message or merge workers, or report to the user.` : ''}\n\n---\nWrite your next message in this chat. Do not start it with your own name; the chat shows who is speaking.`,
      }
    }
    return {
      contextNote: `You are agent "${who}" in a live group chat with a human user${others.length ? ` and these other agents: ${others.map(a => `@${a}`).join(', ')}` : ''}. Reply to the latest message as yourself. Use your tools when the request needs real work. To hand a question or task to another agent, mention them as @name in your reply; mention an agent only when you want them to respond next. Keep replies focused; use Markdown.${this.#teamNote(room.team)}${this.#viaNote(room, opts.task)}`,
      prompt: `Group chat transcript so far:\n\n${transcript}${directText}\n\n---\nWrite your next message in this chat${directMsgs.length ? ', answering the message(s) addressed to you' : ''}. Do not start it with your own name; the chat shows who is speaking.`,
    }
  }

  /** Workflow mode: run the room's orchestration for this message and mirror its progress into one chat message. */
  async #workflow(id, task, text, signal) {
    let room = this.get(id)
    const msg = { id: newId(), from: `workflow:${room.workflow ?? '?'}`, model: 'workflow', text: '', status: 'pending', tools: [], ts: now(), task, cause: 'user' }
    room.messages.push(msg); this.#save(room)
    const patch = fn => this.#mutate(id, r => { const m = r.messages.find(x => x.id === msg.id); if (m) fn(m) })
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

  #transcript(room, uptoIndex, max = TRANSCRIPT_CHARS) {
    const msgs = room.messages.slice(0, uptoIndex).filter(m => m.status !== 'failed' && m.status !== 'pending' && !m.dropped)
    const who = m => m.from === 'user' ? (m.via?.fromChat ? `request from ${m.via.agent === 'user' ? 'the user' : `@${m.via.agent}`} in team chat "${m.via.fromTitle}"` : 'user') : m.note ? 'note' : `@${m.from}`
    let out = msgs.map(m => `[${who(m)}${m.to ? ` → @${m.to}` : ''}]\n${m.text}`).join('\n\n')
    if (out.length > max) out = `[earlier messages omitted]\n…${out.slice(-max)}`
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

  // ---------------- Overview, Memory and Files tabs

  /** Computed project overview: totals, per-agent activity, workers, a timeline of events and the cached written summary. */
  overview(id) {
    const room = this.view(id)
    const tasks = room.tasks
    const byStatus = {}
    for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1
    const agents = new Map()
    const files = new Map()
    let cost = 0
    for (const m of room.messages) {
      if (m.from === 'user' || m.note) continue
      const a = agents.get(m.from) ?? { name: m.from, role: m.role, worker: !!m.worker, replies: 0, done: 0, failed: 0, durationMs: 0, tools: 0, files: 0, last: null }
      a.replies++; if (m.status === 'done') a.done++; if (m.status === 'failed') a.failed++
      a.durationMs += m.durationMs ?? 0; a.tools += (m.tools ?? []).length; a.files += (m.files ?? []).length; a.last = m.ts
      agents.set(m.from, a)
      cost += m.costUsd ?? 0
      for (const f of m.files ?? []) files.set(f.path, (files.get(f.path) ?? 0) + 1)
    }
    const taskN = new Map(tasks.map(t => [t.id, t.n]))
    const events = []
    for (const m of room.messages) {
      if (m.from === 'user') events.push({ ts: m.ts, kind: m.task === m.id ? 'task' : 'note', task: taskN.get(m.task), text: clip(m.text, 200), to: m.to })
      else if (m.note) events.push({ ts: m.ts, kind: 'message', from: m.from, to: m.to, task: taskN.get(m.task), text: clip(m.text, 200) })
      else events.push({ ts: m.ts, kind: 'reply', from: m.from, role: m.role, worker: !!m.worker, status: m.status, task: taskN.get(m.task), files: (m.files ?? []).length, durationMs: m.durationMs, text: clip(String(m.text ?? '').replace(/\s+/g, ' '), 200) })
    }
    for (const w of Object.values(room.workers ?? {})) {
      events.push({ ts: w.spawnedAt, kind: 'spawn', from: w.spawnedBy, worker: w.id, role: w.role, isolation: w.isolation, task: taskN.get(w.task), text: clip(w.assignment, 200) })
      if (w.mergedAt) events.push({ ts: w.mergedAt, kind: 'merge', worker: w.id, task: taskN.get(w.task), text: `merged ${w.worktree?.branch}` })
    }
    events.sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
    const s = room.summary
    return {
      id: room.id, title: room.title, mode: room.mode, busy: room.busy, createdAt: room.createdAt, updatedAt: room.updatedAt, folder: (() => { try { return this.#roomFolder(room) } catch { return null } })(),
      totals: { tasks: tasks.length, byStatus, messages: room.messages.length, agents: agents.size, workers: Object.keys(room.workers ?? {}).length, files: files.size, tools: tasks.reduce((a, t) => a + t.tools, 0), durationMs: tasks.reduce((a, t) => a + t.durationMs, 0), costUsd: cost },
      agents: [...agents.values()].sort((a, b) => b.replies - a.replies),
      workers: Object.values(room.workers ?? {}),
      tasks: tasks.map(t => ({ n: t.n, text: clip(t.text, 200), to: t.to, status: t.status, progress: t.progress, agents: t.agents, startedAt: t.startedAt, lastActivity: t.lastActivity, files: t.files, durationMs: t.durationMs })),
      topFiles: [...files].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([p, n]) => ({ path: p, steps: n })),
      events: events.slice(-400),
      summary: s ?? null, summaryPending: this.summaries.has(id), summaryStale: !!s && (s.uptoMessages ?? 0) < room.messages.length, summaryError: room.summaryError ?? null,
    }
  }

  /** Start an on-demand written summary (Haiku) of the project so far; the result lands in room.summary. */
  summarize(id) {
    if (this.summaries.has(id)) return { pending: true }
    const ov = this.overview(id)
    const room = this.get(id)
    const taskN = new Map(summarizeTasks(room).map(t => [t.id, t.n]))
    const lines = [`Project chat: "${room.title}" (mode ${room.mode}, agents: ${room.agents.join(', ')}${room.team ? `, team ${room.team}` : ''})`, `Folder: ${ov.folder ?? '?'}`, '']
    for (const t of ov.tasks) lines.push(`Task #${t.n} [${t.status}]${t.to ? ` (direct to @${t.to})` : ''} ${t.startedAt?.slice(0, 16)}: ${t.text}`)
    lines.push('', 'Workers:')
    for (const w of ov.workers) lines.push(`- ${w.id} (${w.role}, ${w.isolation}${w.merged ? ', merged' : ''}) ${w.status}, task #${taskN.get(w.task) ?? '?'}: ${clip(w.assignment, 200)}`)
    lines.push('', 'Files changed most:', ...ov.topFiles.map(f => `- ${f.path} (${f.steps} steps)`), '', 'Transcript (newest last):')
    let tx = room.messages.filter(m => m.status !== 'pending').map(m => `[#${taskN.get(m.task) ?? '?'} ${m.from === 'user' ? 'user' : '@' + m.from}${m.to ? ` → @${m.to}` : ''} ${String(m.ts).slice(0, 16)}${m.status && m.status !== 'done' ? ` ${m.status}` : ''}${m.files?.length ? ` files: ${m.files.map(f => f.path).slice(0, 12).join(', ')}` : ''}]\n${clip(m.text, 1500)}`).join('\n\n')
    if (tx.length > 50000) tx = `…${tx.slice(-50000)}`
    const prompt = `${lines.join('\n')}\n${tx}\n\n---\nSummarize this project for its owner so they can understand it at a glance. Describe the overall goal, what each agent did, where things stand, decisions, open issues and next steps. Break the project into 3-8 phases in order for a flow chart (use links only for branches or loops). Use the task numbers.`
    const upto = room.messages.length
    this.summaries.add(id)
    this.#mutate(id, r => { delete r.summaryError })
    quickQuery({ prompt, schema: SUMMARY_SCHEMA, model: 'haiku' })
      .then(out => this.#mutate(id, r => { r.summary = { ...out, ts: now(), uptoMessages: upto, model: 'haiku' } }))
      .catch(e => { try { this.#mutate(id, r => { r.summaryError = e?.message ?? String(e) }) } catch {} })
      .finally(() => this.summaries.delete(id))
    return { pending: true }
  }

  /** Memory folders of every agent and worker role in the room; folders shared by several agents are listed once. */
  memory(id) {
    const room = this.get(id)
    const names = [...new Set([...room.agents, ...(room.mode === 'supervisor' ? this.#roles(room) : []), ...Object.values(room.workers ?? {}).map(w => w.role)])]
    const stores = new Map()
    const none = []
    for (const n of names) {
      let def
      try { def = this.agentDef(room.project, n) } catch { continue }
      const mem = listMemory(this.registry.home, def, { team: room.team })
      if (!mem) { none.push(n); continue }
      const s = stores.get(mem.dir) ?? { ...mem, agents: [] }
      s.agents.push(n)
      stores.set(mem.dir, s)
    }
    const workersOf = role => Object.values(room.workers ?? {}).filter(w => w.role === role).map(w => w.id)
    return { stores: [...stores.values()].map(s => ({ ...s, workers: s.agents.flatMap(workersOf) })), noMemory: none }
  }

  #memDir(id, dir) {
    if (!this.memory(id).stores.some(s => s.dir === dir)) throw new Error("that memory folder does not belong to this chat's agents")
    return dir
  }
  saveMemoryNote(id, { dir, title, content, tags }) {
    if (!title?.trim() || typeof content !== 'string') throw new Error('title and content are required')
    return { result: saveNote(this.#memDir(id, dir), { title: title.trim(), content, tags: Array.isArray(tags) ? tags : [] }) }
  }
  deleteMemoryNote(id, dir, note) { deleteNote(this.#memDir(id, dir), note); return { ok: true } }

  /** The diff of one file in one agent step (from that step's before/after snapshots). */
  async diff(id, msgId, file) {
    const m = this.get(id).messages.find(x => x.id === msgId)
    if (!m) throw new Error('unknown message')
    if (!m.tree) throw new Error('no snapshot for this step (its folder is not a git repository)')
    if (!(m.files ?? []).some(f => f.path === file)) throw new Error('that file did not change in this step')
    return { diff: await fileDiff(m.tree.root, m.tree.before, m.tree.after, file), root: m.tree.root }
  }
}
