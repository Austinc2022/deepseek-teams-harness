/**
 * Multi-agent chat rooms.
 *
 * A room holds a list of forge agents and a shared transcript. When the user
 * posts, agents reply according to the room mode:
 *  - sequential: every agent replies in order and sees earlier replies
 *  - parallel:   every agent replies at once, seeing the transcript up to the user message
 *  - mention:    only @mentioned agents reply (falls back to the first agent)
 * In any mode, a reply that @mentions another room agent hands the floor to that
 * agent (bounded by maxHops), so agents can talk to each other.
 *
 * Each reply is one runAgent call, so agents keep their own model, skills,
 * memory, sub-agents and execution environment. Rooms persist as JSON in forge/chats.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { assertName } from './registry.js'
import { runAgent } from './runner.js'

export const CHAT_MODES = ['sequential', 'parallel', 'mention']
const TRANSCRIPT_CHARS = 60000

const now = () => new Date().toISOString()
const newId = () => `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`

export class ChatStore {
  constructor(registry, { log = () => {} } = {}) {
    this.registry = registry
    this.dir = registry.d.chats
    fs.mkdirSync(this.dir, { recursive: true })
    this.log = log
    this.live = new Map() // id -> { abort: AbortController }
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
        return { id: r.id, title: r.title, agents: r.agents, mode: r.mode, team: r.team, busy: this.live.has(r.id), messages: r.messages.length, updatedAt: r.updatedAt }
      } catch { return null }
    }).filter(Boolean).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  }

  get(id) {
    const room = JSON.parse(fs.readFileSync(this.#file(id), 'utf8'))
    room.busy = this.live.has(id)
    return room
  }

  create({ title, agents, team, mode = 'sequential', cwd, maxHops = 4 }) {
    if (team && (!agents || agents.length === 0)) agents = this.registry.getTeam(team).members
    if (!CHAT_MODES.includes(mode)) throw new Error(`mode must be one of ${CHAT_MODES.join(', ')}`)
    const room = {
      id: newId(), title: title?.trim() || `Chat with ${this.#validate(agents).join(', ')}`,
      agents: this.#validate(agents), team: team || undefined, mode, cwd: cwd || undefined,
      maxHops: Math.max(0, Math.min(12, Number(maxHops) || 0)), createdAt: now(), messages: [],
    }
    this.#save(room)
    return room
  }

  update(id, patch) {
    const room = this.get(id)
    if (patch.title !== undefined) room.title = String(patch.title).trim() || room.title
    if (patch.agents !== undefined) room.agents = this.#validate(patch.agents)
    if (patch.mode !== undefined) { if (!CHAT_MODES.includes(patch.mode)) throw new Error('bad mode'); room.mode = patch.mode }
    if (patch.cwd !== undefined) room.cwd = patch.cwd || undefined
    if (patch.maxHops !== undefined) room.maxHops = Math.max(0, Math.min(12, Number(patch.maxHops) || 0))
    delete room.busy
    this.#save(room)
    return room
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
    if (typeof text !== 'string' || !text.trim()) throw new Error('empty message')
    if (this.live.has(id)) throw new Error('agents are still replying; wait or press Stop')
    const room = this.get(id)
    delete room.busy
    room.messages.push({ id: newId(), from: 'user', text: text.trim(), ts: now() })
    this.#save(room)
    const abort = new AbortController()
    this.live.set(id, { abort })
    this.#respond(id, abort.signal)
      .catch(e => this.log(`chat ${id}: ${e?.message ?? e}`))
      .finally(() => this.live.delete(id))
    return { ok: true }
  }

  #mentions(text, room) {
    const found = []
    for (const m of text.matchAll(/@([a-z][a-z0-9-]*)/g)) if (room.agents.includes(m[1]) && !found.includes(m[1])) found.push(m[1])
    return found
  }

  async #respond(id, signal) {
    let room = this.get(id)
    const userMsg = room.messages.at(-1)
    const mentioned = this.#mentions(userMsg.text, room)
    let first
    if (room.mode === 'mention') first = mentioned.length ? mentioned : [room.agents[0]]
    else first = mentioned.length ? mentioned : room.agents

    if (room.mode === 'parallel' && first.length > 1) {
      const cut = room.messages.length
      await Promise.all(first.map(a => this.#reply(id, a, signal, cut)))
    } else {
      for (const a of first) { if (signal.aborted) return; await this.#reply(id, a, signal) }
    }

    // hand-offs: an agent reply that @mentions another room agent gives it the floor
    let hops = 0
    room = this.get(id)
    while (!signal.aborted && hops < room.maxHops) {
      const last = room.messages.at(-1)
      if (!last || last.from === 'user' || last.status !== 'done') break
      const next = this.#mentions(last.text, room).filter(a => a !== last.from)
      if (!next.length) break
      for (const a of next) { if (signal.aborted) break; await this.#reply(id, a, signal); hops++ }
      room = this.get(id)
    }
  }

  #transcript(room, uptoIndex) {
    const msgs = room.messages.slice(0, uptoIndex).filter(m => m.status !== 'failed' && m.status !== 'pending')
    let out = msgs.map(m => `[${m.from === 'user' ? 'user' : `@${m.from}`}]\n${m.text}`).join('\n\n')
    if (out.length > TRANSCRIPT_CHARS) out = `[earlier messages omitted]\n…${out.slice(-TRANSCRIPT_CHARS)}`
    return out
  }

  async #reply(id, agentName, signal, cutoff) {
    let room = this.get(id)
    const def = this.registry.getAgent(agentName)
    const transcript = this.#transcript(room, cutoff ?? room.messages.length)
    const msg = { id: newId(), from: agentName, model: def.model, text: '', status: 'pending', tools: [], ts: now() }
    room.messages.push(msg)
    delete room.busy
    this.#save(room)
    const patch = fn => { const r = this.get(id); delete r.busy; const m = r.messages.find(x => x.id === msg.id); if (m) { fn(m); this.#save(r) } }

    const others = room.agents.filter(a => a !== agentName)
    const contextNote = `You are agent "${agentName}" in a live group chat with a human user${others.length ? ` and these other agents: ${others.map(a => `@${a}`).join(', ')}` : ''}. Reply to the latest message as yourself. Use your tools when the request needs real work. To hand a question or task to another agent, mention them as @name in your reply; mention an agent only when you want them to respond next. Keep replies focused; use Markdown.`
    const prompt = `Group chat transcript so far:\n\n${transcript}\n\n---\nWrite your next message in this chat. Do not start it with your own name; the chat shows who is speaking.`
    let lastFlush = 0
    const res = await runAgent({
      def, registry: this.registry, prompt, cwd: room.cwd, team: room.team, label: `chat:${agentName}`, contextNote, signal,
      onEvent: e => {
        if (e.type !== 'tool') return
        msg.tools.push(e.brief ?? e.name)
        if (Date.now() - lastFlush > 800) { lastFlush = Date.now(); const t = [...msg.tools]; patch(m => { m.tools = t }) }
      },
    })
    patch(m => {
      m.tools = msg.tools
      m.durationMs = res.durationMs
      if (res.ok) { m.status = 'done'; m.text = (res.text ?? JSON.stringify(res.structured, null, 2)).replace(new RegExp(`^\\s*\\**@?${agentName}\\**\\s*:\\s*`, 'i'), '') }
      else { m.status = signal.aborted ? 'cancelled' : 'failed'; m.text = signal.aborted ? 'Stopped.' : res.error }
    })
  }
}
