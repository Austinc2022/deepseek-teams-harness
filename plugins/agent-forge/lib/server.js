/**
 * Agent Forge web console: a JSON API plus a single-page UI.
 *
 * `createForgeHandler` is transport-agnostic and is mounted two ways:
 *  - standalone (startConsole): 127.0.0.1:<port>, Host allowlist (DNS
 *    rebinding), X-Forge-Token header on every API call.
 *  - inside the DSH web UI (agent-forge-web): under /forge on DSH's own server,
 *    authenticated by the DSH browser-session cookie.
 * Both modes require a custom header on API calls, which forces a CORS
 * preflight that is never approved, so other web pages cannot drive the API.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import { MODELS, EFFORTS, PERMISSIONS, EXEC_MODES, MEMORY_MODES, MEMORY_SCOPES, BACKENDS } from './registry.js'
import { listSkills, installSkill, removeSkill } from './skills.js'
import { runAgent } from './runner.js'
import { CHAT_MODES } from './chat.js'
import { listFiles, readFile, writeFile, deleteFile } from './agent-files.js'
import { McpLibrary, MCP_TYPES, MASK } from './mcp.js'
import { cliStatus } from './cli-backends.js'

/** Claude Code built-in tools, grouped for the agent editor (names as reported by a live session). */
export const BUILTIN_TOOLS = [
  { group: 'Files', tools: [['Read', 'read files'], ['Write', 'create or overwrite files'], ['Edit', 'edit files'], ['NotebookEdit', 'edit Jupyter notebooks']] },
  { group: 'Shell', tools: [['Bash', 'run shell commands (also search: grep, find)'], ['Monitor', 'watch long-running commands'], ['TaskOutput', 'read background task output'], ['TaskStop', 'stop background tasks']] },
  { group: 'Web', tools: [['WebSearch', 'search the web'], ['WebFetch', 'fetch web pages']] },
  { group: 'Agents', tools: [['Task', 'delegate to sub-agents'], ['Workflow', 'run multi-agent workflow scripts'], ['SendMessage', 'message other agents'], ['ListAgents', 'list running agents']] },
  { group: 'Scheduling', tools: [['CronCreate', 'create scheduled jobs'], ['CronDelete', 'delete scheduled jobs'], ['CronList', 'list scheduled jobs'], ['ScheduleWakeup', 'resume later']] },
  { group: 'Other', tools: [['Skill', 'use selected skills'], ['ToolSearch', 'load deferred tools (needed for many MCP tools)'], ['EnterWorktree', 'use git worktrees'], ['ExitWorktree', 'leave git worktrees'], ['PushNotification', 'send notifications'], ['ReportFindings', 'report review findings']] },
]

const here = path.dirname(fileURLToPath(import.meta.url))
const MAX_BODY = 40 * 1024 * 1024 // content-folder uploads arrive base64-encoded
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'"

export function consoleToken(registry) {
  if (process.env.AGENT_FORGE_TOKEN) return process.env.AGENT_FORGE_TOKEN
  const f = path.join(registry.d.cache, 'console-token')
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(18).toString('hex'), { mode: 0o600 })
  return fs.readFileSync(f, 'utf8').trim()
}

export const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'content-security-policy': CSP, 'referrer-policy': 'no-referrer' })
  res.end(type === 'application/json' ? JSON.stringify(body) : body)
}

/**
 * @param {{registry, engine, chats}} s shared forge services
 * @returns {(req, res, subpath: string, opts: {authorizeApi: (req) => boolean}) => Promise<void>}
 *   subpath is the request path relative to the mount point ("/", "/api/agents", ...)
 */
