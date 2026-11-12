/**
 * Super team: one supervisor agent that orchestrates many Agent Forge teams.
 *
 * A super-team chat holds a configuration and a conversation:
 *   supervisor   the forge agent that plans, delegates, reviews and writes the final answer
 *   mode         how the supervisor runs its teams (SUPER_MODES):
 *     auto        the supervisor plans waves of assignments; teams in a wave run in parallel, waves run in
 *                 order, and after each round it may add follow-up waves (up to maxRounds rounds)
 *     sequential  every team works in turn and sees the earlier teams' results
 *     parallel    every team works at once on the request
 *     mention     only @team-named teams work (falls back to the first team)
 *     handoff     the supervisor delegates one round at a time and decides after each round who goes next
 *     workflow    the message starts a saved orchestration (args + message + teams)
 *   teams        [{ team, mode, agents?, lead?, maxHops, workflow?, workflowArgs?, instructions?, chat, chatId? }]
 *                every team runs inside with its own chat mode (TEAM_MODES, same as Agent chat):
 *                sequential | parallel | mention | handoff | workflow, plus @agent hand-offs up to maxHops
 *
 * Team chats (CHAT_LINKS): every team works in, or is copied into, an Agent chat room so its discussion shows on
 * the Agent chat page. chatId names the room; when it is missing (or the room was deleted) a room titled
 * "<super team> · <team>" is created the first time the team gets work, in the Agent chat project with the same
 * name as this super team's project.
 *   linked  (default) the supervisor's brief is posted into the team's chat and the chat's agents reply there:
 *           the room's own mode, lead, hand-offs, folder, project agent settings and history apply, so the
 *           team remembers its earlier work. The replies run inside the super team's run (cost, transcripts).
 *   copy    the team works as a fresh discussion configured here (no chat history), and the brief and replies
 *           are then copied into its chat for visibility. Teams in workflow mode always work this way.
 *
 * In sequential, parallel and mention mode a team result that @mentions another team in this chat hands the
 * work to that team (up to the chat's maxHops team hand-offs), like agents do in a group chat.
 *
 * Projects group super-team chats: each project is a tab in the page holding many super teams. A project has a
 * name, an optional default working folder (new chats in it inherit it) and a description that every supervisor
 * and team in it gets as context. Chats without a project are in General. Projects: forge/super-team-projects.json
 *
 * Each user message runs as one Agent Forge run (engine.startCustom), so it appears on Workflows > Runs with
 * per-agent transcripts, and every agent keeps its own model, skills, memory, backend and execution mode.
 * Storage: forge/super-teams/<id>.json
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { runNamed, renderTemplate } from '../../agent-forge/lib/engine.js'
import { withTarget } from '../../agent-forge/lib/targets.js'

export const SUPER_MODES = ['auto', 'sequential', 'parallel', 'mention', 'handoff', 'workflow']
export const TEAM_MODES = ['sequential', 'parallel', 'mention', 'handoff', 'workflow']
export const DEFAULT_SUPERVISOR = 'super-orchestrator'
export const CHAT_LINKS = ['linked', 'copy']
const MAX_ROUNDS = 12
const MAX_HOPS = 50
const OUT_CLIP = 24000
const CTX_CLIP = 40000
const LINKED_PRIOR_CLIP = 12000 // other teams' results inside a brief posted to a team chat (stays in its history)

const now = () => new Date().toISOString()
const newId = () => `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`
const ID = /^[a-z0-9]{6,24}$/
const str = (v, max = 20000) => String(v ?? '').slice(0, max)
const int = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d }
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n)}\n…[${s.length - n} more characters trimmed]` : s }
const clipStart = (s, n) => { s = String(s ?? ''); return s.length > n ? `[earlier text trimmed]…\n${s.slice(-n)}` : s }
const asText = v => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v, null, 2))
const mentionsIn = (text, names, self) => {
  const out = []
  for (const m of String(text ?? '').matchAll(/@([a-z][a-z0-9-]*)/g)) if (names.includes(m[1]) && m[1] !== self && !out.includes(m[1])) out.push(m[1])
  return out
}

export class SuperTeams {
  constructor({ registry, engine, chats }, { log = () => {} } = {}) {
    this.registry = registry
    this.engine = engine
    this.chats = chats // Agent chat rooms (ChatStore), used as the teams' chats
    this.log = log
    this.dir = path.join(registry.home, 'super-teams')
    fs.mkdirSync(this.dir, { recursive: true })
    this.live = new Map() // chat id -> run id
    this.projectsFile = path.join(registry.home, 'super-team-projects.json')
  }

  // ---------------- projects (tabs that group super-team chats)
  #readProjects() { try { const p = JSON.parse(fs.readFileSync(this.projectsFile, 'utf8')); return Array.isArray(p) ? p : [] } catch { return [] } }
  #writeProjects(list) {
    fs.writeFileSync(`${this.projectsFile}.tmp`, JSON.stringify(list, null, 2))
    fs.renameSync(`${this.projectsFile}.tmp`, this.projectsFile)
  }
  #project(id) {
    if (!id) return undefined
    const p = this.#readProjects().find(x => x.id === id)
    if (!p) throw new Error(`unknown project ${id}`)
    return p
  }

  /** Projects in creation order, each with its chat count and how many chats are working. */
  listProjects() {
    const chats = this.list()
    const stats = id => { const cs = chats.filter(c => (c.project ?? '') === id); return { chats: cs.length, busy: cs.filter(c => c.busy).length } }
    return { general: stats(''), projects: this.#readProjects().map(p => ({ ...p, ...stats(p.id) })) }
  }

  createProject({ name, cwd, description, color } = {}) {
    name = str(name, 80).trim()
    if (!name) throw new Error('project name is required')
    const list = this.#readProjects()
    if (list.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error(`a project named "${name}" already exists`)
    const p = { id: newId(), name, createdAt: now() }
    if (str(cwd).trim()) p.cwd = str(cwd, 1000).trim()
    if (str(description).trim()) p.description = str(description, 8000).trim()
    if (/^#[0-9a-f]{6}$/i.test(color ?? '')) p.color = color
    list.push(p)
    this.#writeProjects(list)
    return p
  }

  updateProject(id, patch = {}) {
    const list = this.#readProjects()
    const p = list.find(x => x.id === id)
    if (!p) throw new Error(`unknown project ${id}`)
    if (patch.name !== undefined) {
      const name = str(patch.name, 80).trim()
      if (!name) throw new Error('project name is required')
      if (list.some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) throw new Error(`a project named "${name}" already exists`)
      p.name = name
    }
    for (const k of ['cwd', 'description']) if (patch[k] !== undefined) { const v = str(patch[k], k === 'cwd' ? 1000 : 8000).trim(); if (v) p[k] = v; else delete p[k] }
    if (patch.color !== undefined) { if (/^#[0-9a-f]{6}$/i.test(patch.color ?? '')) p.color = patch.color; else delete p.color }
    this.#writeProjects(list)
    return p
  }

  /** Delete a project. Its chats are deleted too when deleteChats is set; otherwise they move to General. */
  deleteProject(id, { deleteChats = false } = {}) {
    const list = this.#readProjects()
    if (!list.some(p => p.id === id)) throw new Error(`unknown project ${id}`)
    const chats = this.list().filter(c => c.project === id)
    if (deleteChats && chats.some(c => c.busy)) throw new Error('stop the working super teams in this project first')
    let moved = 0, deleted = 0
    for (const c of chats) {
      if (deleteChats) { this.delete(c.id); deleted++ }
      else { const s = this.#read(c.id); delete s.project; this.#save(s); moved++ }
    }
    this.#writeProjects(list.filter(p => p.id !== id))
    return { ok: true, moved, deleted }
  }

  // ---------------- storage
  #file(id) {
    if (!ID.test(id)) throw new Error('bad chat id')
    return path.join(this.dir, `${id}.json`)
  }
  #read(id) {
    const f = this.#file(id)
    if (!fs.existsSync(f)) throw new Error('unknown super-team chat')
    return JSON.parse(fs.readFileSync(f, 'utf8'))
  }
  #save(s) {
    s.updatedAt = now()
    const f = this.#file(s.id)
    fs.writeFileSync(`${f}.tmp`, JSON.stringify(s, null, 2))
    fs.renameSync(`${f}.tmp`, f)
    return s
  }
  /** Read-modify-write one message (synchronous, so concurrent async steps never lose updates). */
  #patchMsg(id, mid, fn) {
    try {
      const s = this.#read(id)
      const m = s.messages.find(x => x.id === mid)
      if (m) { fn(m); this.#save(s) }
    } catch (e) { this.log(`super-team ${id}: ${e.message}`) }
  }

  get(id) {
    const s = this.#read(id)
    s.busy = this.live.has(id)
    // a run that ended while this process was down (or a restart) leaves its message "running"
    for (const m of s.messages) if (m.status === 'running' && !(m.runId && this.engine.active.has(m.runId))) m.status = 'interrupted'
    return s
  }

  list() {
    return fs.readdirSync(this.dir).filter(f => f.endsWith('.json')).map(f => {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'))
        const last = s.messages.filter(m => m.from === 'supervisor').at(-1)
        return { id: s.id, title: s.title, project: s.project, mode: s.mode, supervisor: s.supervisor, teams: s.teams.map(t => t.team), busy: this.live.has(s.id), messages: s.messages.length, last: last ? (this.live.has(s.id) ? 'running' : last.status === 'running' ? 'interrupted' : last.status) : null, updatedAt: s.updatedAt }
      } catch { return null }
    }).filter(Boolean).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  }

  // ---------------- configuration
  #agentExists(name) { try { this.registry.getAgent(name); return true } catch { return false } }

  #cleanTeam(t) {
    const team = this.registry.getTeam(str(t.team, 80))
    const mode = TEAM_MODES.includes(t.mode) ? t.mode : 'sequential'
    const agents = Array.isArray(t.agents) ? [...new Set(t.agents.map(String))].filter(a => team.members.includes(a)) : []
    const out = { team: team.name, mode, maxHops: int(t.maxHops, 0, MAX_HOPS, 3) }
    if (agents.length && agents.length < team.members.length) out.agents = agents
    const members = out.agents ?? team.members
    if (t.lead && members.includes(t.lead)) out.lead = t.lead
    if (str(t.instructions).trim()) out.instructions = str(t.instructions, 4000).trim()
    if (t.workflow) { this.registry.orchestrationFile(str(t.workflow, 80)); out.workflow = str(t.workflow, 80) }
    if (mode === 'workflow' && !out.workflow) throw new Error(`team ${team.name}: workflow mode needs a workflow`)
    const args = this.#args(t.workflowArgs)
    if (args) out.workflowArgs = args
    out.chat = CHAT_LINKS.includes(t.chat) ? t.chat : 'linked'
    if (typeof t.chatId === 'string' && /^[\w-]{1,64}$/.test(t.chatId)) out.chatId = t.chatId
    return out
  }

  /**
   * The Agent chat room of a team in this super team: its chatId when the room still exists, else a new room
   * (saved back as chatId). Synchronous, so teams of one wave never race on the file. Returns null without chats.
   */
  #ensureChat(id, teamName, cwd) {
    if (!this.chats) return null
    const s = this.#read(id)
    const entry = s.teams.find(t => t.team === teamName)
    if (!entry) return null
    if (entry.chatId) {
      try { this.chats.get(entry.chatId); return entry.chatId } catch { this.log(`super-team ${id}: chat ${entry.chatId} of team ${teamName} is gone; creating a new one`) }
    }
    const team = this.registry.getTeam(teamName)
    let project
    try {
      const p = this.#project(s.project)
      if (p) project = this.chats.ensureProject({ name: p.name, cwd: p.cwd, description: p.description })?.id
    } catch (e) { this.log(`super-team ${id}: chat project: ${e.message}`) }
    const agents = (entry.agents ?? team.members).filter(a => this.#agentExists(a))
    const room = this.chats.create({
      title: `${s.title} · ${teamName}`.slice(0, 120), agents, team: teamName, project, cwd,
      mode: entry.mode, maxHops: entry.maxHops, lead: entry.lead,
      ...(entry.mode === 'workflow' ? { workflow: entry.workflow } : {}),
    })
    entry.chatId = room.id
    this.#save(s)
    this.log(`super-team ${id}: team ${teamName} now has chat ${room.id}`)
    return room.id
  }

  /** Agent chat rooms a team could use (same team), for the settings page. */
  teamChats() {
    if (!this.chats) return []
    return this.chats.list().map(r => ({ id: r.id, title: r.title, team: r.team, agents: r.agents, mode: r.mode, project: r.project, busy: r.busy, messages: r.messages }))
  }

  #args(v) {
    if (v == null || v === '') return undefined
    if (typeof v !== 'object' || Array.isArray(v)) throw new Error('workflow args must be an object of key: value')
    const o = Object.fromEntries(Object.entries(v).filter(([k]) => /^[\w.-]{1,40}$/.test(k)).map(([k, x]) => [k, str(x, 4000)]))
    return Object.keys(o).length ? o : undefined
  }

  #clean(b, prev) {
    const s = prev ?? { id: newId(), createdAt: now(), messages: [] }
    if (b.project !== undefined) {
      const p = this.#project(b.project || undefined)
      if (p) s.project = p.id; else delete s.project
      // a new chat starts in its project's folder
      if (!prev && p?.cwd && b.cwd === undefined) s.cwd = p.cwd
    }
    if (b.title !== undefined || !prev) s.title = str(b.title, 120).trim() || s.title || 'Super team'
    if (b.supervisor !== undefined || !prev) {
      const sup = str(b.supervisor, 80).trim() || DEFAULT_SUPERVISOR
      this.registry.getAgent(sup)
      s.supervisor = sup
    }
    if (b.mode !== undefined || !prev) {
      const mode = b.mode ?? 'auto'
      if (!SUPER_MODES.includes(mode)) throw new Error(`mode must be one of ${SUPER_MODES.join(', ')}`)
      s.mode = mode
    }
    if (b.teams !== undefined || !prev) {
      const list = Array.isArray(b.teams) ? b.teams : this.registry.listTeams().map(t => ({ team: t.name }))
      // a run may have created a team's chat after the settings page loaded: keep it unless chatId is sent ('' = new)
      const had = new Map((prev?.teams ?? []).map(t => [t.team, t]))
      const teams = list.slice(0, 24).map(t => {
        t = typeof t === 'string' ? { team: t } : t
        if (t.chatId === undefined && had.get(t.team)?.chatId) t = { ...t, chatId: had.get(t.team).chatId }
        return this.#cleanTeam(t)
      })
      if (new Set(teams.map(t => t.team)).size !== teams.length) throw new Error('a team can only be added once')
      s.teams = teams
    }
    if (b.maxRounds !== undefined || !prev) s.maxRounds = int(b.maxRounds, 1, MAX_ROUNDS, 3)
    if (b.maxHops !== undefined || !prev) s.maxHops = int(b.maxHops, 0, MAX_HOPS, 2)
    if (b.synthesize !== undefined || !prev) s.synthesize = b.synthesize !== false
    if (b.cwd !== undefined) s.cwd = str(b.cwd, 1000).trim() || undefined
    if (b.workflow !== undefined) { if (b.workflow) this.registry.orchestrationFile(str(b.workflow, 80)); s.workflow = b.workflow ? str(b.workflow, 80) : undefined }
    if (b.workflowArgs !== undefined) s.workflowArgs = this.#args(b.workflowArgs)
    if (b.instructions !== undefined) s.instructions = str(b.instructions, 8000).trim() || undefined
    // execution target for the sandboxed builders of its teams (docs/EXECUTION-TARGETS.md); a team's own target wins
    if (b.target !== undefined) { const t = str(b.target, 48).trim(); if (t && !/^[a-z][a-z0-9-]{0,47}$/.test(t)) throw new Error('target must be the name of an execution target'); s.target = t || undefined }
    return s
  }

  create(b = {}) { return this.#save(this.#clean(b, null)) }

  update(id, b) {
    const s = this.#read(id)
    return this.#save(this.#clean(b, s))
  }

  duplicate(id) {
    const s = this.#read(id)
    const { messages, id: _, createdAt, updatedAt, ...cfg } = s
    // the copy gets its own team chats
    return this.create({ ...cfg, teams: cfg.teams.map(({ chatId, ...t }) => t), title: `${s.title} (copy)` })
  }

  delete(id) {
    this.cancel(id)
    fs.rmSync(this.#file(id), { force: true })
    return { ok: true }
  }

  clear(id) {
    if (this.live.has(id)) throw new Error('stop the running message first')
    const s = this.#read(id)
    s.messages = []
    this.#save(s)
    return { ok: true }
  }

  cancel(id) {
    const runId = this.live.get(id)
    return { ok: !!runId && this.engine.cancel(runId) }
  }

  // ---------------- running
  post(id, text) {
    text = str(text, 40000).trim()
    if (!text) throw new Error('empty message')
    if (this.live.has(id)) throw new Error('the super team is still working; wait or press Stop')
    const s = this.#read(id)
    if (s.mode === 'workflow' && !s.workflow) throw new Error('workflow mode needs a workflow (Settings)')
    if (s.mode !== 'workflow' && !s.teams.length) throw new Error('add at least one team (Settings)')
    this.registry.getAgent(s.supervisor)
    for (const t of s.teams) this.#cleanTeam(t) // teams or agents may have been deleted since

    const history = turns(s.messages)
    const user = { id: newId(), from: 'user', text, ts: now() }
    const reply = { id: newId(), from: 'supervisor', mode: s.mode, status: 'running', text: '', steps: [], ts: now() }
    s.messages.push(user, reply)
    this.#save(s)

    let project
    try { project = this.#project(s.project) } catch { project = undefined }
    const snapshot = structuredClone({ ...s, messages: undefined, projectInfo: project ? { name: project.name, description: project.description } : undefined })
    const cwd = s.cwd ? path.resolve(this.registry.resolveFolder?.(s.cwd) ?? s.cwd) : undefined
    if (cwd) fs.mkdirSync(cwd, { recursive: true })
    const patch = fn => this.#patchMsg(id, reply.id, fn)
    const t0 = Date.now()
    const { id: runId, done } = this.engine.startCustom(`super: ${s.title}`.slice(0, 80),
      (api, state) => withTarget(snapshot.target, () => runSuper({
        registry: this.registry, api, state, cfg: snapshot, text, history, patch, cwd: cwd ?? api.run.cwd,
        chats: this.chats, ensureChat: team => this.#ensureChat(id, team, cwd), superId: id,
      })),
      { message: text, mode: s.mode, teams: s.teams.map(t => t.team).join(', ') }, { cwd, meta: { superTeam: id } })
    this.live.set(id, runId)
    patch(m => { m.runId = runId })
    done.then(st => {
      patch(m => {
        m.status = st.status === 'completed' ? 'done' : st.status
        m.durationMs = Date.now() - t0
        m.costUsd = st.costUsd || undefined
        if (st.status === 'completed') m.text = asText(st.result) ?? ''
        else if (st.status === 'cancelled') m.text = m.text || 'Stopped.'
        else m.text = `Error: ${String(st.error ?? 'unknown').split('\n')[0]}`
        for (const step of m.steps) if (step.status === 'running') step.status = st.status === 'cancelled' ? 'cancelled' : 'failed'
      })
    }).finally(() => this.live.delete(id))
    return { ok: true, runId }
  }
}

/** Earlier exchanges (user message + final answer) as context for the next one. */
function turns(messages) {
  const out = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.from !== 'user') continue
    const r = messages[i + 1]
    out.push({ user: m.text, answer: r?.from === 'supervisor' ? (r.text || `(${r.status})`) : '(no answer)' })
  }
  return out.slice(-6)
}

