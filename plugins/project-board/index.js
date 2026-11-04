/**
 * Project board: host half.
 *
 * Projects with tasks; each task has a category and its own orchestration of
 * Agent Forge agents and workflows. Served under /project-board on the
 * DeepSeek Harness web server. Every request needs the DSH browser-session
 * cookie; API calls also need the X-Board-Request header (forces a CORS
 * preflight that is never approved) and a same-origin Origin when one is sent.
 *
 * Uses the same Agent Forge registry and engine as the other pages, so task
 * runs appear on Workflows > Runs too.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shared } from '../agent-forge/lib/shared.js'
import { Projects, STATUSES, COLORS, defaultArg } from './lib/projects.js'

export const name = 'project-board'
export const inject = ['webServer', 'connection']

const MOUNT = '/project-board'
const here = path.dirname(fileURLToPath(import.meta.url))
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'"
const KEY = Symbol.for('project-board.shared')

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

export function apply(ctx) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('project-board') : null
  const log = m => (logger ? logger.info(m) : console.error(`[project-board] ${m}`))
  const forge = shared({ log })
  const projects = (globalThis[KEY] ??= new Projects(forge))

  const sameOrigin = req => {
    const origin = req.headers.origin
    if (!origin) return true
    try { return new URL(origin).host === req.headers.host } catch { return false }
  }

  function meta() {
    const { registry } = forge
    return {
      statuses: STATUSES,
      colors: COLORS,
      agents: registry.listAgents().filter(a => !a.invalid).map(a => ({ name: a.name, description: a.description, backend: a.backend, model: a.model, tags: a.tags })),
      workflows: registry.listOrchestrations().filter(o => !o.invalid).map(o => ({ name: o.name, description: o.description, format: o.format, args: Object.fromEntries(Object.entries(o.args ?? {}).map(([k, d]) => [k, { description: typeof d === 'string' ? d : '', default: defaultArg(k) }])) })),
      teams: registry.listTeams().map(t => ({ name: t.name, members: t.members })),
      workbench: !!globalThis[Symbol.for('cli-workbench.shared')],
    }
  }

  async function api(req, res, p) {
    const m = req.method
    const body = () => readJson(req)
    let r
    if (m === 'GET' && p === '/api/meta') return meta()
    if (p === '/api/projects') {
      if (m === 'GET') return projects.list()
      if (m === 'POST') return projects.create(await body())
    }
    if ((r = p.match(/^\/api\/projects\/([a-z0-9]{6,24})$/))) {
      if (m === 'GET') return withLive(projects.get(r[1]))
      if (m === 'PUT') return projects.update(r[1], await body())
      if (m === 'DELETE') return projects.delete(r[1])
    }
    if ((r = p.match(/^\/api\/projects\/([a-z0-9]{6,24})\/tasks$/)) && m === 'POST') return projects.createTask(r[1], await body())
    if ((r = p.match(/^\/api\/projects\/([a-z0-9]{6,24})\/tasks\/([a-z0-9]{6,24})(\/[a-z]+)?$/))) {
      const [, pid, tid, action = ''] = r
      if (!action && m === 'PUT') return projects.updateTask(pid, tid, await body())
      if (!action && m === 'DELETE') return projects.deleteTask(pid, tid)
      if (action === '/run' && m === 'POST') return projects.run(pid, tid)
      if (action === '/cancel' && m === 'POST') return projects.cancel(pid, tid)
      if (action === '/workbench' && m === 'POST') {
        const wb = globalThis[Symbol.for('cli-workbench.shared')]
        if (!wb) throw new Error('the CLI workbench plugin is not loaded')
        const b = await body()
        const proj = projects.get(pid)
        const t = proj.tasks.find(x => x.id === tid)
        if (!t) throw new Error('unknown task')
        const cwd = projects.taskFolder(proj, t)
        // a task with its own worktree runs there; otherwise the workbench makes a worktree per session
        const s = wb.create({ cli: b.cli || 'claude', account: b.account || '', repo: cwd, worktree: !t.worktreePath && b.worktree !== false, title: t.title.slice(0, 60) })
        return { session: s }
      }
    }
    if ((r = p.match(/^\/api\/runs\/([\w-]{6,64})$/)) && m === 'GET') return forge.engine.getRun(r[1])
    if ((r = p.match(/^\/api\/runs\/([\w-]{6,64})\/file$/)) && m === 'GET') {
      const rel = new URL(req.url, 'http://x').searchParams.get('path') ?? ''
      if (!/^(agents|artifacts)\/[\w.\-/]+$/.test(rel) && !/^result\.(md|json)$/.test(rel)) throw new Error('bad path')
      return { text: forge.engine.readRunFile(r[1], rel) }
    }
    return undefined
  }

  /** Mark which tasks are running right now (the saved status lags until the run ends). */
  function withLive(p) {
    for (const t of p.tasks) {
      const last = t.runs?.at(-1)
      t.running = !!last && forge.engine.active.has(last.id)
      if (last?.status === 'running' && !t.running) {
        try { const st = forge.engine.getRun(last.id); last.status = st.status } catch { last.status = 'unknown' }
      }
    }
    return p
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
      if (req.headers['x-board-request'] !== '1' || !sameOrigin(req)) return send(res, 403, { error: 'forbidden' })
      try {
        const out = await api(req, res, p)
        if (out === undefined) return send(res, 404, { error: 'not found' })
        return send(res, 200, out)
      } catch (e) { return send(res, 400, { error: e?.message ?? String(e) }) }
    }
    send(res, 404, { error: 'not found' })
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: MOUNT, handler: (req, res) => {
    Promise.resolve(handler(req, res)).catch(e => { if (!res.headersSent) send(res, 500, { error: e?.message ?? String(e) }); else res.destroy() })
  } }), 'project-board: /project-board route')
  log(`Project board mounted at ${MOUNT}/`)
}