export function createForgeHandler({ registry, engine, chats }) {
  const adhoc = new Map()
  const mcp = new McpLibrary(registry.d.mcp)
  const routes = [
    ['GET', /^\/api\/meta$/, () => ({ models: MODELS, efforts: EFFORTS, permissions: PERMISSIONS, execModes: EXEC_MODES, memoryModes: MEMORY_MODES, memoryScopes: MEMORY_SCOPES, backends: BACKENDS, cli: Object.fromEntries(Object.entries(cliStatus()).map(([k, v]) => [k, { installed: v.installed }])), chatModes: CHAT_MODES, mcpTypes: MCP_TYPES, mask: MASK, builtinTools: BUILTIN_TOOLS, home: registry.home })],
    ['GET', /^\/api\/mcp$/, () => mcp.list().map(s => ({ ...s, usedBy: registry.listAgents().filter(a => (a.mcp ?? []).includes(s.name)).map(a => a.name) }))],
    ['GET', /^\/api\/mcp\/([\w-]+)$/, (_, [n]) => mcp.masked(mcp.get(n))],
    ['PUT', /^\/api\/mcp\/([\w-]+)$/, (b, [n]) => mcp.save({ ...b, name: n })],
    ['DELETE', /^\/api\/mcp\/([\w-]+)$/, (_, [n]) => (mcp.delete(n), { ok: true })],
    ['POST', /^\/api\/mcp\/([\w-]+)\/test$/, (_, [n]) => mcp.test(n)],
    ['GET', /^\/api\/agents$/, () => registry.listAgents()],
    ['GET', /^\/api\/agents\/([\w-]+)$/, (_, [n]) => ({ definition: registry.getAgent(n), source: registry.getAgentSource(n) })],
    ['PUT', /^\/api\/agents\/([\w-]+)$/, (b, [n]) => b.source !== undefined ? registry.saveAgentSource(n, b.source) : registry.saveAgent({ ...b.definition, name: n })],
    ['DELETE', /^\/api\/agents\/([\w-]+)$/, (_, [n]) => (registry.deleteAgent(n), { ok: true })],
    ['GET', /^\/api\/agents\/([\w-]+)\/folders$/, (_, [n]) => { const def = registry.getAgent(n); const f = registry.agentFolders(def); return { ...f, defaultCwd: f.project ?? f.home } }],
    ['GET', /^\/api\/agents\/([\w-]+)\/files$/, (_, [n]) => listFiles(registry.agentHome(n).files)],
    ['GET', /^\/api\/agents\/([\w-]+)\/file$/, (_, [n], q) => readFile(registry.agentHome(n).files, q.get('path'))],
    ['PUT', /^\/api\/agents\/([\w-]+)\/file$/, (b, [n]) => writeFile(registry.agentHome(n).files, b.path, b.content, b.encoding)],
    ['DELETE', /^\/api\/agents\/([\w-]+)\/file$/, (_, [n], q) => (deleteFile(registry.agentHome(n).files, q.get('path')), { ok: true })],
    ['POST', /^\/api\/agents\/([\w-]+)\/clone$/, (b, [n]) => registry.cloneAgent(n, b.name, b.changes ?? {})],
    ['POST', /^\/api\/agents\/([\w-]+)\/run$/, (b, [n]) => {
      const def = registry.getAgent(n)
      const id = `adhoc-${Date.now().toString(36)}`
      const entry = { id, agent: n, status: 'running', startedAt: new Date().toISOString(), tools: [], result: null }
      adhoc.set(id, entry)
      runAgent({ def, registry, prompt: b.prompt, cwd: b.cwd || undefined, onEvent: e => e.type === 'tool' && entry.tools.push(e.brief) })
        .then(r => Object.assign(entry, { status: r.ok ? 'completed' : 'failed', result: r.ok ? (r.text ?? r.structured) : r.error, endedAt: new Date().toISOString() }))
      return { id }
    }],
    ['GET', /^\/api\/adhoc\/([\w-]+)$/, (_, [id]) => adhoc.get(id) ?? (() => { throw new Error('unknown ad-hoc run') })()],
    ['GET', /^\/api\/teams$/, () => registry.listTeams()],
    ['PUT', /^\/api\/teams\/([\w-]+)$/, (b, [n]) => registry.saveTeam({ ...b, name: n })],
    ['DELETE', /^\/api\/teams\/([\w-]+)$/, (_, [n]) => (registry.deleteTeam(n), { ok: true })],
    ['GET', /^\/api\/orchestrations$/, () => registry.listOrchestrations()],
    ['GET', /^\/api\/orchestrations\/([\w-]+)$/, (_, [n]) => {
      const o = registry.getOrchestrationSource(n)
      if (o.format === 'yaml') { try { o.spec = YAML.parse(o.source) } catch {} }
      return o
    }],
    ['PUT', /^\/api\/orchestrations\/([\w-]+)$/, (b, [n]) => registry.saveOrchestration(n, b.format, b.format === 'yaml' && b.spec ? YAML.stringify({ ...b.spec, name: n }, { lineWidth: 0 }) : b.source)],
    ['DELETE', /^\/api\/orchestrations\/([\w-]+)$/, (_, [n]) => (registry.deleteOrchestration(n), { ok: true })],
    ['GET', /^\/api\/runs$/, () => engine.listRuns()],
    ['POST', /^\/api\/runs$/, b => { const r = engine.start(b.orchestration, b.args ?? {}, { cwd: b.cwd || undefined }); return { id: r.id } }],
    ['GET', /^\/api\/runs\/([\w-]+)$/, (_, [id]) => engine.getRun(id)],
    ['POST', /^\/api\/runs\/([\w-]+)\/cancel$/, (_, [id]) => ({ cancelled: engine.cancel(id) })],
    ['GET', /^\/api\/runs\/([\w-]+)\/file$/, (_, [id], q) => ({ content: engine.readRunFile(id, q.get('path')) })],
    ['GET', /^\/api\/skills$/, () => listSkills(registry.d.skills)],
    ['POST', /^\/api\/skills$/, b => installSkill(registry.d.skills, b.source, { name: b.name || undefined, overwrite: !!b.overwrite })],
    ['DELETE', /^\/api\/skills\/([\w-]+)$/, (_, [n]) => (removeSkill(registry.d.skills, n), { ok: true })],
    ['GET', /^\/api\/chats$/, () => chats.list()],
    ['POST', /^\/api\/chats$/, b => chats.create(b)],
    ['GET', /^\/api\/chats\/([\w-]+)$/, (_, [id]) => chats.view(id)],
    ['PUT', /^\/api\/chats\/([\w-]+)$/, (b, [id]) => chats.update(id, b)],
    ['DELETE', /^\/api\/chats\/([\w-]+)$/, (_, [id]) => (chats.delete(id), { ok: true })],
    ['POST', /^\/api\/chats\/([\w-]+)\/messages$/, (b, [id]) => chats.post(id, b.text, { to: b.to || undefined })],
    ['POST', /^\/api\/chats\/([\w-]+)\/cancel$/, (b, [id]) => ({ cancelled: b?.agent ? chats.cancelAgent(id, b.agent) : chats.cancel(id) })],
    ['GET', /^\/api\/chats\/([\w-]+)\/overview$/, (_, [id]) => chats.overview(id)],
    ['POST', /^\/api\/chats\/([\w-]+)\/summary$/, (_, [id]) => chats.summarize(id)],
    ['GET', /^\/api\/chats\/([\w-]+)\/memory$/, (_, [id]) => chats.memory(id)],
    ['PUT', /^\/api\/chats\/([\w-]+)\/memory$/, (b, [id]) => chats.saveMemoryNote(id, b)],
    ['DELETE', /^\/api\/chats\/([\w-]+)\/memory$/, (_, [id], q) => chats.deleteMemoryNote(id, q.get('dir'), q.get('note'))],
    ['GET', /^\/api\/chats\/([\w-]+)\/diff$/, (_, [id], q) => chats.diff(id, q.get('msg'), q.get('path'))],
  ]

  return async (req, res, subpath, { authorizeApi }) => {
    try {
      const url = new URL(subpath, 'http://forge.invalid')
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return send(res, 200, fs.readFileSync(path.join(here, '../ui/index.html'), 'utf8'), 'text/html; charset=utf-8')
      }
      if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' })
      if (!authorizeApi(req)) return send(res, 401, { error: 'not authorized' })
      for (const [method, re, fn] of routes) {
        const m = url.pathname.match(re)
        if (!m || req.method !== method) continue
        let body = {}
        if (method !== 'GET' && method !== 'DELETE') {
          const chunks = []
          let size = 0
          for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(res, 413, { error: 'body too large' }); chunks.push(c) }
          body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
        }
        const out = await fn(body, m.slice(1), url.searchParams)
        return send(res, 200, out ?? { ok: true })
      }
      return send(res, 404, { error: `no route ${req.method} ${url.pathname}` })
    } catch (e) {
      return send(res, 400, { error: e?.message ?? String(e) })
    }
  }
}

const tokenOk = (got, want) => {
  const a = Buffer.from(String(got ?? '')), b = Buffer.from(want)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Standalone console on its own localhost port (token-protected). */
export async function startConsole({ registry, engine, chats, port = 3091, log = () => {} }) {
  const token = consoleToken(registry)
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
  const handle = createForgeHandler({ registry, engine, chats })
  const server = http.createServer((req, res) => {
    if (!allowedHosts.has(req.headers.host ?? '')) return send(res, 421, { error: 'host not allowed' })
    return handle(req, res, req.url ?? '/', { authorizeApi: r => tokenOk(r.headers['x-forge-token'], token) })
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  const url = `http://127.0.0.1:${port}/?token=${token}`
  log(`console at ${url}`)
  return { server, url, token, close: () => new Promise(r => server.close(() => r())) }
}