// ======================================================================================
// The run body
// ======================================================================================

const assignmentSchema = names => ({
  type: 'object',
  properties: {
    team: { type: 'string', enum: names, description: 'Team name' },
    brief: { type: 'string', description: 'Self-contained assignment for this team: what to do, what to deliver, constraints. You may @mention specific agents of the team.' },
  },
  required: ['team', 'brief'],
  additionalProperties: false,
})
const planSchema = names => ({
  type: 'object',
  properties: {
    approach: { type: 'string', description: 'One short paragraph: how you split the work and why teams run in parallel or in sequence' },
    answer: { type: 'string', description: 'Only when no team is needed (a trivial question): the direct answer. Otherwise an empty string.' },
    waves: {
      type: 'array',
      description: 'Ordered waves. Assignments inside one wave run in PARALLEL; each wave starts after the previous wave finished and sees its results. Use one wave with several teams for independent work; use several waves when later work depends on earlier results.',
      items: { type: 'object', properties: { assignments: { type: 'array', items: assignmentSchema(names) } }, required: ['assignments'], additionalProperties: false },
    },
  },
  required: ['approach', 'waves'],
  additionalProperties: false,
})
const reviewSchema = names => ({
  type: 'object',
  properties: {
    done: { type: 'boolean', description: 'true when the results are enough to write the final answer' },
    reason: { type: 'string', description: 'One or two sentences: what is good enough, or what is missing' },
    waves: planSchema(names).properties.waves,
  },
  required: ['done', 'reason', 'waves'],
  additionalProperties: false,
})
const delegateSchema = names => ({
  type: 'object',
  properties: {
    done: { type: 'boolean', description: 'true when no more delegation is needed and you can write the final answer' },
    reason: { type: 'string', description: 'Why these teams next (or why you are done)' },
    assignments: { type: 'array', description: 'Teams to run now, all in parallel. Empty when done.', items: assignmentSchema(names) },
  },
  required: ['done', 'reason', 'assignments'],
  additionalProperties: false,
})

