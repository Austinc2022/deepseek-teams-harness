/**
 * Claude Code bridge gateway.
 *
 * A localhost-only, Anthropic-Messages-compatible HTTP endpoint whose model
 * calls are served by genuine Claude Code sessions (Claude Agent SDK) running
 * on the local user's own Claude Code login. DeepSeek Harness reaches it
 * through a pi-ai `anthropic-messages` route.
 *
 * Fidelity strategy: one live Claude Code session per harness conversation.
 *   - The harness's tools are exposed to Claude Code as MCP tools whose
 *     handlers stay pending. When Claude emits tool_use, the bridge streams
 *     that assistant message back and ends the HTTP response.
 *   - The harness executes the tools and sends a new request whose last user
 *     message carries tool_result blocks for those tool_use ids. The bridge
 *     resolves the pending handlers and the SAME Claude Code session continues,
 *     so prompt caching, thinking and tool semantics stay native.
 *   - A new user turn after a final answer is pushed into the idle session.
 *   - Anything that cannot be matched to a live session (restart, compaction,
 *     changed tools/system/model) starts a fresh session whose first prompt
 *     replays the history as a transcript.
 *
 * Run standalone:  node gateway.js   (env: CLAUDE_BRIDGE_PORT, CLAUDE_BRIDGE_TOKEN)
 */

import http from 'node:http'
import crypto from 'node:crypto'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const MCP_NAME = 'h'
const MCP_PREFIX = `mcp__${MCP_NAME}__`

const DEFAULT_MODELS = [
  { id: 'opus', name: 'Claude Opus (Claude Code)' },
  { id: 'sonnet', name: 'Claude Sonnet (Claude Code)' },
  { id: 'haiku', name: 'Claude Haiku (Claude Code)' },
]

const sha = v => crypto.createHash('sha256').update(typeof v === 'string' ? v : stableStringify(v)).digest('hex').slice(0, 16)

