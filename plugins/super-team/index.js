/**
 * Super team: host half.
 *
 * One supervisor agent orchestrates many Agent Forge teams (see lib/super.js). Served under /super-team on the
 * DeepSeek Harness web server. Every request needs the DSH browser-session cookie; API calls also need the
 * X-Super-Request header (forces a CORS preflight that is never approved) and a same-origin Origin when sent.
 *
 * Uses the same Agent Forge registry and engine as the other pages, so super-team runs appear on
 * Workflows > Runs too, with per-agent transcripts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shared } from '../agent-forge/lib/shared.js'
import { SuperTeams, SUPER_MODES, TEAM_MODES, DEFAULT_SUPERVISOR } from './lib/super.js'

export const name = 'super-team'
export const inject = ['webServer', 'connection']

const MOUNT = '/super-team'
const here = path.dirname(fileURLToPath(import.meta.url))
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'"
const KEY = Symbol.for('super-team.shared')
const SID = '([a-z0-9]{6,24})'

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'content-security-policy': CSP, 'referrer-policy': 'no-referrer' })
  res.end(type === 'application/json' ? JSON.stringify(body) : body)
}

async function readJson(req) {
  let n = 0
  const chunks = []
  for await (const c of req) { n += c.length; if (n > 2 * 1024 * 1024) throw new Error('body too large'); chunks.push(c) }
  const s = Buffer.concat(chunks).toString('utf8')
  return s ? JSON.parse(s) : {}
}

/** The live run state, trimmed to what the page shows. */
function runBrief(st) {
  return {
    id: st.id, status: st.status, phase: st.phase, costUsd: st.costUsd, startedAt: st.startedAt, endedAt: st.endedAt,
    error: st.error ? String(st.error).split('\n')[0] : null,
    log: (st.log ?? []).slice(-12),
    agents: (st.agents ?? []).map(a => ({ n: a.n, label: a.label, agent: a.agent, model: a.model, status: a.status, lastTool: a.lastTool, tools: a.tools, file: a.file, startedAt: a.startedAt, endedAt: a.endedAt, costUsd: a.costUsd, error: a.error })),
  }
}

export function apply(ctx) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('super-team') : null
  const log = m => (logger ? logger.info(m) : console.error(`[super-team] ${m}`))
  const forge = shared({ log })
  const supers = (globalThis[KEY] ??= new SuperTeams(forge, { log }))

  const sameOrigin = req => {
    const origin = req.headers.origin
    if (!origin) return true
    try { return new URL(origin).host === req.headers.host } catch { return false }
  }

  function meta() {
    const { registry, engine } = forge
    return {
      superModes: SUPER_MODES, teamModes: TEAM_MODES, defaultSupervisor: DEFAULT_SUPERVISOR, maxParallel: engine.maxParallel,
      agents: registry.listAgents().filter(a => !a.invalid).map(a => ({ name: a.name, description: a.description, model: a.model, backend: a.backend })),
      teams: registry.listTeams().map(t => ({ name: t.name, description: t.description, members: t.members, orchestrations: t.orchestrations ?? [] })),
      workflows: registry.listOrchestrations().filter(o => !o.invalid).map(o => ({ name: o.name, description: o.description, args: Object.keys(o.args ?? {}) })),
    }
  }

  async function api(req, p) {
    const m = req.method
    const body = () => readJson(req)
    let r
    if (m === 'GET' && p === '/api/meta') return meta()
    if (p === '/api/chats') {
      if (m === 'GET') return supers.list()
      if (m === 'POST') return supers.create(await body())
    }
    if (p === '/api/projects') {
      if (m === 'GET') return supers.listProjects()
      if (m === 'POST') return supers.createProject(await body())
    }
    if ((r = p.match(new RegExp(`^/api/projects/${SID}$`)))) {
      if (m === 'PUT') return supers.updateProject(r[1], await body())
      if (m === 'DELETE') return supers.deleteProject(r[1], { deleteChats: new URL(req.url, 'http://x').searchParams.get('deleteChats') === '1' })
    }
    if ((r = p.match(new RegExp(`^/api/chats/${SID}$`)))) {
      if (m === 'GET') {
        const s = supers.get(r[1])
        const last = s.messages.filter(x => x.runId).at(-1)
        if (last) { try { s.run = runBrief(forge.engine.getRun(last.runId)) } catch {} }
        return s
      }
      if (m === 'PUT') return supers.update(r[1], await body())
      if (m === 'DELETE') return supers.delete(r[1])
    }
    if ((r = p.match(new RegExp(`^/api/chats/${SID}/(post|cancel|clear|duplicate)$`))) && m === 'POST') {
      const [, id, action] = r
      if (action === 'post') return supers.post(id, (await body()).text)
      if (action === 'cancel') return supers.cancel(id)
      if (action === 'clear') return supers.clear(id)
      if (action === 'duplicate') return supers.duplicate(id)
    }
    if ((r = p.match(/^\/api\/runs\/([\w-]{6,64})$/)) && m === 'GET') return runBrief(forge.engine.getRun(r[1]))
    if ((r = p.match(/^\/api\/runs\/([\w-]{6,64})\/file$/)) && m === 'GET') {
      const rel = new URL(req.url, 'http://x').searchParams.get('path') ?? ''
      if (!/^(agents|artifacts)\/[\w.\-/]+$/.test(rel) && !/^result\.(md|json)$/.test(rel)) throw new Error('bad path')
      return { text: forge.engine.readRunFile(r[1], rel) }
    }
    return undefined
  }

  const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://dsh.invalid')
    if (url.pathname === MOUNT) {
      res.writeHead(308, { location: `${MOUNT}/${url.search}`, 'cache-control': 'no-store' })
      return res.end()
    }
    if (!ctx.connection.authorizeIndex(req, res)) return
    const p = url.pathname.slice(MOUNT.length) || '/'
    if (p === '/' && req.method === 'GET') return send(res, 200, fs.readFileSync(path.join(here, 'ui/index.html'), 'utf8'), 'text/html; charset=utf-8')
    if (p.startsWith('/api/')) {
      if (req.headers['x-super-request'] !== '1' || !sameOrigin(req)) return send(res, 403, { error: 'forbidden' })
      try {
        const out = await api(req, p)
        if (out === undefined) return send(res, 404, { error: 'not found' })
        return send(res, 200, out)
      } catch (e) { return send(res, 400, { error: e?.message ?? String(e) }) }
    }
    send(res, 404, { error: 'not found' })
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: MOUNT, handler: (req, res) => {
    Promise.resolve(handler(req, res)).catch(e => { if (!res.headersSent) send(res, 500, { error: e?.message ?? String(e) }); else res.destroy() })
  } }), 'super-team: /super-team route')
  log(`Super team mounted at ${MOUNT}/`)
}