async function runSuper(env) {
  const { registry, api, cfg, text, history, patch } = env
  const teamsByName = new Map(cfg.teams.map(t => [t.team, t]))
  const names = cfg.teams.map(t => t.team)
  const results = [] // { n, team, brief, text, ok, round }
  let stepNo = 0
  let groupNo = 0 // teams started together (one wave) share a group, so the page can show them side by side

  // ---- step bookkeeping, mirrored into the chat message for the live view
  const addStep = step => {
    const n = ++stepNo
    const s = { n, status: 'running', startedAt: now(), ...step }
    patch(m => { m.steps.push(s) })
    return n
  }
  const endStep = (n, fields) => patch(m => { const s = m.steps.find(x => x.n === n); if (s) Object.assign(s, { endedAt: now() }, fields) })

  const historyText = history.length ? history.map((h, i) => `### Earlier request ${i + 1}\n${clip(h.user, 3000)}\n\n### Answer\n${clip(h.answer, 4000)}`).join('\n\n') : ''
  const resultsText = (list = results) => clipStart(list.map(r => `## Step ${r.n}: team ${r.team}${r.round ? ` (round ${r.round})` : ''}\nBrief: ${clip(r.brief, 1500)}\n\n${r.text}`).join('\n\n'), CTX_CLIP)
  const catalog = () => cfg.teams.map(t => {
    let team
    try { team = registry.getTeam(t.team) } catch { return `- ${t.team}: (missing)` }
    const members = (t.agents ?? team.members).map(a => { try { const d = registry.getAgent(a); return `${a} (${d.description ?? ''})` } catch { return a } })
    return `- **${t.team}** — ${team.description ?? ''}\n  internal mode: ${t.mode}${t.mode === 'workflow' ? ` (runs workflow ${t.workflow})` : ''}${t.mode === 'handoff' ? `, lead ${t.lead ?? (t.agents ?? team.members)[0]}` : ''}\n  members: ${members.join('; ')}${t.instructions ? `\n  role in this super team: ${t.instructions}` : ''}`
  }).join('\n')

  const supervisorPrompt = (task, extra = []) => [
    `You are the supervisor ("super agent") of a super team: you coordinate several agent teams. You do not do the teams' work yourself; you plan, delegate, review and write the final answer.`,
    cfg.projectInfo ? `# Project "${cfg.projectInfo.name}"${cfg.projectInfo.description ? `\n${cfg.projectInfo.description}` : ''}` : null,
    cfg.instructions ? `# Standing instructions for this super team\n${cfg.instructions}` : null,
    `# Teams you can use\n${catalog()}`,
    historyText ? `# Earlier in this conversation\n${historyText}` : null,
    `# The user's request\n${text}`,
    env.cwd ? `# Working folder shared by all teams\n${env.cwd}` : null,
    ...extra,
    `# Your job now\n${task}`,
  ].filter(Boolean).join('\n\n')

  const askSupervisor = async (label, task, extra, schema) => {
    const n = addStep({ kind: label, title: label === 'plan' ? 'Supervisor plans' : label === 'review' ? 'Supervisor reviews' : label === 'delegate' ? 'Supervisor delegates' : 'Supervisor writes the answer', agent: cfg.supervisor })
    const out = await api.agent(cfg.supervisor, supervisorPrompt(task, extra), { label: `${n}:supervisor:${label}`, schema, cwd: env.cwd })
    endStep(n, { status: out == null ? (api.signal.aborted ? 'cancelled' : 'failed') : 'done', output: out == null ? null : clip(typeof out === 'string' ? out : JSON.stringify(out, null, 2), OUT_CLIP), data: typeof out === 'object' ? out : undefined })
    return out
  }

  const cleanAssignments = list => {
    const seen = new Set()
    return (Array.isArray(list) ? list : []).filter(a => a && teamsByName.has(a.team) && !seen.has(a.team) && seen.add(a.team)).map(a => ({ team: a.team, brief: str(a.brief, 12000).trim() || text }))
  }
  const cleanWaves = waves => (Array.isArray(waves) ? waves : []).map(w => cleanAssignments(w?.assignments)).filter(w => w.length)

  // ---- one team assignment as a step
  const runAssignment = async (a, { round, wave, prior, group } = {}) => {
    const entry = teamsByName.get(a.team)
    const n = addStep({ kind: 'team', team: a.team, mode: entry.mode, title: `Team ${a.team}`, brief: a.brief, round, wave, group })
    api.log(`step ${n}: team ${a.team} (${entry.mode})`)
    const others = names.filter(x => x !== a.team)
    const priorText = prior ?? resultsText()
    let chatId = null
    try { chatId = env.ensureChat?.(a.team) ?? null } catch (e) { api.log(`team ${a.team}: no team chat (${e.message})`) }
    const linked = !!chatId && entry.chat !== 'copy' && entry.mode !== 'workflow'
    if (chatId) patch(m => { const s = m.steps.find(x => x.n === n); if (s) { s.chatId = chatId; s.chat = linked ? 'linked' : 'copy' } })
    const via = { superTeam: env.superId, title: cfg.title, step: n, runId: api.run.id }
    const chatText = chatBrief({ cfg, entry, brief: a.brief, request: text, prior: priorText, others, n })
    let out
    if (linked) {
      try {
        out = await runLinkedTeam({ chats: env.chats, chatId, api, text: chatText, via, n, team: a.team })
      } catch (e) {
        if (api.signal.aborted) out = { ok: false, text: 'Stopped.', replies: [] }
        else { api.log(`team ${a.team}: chat ${chatId} failed (${e.message}); running a fresh discussion instead`); out = null }
      }
    }
    if (!out) {
      try {
        out = await runTeam({ project: cfg.projectInfo, registry, api, entry, brief: a.brief, n, cwd: env.cwd, request: text, history: historyText, prior: priorText, others })
      } catch (e) { out = { ok: false, text: `Team failed: ${e.message}`, replies: [], full: [] } }
      // copy the discussion into the team's chat for visibility (in the background: a busy chat must not hold up the team)
      if (chatId && !linked && out.full?.length) env.chats.appendExchange(chatId, { text: chatText, via, replies: out.full }, { signal: api.signal }).catch(e => api.log(`team ${a.team}: could not copy into chat ${chatId}: ${e.message}`))
    }
    const r = { n, team: a.team, brief: a.brief, text: clip(out.text, OUT_CLIP), ok: out.ok, round }
    endStep(n, { status: api.signal.aborted ? 'cancelled' : out.ok ? 'done' : 'failed', output: r.text, replies: out.replies })
    api.save(`step-${String(n).padStart(2, '0')}-${a.team}.md`, `# Team ${a.team}\n\n## Brief\n\n${a.brief}\n\n## Result\n\n${out.text}`)
    return r
  }
  const runWave = async (wave, opts) => {
    api.phase(`${opts.round ? `round ${opts.round} · ` : ''}${wave.length > 1 ? `parallel: ${wave.map(a => a.team).join(' + ')}` : wave[0].team}`)
    const prior = resultsText() // everyone in a wave sees the same earlier results
    const group = ++groupNo
    const rs = wave.length === 1 ? [await runAssignment(wave[0], { ...opts, prior, group })] : await api.parallel(wave.map(a => () => runAssignment(a, { ...opts, prior, group })))
    for (const r of rs) if (r) results.push(r)
    return rs
  }

  // ---- team-to-team hand-offs (@team in a team result)
  const followHandoffs = async () => {
    let hops = 0
    while (!api.signal.aborted && hops < cfg.maxHops) {
      const last = results.at(-1)
      if (!last?.ok) break
      const lastLine = last.text.slice(-4000)
      const next = mentionsIn(lastLine, names, last.team)
      if (!next.length) break
      for (const t of next) {
        if (api.signal.aborted || hops >= cfg.maxHops) break
        hops++
        await runWave([{ team: t, brief: `Team ${last.team} handed this over to your team (see its result in "Results so far"). Continue the user's request from there.` }], { round: `hand-off ${hops}` })
      }
    }
  }

  const synthesize = async () => {
    if (!results.length) return 'No team produced a result.'
    if (!cfg.synthesize) return results.map(r => `## ${r.team}\n\n${r.text}`).join('\n\n')
    api.phase('synthesis')
    const out = await askSupervisor('answer', 'Write the final answer to the user from the teams\' results below. Integrate and reconcile them (flag disagreements or failures), keep what the user needs, and say which team found what when it matters. Use Markdown. Do not mention this instruction.', [`# Results from the teams\n${resultsText()}`])
    return out ?? `The supervisor could not write the final answer; here are the team results.\n\n${results.map(r => `## ${r.team}\n\n${r.text}`).join('\n\n')}`
  }

  // ======== modes
  if (cfg.mode === 'workflow') {
    const n = addStep({ kind: 'workflow', title: `Workflow ${cfg.workflow}` })
    api.phase(`workflow ${cfg.workflow}`)
    const ctx = { message: text, folder: env.cwd ?? '', teams: names.join(','), date: now().slice(0, 10) }
    const args = { ...Object.fromEntries(Object.entries(cfg.workflowArgs ?? {}).map(([k, v]) => [k, renderTemplate(v, ctx)])), message: text, teams: names.join(',') }
    if (names.length === 1 && !args.team) args.team = names[0]
    const { result } = await runNamed(registry, cfg.workflow, api, args)
    const out = asText(result) ?? '(the workflow returned no result)'
    endStep(n, { status: 'done', output: clip(out, OUT_CLIP) })
    return out
  }

  if (cfg.mode === 'sequential') {
    for (const t of names) {
      if (api.signal.aborted) break
      const prev = results.length ? ' Build on the earlier teams\' results.' : ''
      await runWave([{ team: t, brief: `${text}${teamsByName.get(t).instructions ? `\n\nYour team's role: ${teamsByName.get(t).instructions}` : ''}\n\n(Teams work in this order: ${names.join(' → ')}. You are step ${names.indexOf(t) + 1}.${prev})` }], {})
    }
    await followHandoffs()
    return synthesize()
  }

  if (cfg.mode === 'parallel') {
    await runWave(names.map(t => ({ team: t, brief: `${text}${teamsByName.get(t).instructions ? `\n\nYour team's role: ${teamsByName.get(t).instructions}` : ''}\n\n(All teams — ${names.join(', ')} — work on this at the same time; focus on your team's strengths.)` })), {})
    await followHandoffs()
    return synthesize()
  }

  if (cfg.mode === 'mention') {
    const picked = mentionsIn(text, names)
    for (const t of picked.length ? picked : [names[0]]) {
      if (api.signal.aborted) break
      await runWave([{ team: t, brief: text }], {})
    }
    await followHandoffs()
    return synthesize()
  }

  if (cfg.mode === 'handoff') {
    for (let round = 1; round <= cfg.maxRounds && !api.signal.aborted; round++) {
      api.phase(`round ${round}: delegate`)
      const d = await askSupervisor('delegate',
        round === 1
          ? 'Decide which team(s) should work FIRST. Give each a self-contained brief. Teams you list run in parallel; you will see their results and then decide the next step. If the request needs no team, set done=true.'
          : `Round ${round} of at most ${cfg.maxRounds}. Look at the results so far and decide the next team(s), or set done=true when the results are enough for the final answer.`,
        results.length ? [`# Results so far\n${resultsText()}`] : [], delegateSchema(names))
      if (!d) { if (round === 1) await runWave([{ team: names[0], brief: text }], { round }); break }
      const wave = cleanAssignments(d.assignments)
      if (d.done || !wave.length) break
      await runWave(wave, { round })
    }
    return synthesize()
  }

  // auto: plan waves, run them, review, optional follow-up rounds
  api.phase('plan')
  const plan = await askSupervisor('plan',
    'Plan how your teams handle this request. Choose only the teams that are useful. Put independent work in the SAME wave so it runs in parallel; put dependent work in LATER waves so it runs in sequence and sees earlier results. Give each assignment a self-contained brief. If no team is needed, give the answer directly and leave waves empty.',
    [], planSchema(names))
  let waves = plan ? cleanWaves(plan.waves) : null
  if (!waves) { api.log('supervisor plan failed; running every team in parallel'); waves = [names.map(t => ({ team: t, brief: text }))] }
  if (!waves.length) return plan?.answer?.trim() || synthesize()
  for (let round = 1; round <= cfg.maxRounds && !api.signal.aborted; round++) {
    for (const [i, wave] of waves.entries()) {
      if (api.signal.aborted) break
      await runWave(wave, { round, wave: i + 1 })
    }
    if (round >= cfg.maxRounds || api.signal.aborted) break
    api.phase(`round ${round}: review`)
    const rv = await askSupervisor('review',
      `Review the teams' results (round ${round} of at most ${cfg.maxRounds}). If they answer the request well enough, set done=true and leave waves empty. Otherwise plan follow-up waves (same rules: one wave = parallel, later waves = sequential) to fix what is missing or wrong.`,
      [`# Results so far\n${resultsText()}`], reviewSchema(names))
    if (!rv || rv.done) break
    waves = cleanWaves(rv.waves)
    if (!waves.length) break
  }
  return synthesize()
}

/**
 * Run one team on a brief with the team's own chat mode, like an Agent chat room:
 *   sequential  every member replies in turn and sees earlier replies
 *   parallel    every member replies at once
 *   mention     only @mentioned members reply (else the first member)
 *   handoff     the lead replies first, then @mentioned members take over
 *   workflow    the team's saved workflow runs with { team, message, ...args }
 * After the first replies, a reply that @mentions a teammate hands the floor to it (up to maxHops).
 * Returns { ok, text, replies: [{ from, ok }] }.
 */
async function runTeam({ project, registry, api, entry, brief, n, cwd, request, history, prior, others }) {
  const team = registry.getTeam(entry.team)
  if (entry.mode === 'workflow') {
    const ctx = { message: brief, request, folder: cwd ?? '', team: team.name, date: now().slice(0, 10) }
    const args = { ...Object.fromEntries(Object.entries(entry.workflowArgs ?? {}).map(([k, v]) => [k, renderTemplate(v, ctx)])), team: team.name, message: brief }
    const { result } = await runNamed(registry, entry.workflow, api, args)
    const text = asText(result)
    const full = [{ from: `workflow:${entry.workflow}`, ok: text != null, text: text ?? '(the workflow returned no result)' }]
    return { ok: text != null, text: full[0].text, replies: [{ from: full[0].from, ok: full[0].ok }], full }
  }

  const members = (entry.agents ?? team.members).filter(a => { try { registry.getAgent(a); return true } catch { return false } })
  if (!members.length) throw new Error(`team ${team.name} has no usable agents`)
  const replies = []
  const transcript = upto => clipStart(replies.slice(0, upto).filter(r => r.ok).map(r => `[@${r.from}]\n${r.text}`).join('\n\n'), CTX_CLIP)

  const ask = async (agent, upto) => {
    if (api.signal.aborted) return null
    const mates = members.filter(a => a !== agent)
    const seen = transcript(upto ?? replies.length)
    const prompt = [
      `You are agent "${agent}" in team "${team.name}"${team.description ? ` (${team.description})` : ''}. A supervisor agent coordinates several teams${others.length ? ` (the other teams: ${others.join(', ')})` : ''} and gave your team the assignment below.`,
      mates.length ? `Your teammates: ${mates.map(a => `@${a}`).join(', ')}. To hand a question or part of the work to a teammate, mention them as @name in your reply; mention a teammate only when you want them to act next.` : null,
      project ? `# Project "${project.name}"${project.description ? `\n${clip(project.description, 4000)}` : ''}` : null,
      entry.instructions ? `# Your team's role in this super team\n${entry.instructions}` : null,
      `# Assignment for your team\n${brief}`,
      brief.trim() !== request.trim() ? `# The user's original request (for context)\n${clip(request, 6000)}` : null,
      history ? `# Earlier in the conversation\n${clipStart(history, 8000)}` : null,
      prior ? `# Results from other teams so far\n${prior}` : null,
      cwd ? `# Working folder\n${cwd}` : null,
      seen ? `# Your team's discussion so far\n${seen}` : null,
      `Write your contribution as yourself (do not start with your name). Do real work with your tools when the assignment needs it. End with a clear result. Use Markdown.${others.length ? ' If another team must take over after yours, mention it as @team-name in your last paragraph.' : ''}`,
    ].filter(Boolean).join('\n\n')
    const out = await api.agent(agent, prompt, { label: `${n}:${team.name}:${agent}`, cwd, team: team.name })
    const text = out == null ? null : String(out).replace(new RegExp(`^\\s*\\**@?${agent}\\**\\s*:\\s*`, 'i'), '')
    replies.push({ from: agent, ok: text != null, text: text ?? '(failed)' })
    return text
  }

  const mentioned = mentionsIn(brief, members)
  const lead = entry.lead && members.includes(entry.lead) ? entry.lead : members[0]
  const first = entry.mode === 'mention' ? (mentioned.length ? mentioned : [members[0]])
    : entry.mode === 'handoff' ? (mentioned.length ? mentioned : [lead])
    : (mentioned.length ? mentioned : members)

  if (entry.mode === 'parallel' && first.length > 1) await api.parallel(first.map(a => () => ask(a, 0)))
  else for (const a of first) { if (api.signal.aborted) break; await ask(a) }

  let hops = 0
  while (!api.signal.aborted && hops < entry.maxHops) {
    const last = replies.at(-1)
    if (!last?.ok) break
    const next = mentionsIn(last.text, members, last.from)
    if (!next.length) break
    for (const a of next) { if (api.signal.aborted || hops >= entry.maxHops) break; await ask(a); hops++ }
  }

  const ok = replies.some(r => r.ok)
  const text = replies.length === 1 ? replies[0].text : replies.map(r => `### @${r.from}\n\n${r.text}`).join('\n\n')
  return { ok, text, replies: replies.map(r => ({ from: r.from, ok: r.ok })), full: replies.map(r => ({ from: r.from, ok: r.ok, text: r.text })) }
}

/** The supervisor's assignment as a message in a team's Agent chat (linked: the team works from it; copy: for reading). */
function chatBrief({ cfg, entry, brief, request, prior, others, n }) {
  return [
    `**Assignment from super team "${cfg.title}"** · step ${n}`,
    brief,
    entry.instructions ? `**Your team's role in this super team:** ${entry.instructions}` : null,
    brief.trim() !== request.trim() ? `**The user's original request (for context):**\n\n${clip(request, 4000)}` : null,
    prior ? `**Results from other teams so far:**\n\n${clipStart(prior, LINKED_PRIOR_CLIP)}` : null,
    others.length ? `End with a clear result. If another team must take over after yours, mention it as @team-name (${others.join(', ')}) in your last paragraph.` : 'End with a clear result.',
  ].filter(Boolean).join('\n\n')
}

/**
 * Run one team inside its Agent chat: post the brief and wait for the room's replies. Each reply runs through
 * this run's api.agent (so it counts in the run's cost and transcripts) with the room's agent settings.
 */
async function runLinkedTeam({ chats, chatId, api, text, via, n, team }) {
  const runner = (agent, o) => api.agent(agent, o.prompt, { def: o.def, contextNote: o.contextNote, extraMcp: o.extraMcp, cwd: o.cwd, team: o.team ?? team, signal: o.signal, onEvent: o.onEvent, full: true, label: `${n}:${team}:${agent}` })
  const { replies } = await chats.postAndWait(chatId, text, { via, runner, signal: api.signal })
  const ok = replies.some(r => r.ok)
  const out = replies.length === 0 ? '(the team chat produced no reply)' : replies.length === 1 ? replies[0].text : replies.map(r => `### @${r.from}\n\n${r.text}`).join('\n\n')
  return { ok, text: out, replies: replies.map(r => ({ from: r.from, ok: r.ok })) }
}