function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`
}

/** Push-based async iterable used as the SDK's streaming input. */
class InputQueue {
  #items = []
  #waiters = []
  #ended = false
  push(item) {
    if (this.#ended) return
    const w = this.#waiters.shift()
    if (w) w({ value: item, done: false })
    else this.#items.push(item)
  }
  end() {
    this.#ended = true
    for (const w of this.#waiters.splice(0)) w({ value: undefined, done: true })
  }
  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.#items.length) return Promise.resolve({ value: this.#items.shift(), done: false })
        if (this.#ended) return Promise.resolve({ value: undefined, done: true })
        return new Promise(r => this.#waiters.push(r))
      },
      return: () => { this.end(); return Promise.resolve({ value: undefined, done: true }) },
    }
  }
}

function systemText(system) {
  if (system == null) return ''
  if (typeof system === 'string') return system
  return system.filter(b => b?.type === 'text').map(b => b.text).join('\n\n')
}

function blocksOf(content) {
  if (content == null) return []
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return content
}

function textOfBlocks(blocks) {
  return blocksOf(blocks).filter(b => b.type === 'text').map(b => b.text).join('\n')
}

/** Anthropic tool_result content → MCP CallToolResult. */
function toMcpResult(block) {
  const content = []
  for (const b of blocksOf(block.content)) {
    if (b.type === 'text') content.push({ type: 'text', text: b.text })
    else if (b.type === 'image' && b.source?.type === 'base64') content.push({ type: 'image', data: b.source.data, mimeType: b.source.media_type })
  }
  if (content.length === 0) content.push({ type: 'text', text: '(empty result)' })
  return { content, isError: block.is_error === true }
}

/** Render prior history as user-content blocks for a fresh session. */
function renderTranscript(messages) {
  const out = []
  const text = t => {
    const last = out[out.length - 1]
    if (last?.type === 'text') last.text += t
    else out.push({ type: 'text', text: t })
  }
  text('<conversation_history>\nThe following is the conversation so far (you are "assistant"). Tool calls you made earlier are shown as <tool_call>; their results as <tool_result>. Do NOT write these tags yourself: to use a tool, call it through the tool interface.\n')
  for (const m of messages) {
    text(`\n[${m.role}]\n`)
    for (const b of blocksOf(m.content)) {
      if (b.type === 'text') text(b.text + '\n')
      else if (b.type === 'image') { out.push(b); text('\n') }
      else if (b.type === 'tool_use') text(`<tool_call id="${b.id}" name="${b.name}">${JSON.stringify(b.input)}</tool_call>\n`)
      else if (b.type === 'tool_result') {
        text(`<tool_result id="${b.tool_use_id}"${b.is_error ? ' error="true"' : ''}>`)
        for (const c of blocksOf(b.content)) {
          if (c.type === 'text') text(c.text)
          else if (c.type === 'image') { out.push(c); text('') }
        }
        text('</tool_result>\n')
      }
    }
  }
  text('</conversation_history>\n\nContinue the conversation: produce the next assistant turn now.')
  return out
}

/** Minimal assembler for non-streaming responses. */
class MessageAssembler {
  message = null
  blocks = []
  partialJson = new Map()
  push(ev) {
    switch (ev.type) {
      case 'message_start': this.message = { ...ev.message, content: [] }; break
      case 'content_block_start': this.blocks[ev.index] = { ...ev.content_block }; break
      case 'content_block_delta': {
        const b = this.blocks[ev.index]
        if (!b) break
        const d = ev.delta
        if (d.type === 'text_delta') b.text = (b.text ?? '') + d.text
        else if (d.type === 'thinking_delta') b.thinking = (b.thinking ?? '') + d.thinking
        else if (d.type === 'signature_delta') b.signature = d.signature
        else if (d.type === 'input_json_delta') this.partialJson.set(ev.index, (this.partialJson.get(ev.index) ?? '') + d.partial_json)
        break
      }
      case 'content_block_stop': {
        const j = this.partialJson.get(ev.index)
        if (j !== undefined) { try { this.blocks[ev.index].input = JSON.parse(j || '{}') } catch { this.blocks[ev.index].input = {} } }
        break
      }
      case 'message_delta':
        if (this.message) {
          Object.assign(this.message, ev.delta)
          if (ev.usage) this.message.usage = { ...this.message.usage, ...ev.usage }
        }
        break
    }
  }
  result() { return { ...this.message, content: this.blocks.filter(Boolean) } }
}

let sessionSeq = 0

class BridgeSession {
  constructor(gw, { model, system, tools, thinking, effort, maxTokens }) {
    this.gw = gw
    this.id = `s${++sessionSeq}`
    this.model = model
    this.systemHash = sha(system)
    this.toolsHash = sha(tools ?? [])
    this.toolDefs = (tools ?? []).filter(t => t && t.name && !t.type) // custom tools only
    this.state = 'starting' // starting | busy | awaiting_tools | idle | dead
    this.lastUsed = Date.now()
    this.pending = [] // tool_use blocks from the last assistant message
    this.results = new Map() // tool_use_id -> MCP result
    this.waiters = [] // { id, resolve }
    this.orphans = [] // handler calls that arrived before their tool_use was known
    this.bound = new Set() // tool_use ids already matched to a handler call
    this.lastAssistantText = null
    this.sink = null
    this.current = null
    this.input = new InputQueue()
    this.abort = new AbortController()

    const mcp = new McpServer({ name: 'harness-tools', version: '1.0.0' }, { capabilities: { tools: {} } })
    mcp.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.toolDefs.map(t => ({ name: t.name, description: t.description ?? '', inputSchema: t.input_schema ?? { type: 'object', properties: {} } })),
    }))
    mcp.server.setRequestHandler(CallToolRequestSchema, async req => this.#onToolCall(req.params.name, req.params.arguments ?? {}))

    const keep = new Set(['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR'])
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.has(k) || !/^(CLAUDECODE$|CLAUDE_CODE_|CLAUDE_PID$|CLAUDE_EFFORT$|CLAUDE_AGENT_SDK_)/.test(k)))
    const env = { ...inherited, ENABLE_TOOL_SEARCH: 'false', CLAUDE_AGENT_SDK_CLIENT_APP: 'dsh-claude-code-bridge/0.1.0' }
    if (!gw.opts.allowApiKeyEnv) { delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ANTHROPIC_BASE_URL }
    if (maxTokens) env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(maxTokens)

    const options = {
      model,
      systemPrompt: system || 'You are a helpful assistant.',
      tools: [],
      mcpServers: { [MCP_NAME]: { type: 'sdk', name: MCP_NAME, instance: mcp } },
      strictMcpConfig: true,
      allowedTools: [`mcp__${MCP_NAME}`],
      permissionMode: 'dontAsk',
      settingSources: [],
      settings: { autoMemoryEnabled: false },
      persistSession: false,
      includePartialMessages: true,
      cwd: gw.opts.cwd,
      env,
      abortController: this.abort,
    }
    if (thinking?.type === 'enabled' && thinking.budget_tokens) options.maxThinkingTokens = thinking.budget_tokens
    else if (thinking?.type === 'disabled') options.thinking = { type: 'disabled' }
    else if (thinking?.type === 'adaptive') options.thinking = { type: 'adaptive' }
    if (effort) options.effort = effort

    this.q = query({ prompt: this.input, options })
    this.loop = this.#run().catch(err => this.#fail(err))
  }

  matches({ model, system, tools }) {
    return this.state !== 'dead' && this.model === model && this.systemHash === sha(system) && this.toolsHash === sha(tools ?? [])
  }

  #onToolCall(name, args) {
    this.lastUsed = Date.now()
    // Claude Code may invoke the handler before the bridge has processed the
    // assistant message's message_stop, so unmatched calls wait for it.
    return new Promise(resolve => {
      const call = { name, args, resolve }
      if (!this.#correlate(call)) this.orphans.push(call)
    })
  }

  #correlate(call) {
    const key = stableStringify(call.args)
    const block = this.pending.find(b => !this.bound.has(b.id) && b.name === call.name && stableStringify(b.input ?? {}) === key)
      ?? this.pending.find(b => !this.bound.has(b.id) && b.name === call.name)
    if (!block) return false
    this.bound.add(block.id)
    const ready = this.results.get(block.id)
    if (ready) call.resolve(ready)
    else this.waiters.push({ id: block.id, resolve: call.resolve })
    return true
  }

  /** Begin a turn: attach a response sink, then feed input. */
  startTurn(sink, feed) {
    this.sink = sink
    this.state = 'busy'
    this.lastUsed = Date.now()
    this.current = { blocks: [], json: new Map(), stopReason: null, text: '' }
    feed()
  }

  pushUser(content) {
    this.input.push({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null })
  }

  deliverToolResults(resultBlocks, extraBlocks) {
    for (const rb of resultBlocks) {
      const r = toMcpResult(rb)
      if (extraBlocks.length && rb === resultBlocks[resultBlocks.length - 1]) {
        for (const x of extraBlocks) if (x.type === 'text') r.content.push({ type: 'text', text: x.text })
      }
      this.results.set(rb.tool_use_id, r)
      const i = this.waiters.findIndex(w => w.id === rb.tool_use_id)
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(r)
    }
  }

  async #run() {
    for await (const m of this.q) {
      this.lastUsed = Date.now()
      if (m.type === 'stream_event' && m.parent_tool_use_id == null) this.#onEvent(m.event)
      else if (m.type === 'result') {
        if (this.sink && m.is_error) {
          this.#sendError(m.subtype === 'success' ? (m.result || 'Claude Code error') : (m.errors?.join('; ') || m.subtype))
        }
        if (this.state === 'busy' && !this.sink) this.state = 'idle'
      }
    }
    this.#fail(new Error('Claude Code session ended'))
  }

  #onEvent(ev) {
    const cur = this.current
    if (!cur) return
    let out = ev
    if (ev.type === 'content_block_start') {
      const cb = { ...ev.content_block }
      if (cb.type === 'tool_use' && cb.name?.startsWith(MCP_PREFIX)) cb.name = cb.name.slice(MCP_PREFIX.length)
      if (cb.type === 'server_tool_use' || cb.type === 'redacted_thinking') { /* pass through */ }
      cur.blocks[ev.index] = cb
      out = { ...ev, content_block: cb.type === 'tool_use' ? { ...cb, input: {} } : cb }
    } else if (ev.type === 'content_block_delta') {
      const b = cur.blocks[ev.index]
      if (ev.delta.type === 'input_json_delta') cur.json.set(ev.index, (cur.json.get(ev.index) ?? '') + ev.delta.partial_json)
      else if (ev.delta.type === 'text_delta' && b) cur.text += ev.delta.text
    } else if (ev.type === 'content_block_stop') {
      const j = cur.json.get(ev.index)
      if (j !== undefined && cur.blocks[ev.index]) { try { cur.blocks[ev.index].input = JSON.parse(j || '{}') } catch { cur.blocks[ev.index].input = {} } }
    } else if (ev.type === 'message_delta') {
      if (ev.delta?.stop_reason) cur.stopReason = ev.delta.stop_reason
    }
    this.sink?.event(out)
    if (ev.type === 'message_stop') this.#finishMessage()
  }

  #finishMessage() {
    const cur = this.current
    const tools = cur.blocks.filter(b => b?.type === 'tool_use')
    if (cur.stopReason === 'tool_use' && tools.length) {
      this.pending = tools
      this.bound = new Set()
      this.results = new Map()
      this.state = 'awaiting_tools'
      this.lastAssistantText = null
      this.orphans = this.orphans.filter(call => !this.#correlate(call))
    } else {
      this.pending = []
      this.state = 'idle'
      this.lastAssistantText = cur.text
    }
    this.current = null
    const s = this.sink
    this.sink = null
    s?.end()
  }

  #sendError(message) {
    const s = this.sink
    this.sink = null
    this.current = null
    s?.error(message)
    this.state = 'dead'
    this.close()
  }

  #fail(err) {
    if (this.sink) this.#sendError(err?.message ?? String(err))
    this.state = 'dead'
    this.close()
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.state = 'dead'
    for (const w of [...this.waiters.splice(0), ...this.orphans.splice(0)]) w.resolve({ content: [{ type: 'text', text: 'Session closed' }], isError: true })
    this.input.end()
    try { this.abort.abort() } catch {}
    this.gw.sessions.delete(this.id)
  }
}

export class ClaudeCodeGateway {
  constructor(opts = {}) {
    this.opts = {
      host: '127.0.0.1',
      port: 3099,
      token: undefined,
      models: DEFAULT_MODELS,
      maxSessions: 24,
      idleMs: 20 * 60_000,
      awaitingToolsMs: 3 * 60 * 60_000,
      allowApiKeyEnv: false,
      cwd: path.join(os.tmpdir(), 'dsh-claude-code-bridge'),
      log: (...a) => console.error('[claude-code-bridge]', ...a),
      ...opts,
    }
    fs.mkdirSync(this.opts.cwd, { recursive: true })
    this.sessions = new Map()
  }

  async start() {
    this.server = http.createServer((req, res) => this.#handle(req, res).catch(err => {
      this.opts.log('request failed', err)
      if (!res.headersSent) json(res, 500, { type: 'error', error: { type: 'api_error', message: String(err?.message ?? err) } })
      else res.end()
    }))
    await new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.opts.port, this.opts.host, resolve)
    })
    this.sweeper = setInterval(() => this.#sweep(), 30_000)
    this.sweeper.unref?.()
    this.opts.log(`listening on http://${this.opts.host}:${this.server.address().port}`)
    return this
  }

  async stop() {
    clearInterval(this.sweeper)
    for (const s of [...this.sessions.values()]) s.close()
    await new Promise(r => this.server ? this.server.close(() => r()) : r())
  }

  #sweep() {
    const now = Date.now()
    for (const s of [...this.sessions.values()]) {
      const limit = s.state === 'awaiting_tools' ? this.opts.awaitingToolsMs : this.opts.idleMs
      if (s.state !== 'busy' && now - s.lastUsed > limit) s.close()
    }
  }

  #authorized(req) {
    if (!this.opts.token) return true
    const key = req.headers['x-api-key'] ?? (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    const a = Buffer.from(String(key)), b = Buffer.from(this.opts.token)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }

  async #handle(req, res) {
    const url = new URL(req.url, 'http://localhost')
    const p = url.pathname.replace(/\/+$/, '')
    if (req.method === 'GET' && (p === '' || p === '/health')) return json(res, 200, { ok: true, sessions: this.sessions.size })
    if (!this.#authorized(req)) return json(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid bridge token' } })
    if (req.method === 'GET' && (p === '/v1/models' || p === '/models')) {
      return json(res, 200, { data: this.opts.models.map(m => ({ type: 'model', id: m.id, display_name: m.name, max_input_tokens: m.contextWindow ?? 200000, max_tokens: m.maxTokens ?? 64000 })), has_more: false })
    }
    if (req.method === 'POST' && (p === '/v1/messages' || p === '/messages')) return this.#messages(req, res)
    if (req.method === 'POST' && p.endsWith('/count_tokens')) {
      const body = await readJson(req)
      return json(res, 200, { input_tokens: Math.ceil(JSON.stringify(body).length / 4) })
    }
    return json(res, 404, { type: 'error', error: { type: 'not_found_error', message: `${req.method} ${p}` } })
  }

  #pick(body) {
    const messages = body.messages ?? []
    const last = messages[messages.length - 1]
    const key = { model: body.model, system: systemText(body.system), tools: body.tools }
    if (!last || last.role !== 'user') return { session: null, key }
    const blocks = blocksOf(last.content)
    const results = blocks.filter(b => b.type === 'tool_result')
    const extra = blocks.filter(b => b.type !== 'tool_result')
    if (results.length) {
      const ids = new Set(results.map(r => r.tool_use_id))
      for (const s of this.sessions.values()) {
        if (s.state === 'awaiting_tools' && s.matches(key) && s.pending.length === ids.size && s.pending.every(b => ids.has(b.id))) {
          return { session: s, key, kind: 'tools', results, extra }
        }
      }
      return { session: null, key }
    }
    const prev = messages[messages.length - 2]
    if (prev?.role === 'assistant') {
      const prevText = textOfBlocks(prev.content)
      for (const s of this.sessions.values()) {
        if (s.state === 'idle' && s.matches(key) && s.lastAssistantText !== null && s.lastAssistantText.trim() === prevText.trim()) {
          return { session: s, key, kind: 'user', content: blocks }
        }
      }
    }
    return { session: null, key }
  }

  #evict() {
    while (this.sessions.size >= this.opts.maxSessions) {
      const victims = [...this.sessions.values()].filter(s => s.state !== 'busy').sort((a, b) => a.lastUsed - b.lastUsed)
      if (!victims.length) break
      victims[0].close()
    }
  }

  async #messages(req, res) {
    const body = await readJson(req)
    const messages = body.messages ?? []
    if (!messages.length) return json(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'messages must be non-empty' } })
    const model = body.model || this.opts.models[0].id
    body.model = model
    const pick = this.#pick(body)
    let session = pick.session
    let feed
    if (session) {
      if (pick.kind === 'tools') feed = () => session.deliverToolResults(pick.results, pick.extra)
      else feed = () => session.pushUser(pick.content)
    } else {
      this.#evict()
      session = new BridgeSession(this, {
        model,
        system: pick.key.system,
        tools: body.tools,
        thinking: body.thinking,
        effort: body.output_config?.effort,
        maxTokens: body.max_tokens,
      })
      this.sessions.set(session.id, session)
      const last = messages[messages.length - 1]
      const onlyFirstUser = messages.length === 1 && last.role === 'user' && !blocksOf(last.content).some(b => b.type === 'tool_result')
      const content = onlyFirstUser ? blocksOf(last.content) : renderTranscript(messages)
      feed = () => session.pushUser(content)
    }
    this.opts.log(`${req.socket.remoteAddress} model=${model} session=${session.id} ${pick.session ? `continue(${pick.kind})` : 'fresh'} msgs=${messages.length} tools=${body.tools?.length ?? 0}`)

    const stream = body.stream === true
    let closedByClient = false
    if (stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      res.on('close', () => { if (!res.writableEnded) { closedByClient = true; if (session.sink) { session.sink = null; session.close() } } })
      await new Promise(resolve => {
        session.startTurn({
          event: ev => { if (!closedByClient) res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`) },
          end: () => { res.end(); resolve() },
          error: msg => {
            if (!closedByClient) res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: classify(msg), message: msg } })}\n\n`)
            res.end(); resolve()
          },
        }, feed)
      })
    } else {
      const asm = new MessageAssembler()
      await new Promise(resolve => {
        session.startTurn({
          event: ev => asm.push(ev),
          end: () => { json(res, 200, asm.result()); resolve() },
          error: msg => { json(res, statusFor(msg), { type: 'error', error: { type: classify(msg), message: msg } }); resolve() },
        }, feed)
      })
    }
  }
}

function classify(msg) {
  const m = String(msg).toLowerCase()
  if (m.includes('rate') || m.includes('usage limit') || m.includes('limit reached')) return 'rate_limit_error'
  if (m.includes('overloaded')) return 'overloaded_error'
  if (m.includes('auth') || m.includes('login')) return 'authentication_error'
  if (m.includes('prompt is too long') || m.includes('context')) return 'invalid_request_error'
  return 'api_error'
}
function statusFor(msg) {
  return { rate_limit_error: 429, overloaded_error: 529, authentication_error: 401, invalid_request_error: 400 }[classify(msg)] ?? 500
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(value))
}

async function readJson(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const gw = new ClaudeCodeGateway({
    port: Number(process.env.CLAUDE_BRIDGE_PORT ?? 3099),
    token: process.env.CLAUDE_BRIDGE_TOKEN || undefined,
  })
  await gw.start()
  const shutdown = () => gw.stop().then(() => process.exit(0))
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
