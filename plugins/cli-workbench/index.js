/**
 * CLI Workbench: host half.
 *
 * Serves a page of interactive Claude Code / Codex / OpenCode terminals under
 * /workbench on the DeepSeek Harness web server. Every request needs the DSH
 * browser-session cookie (DSH's own Connection service). API calls also need
 * the X-Workbench-Request header (forces a CORS preflight that is never
 * approved) and, when the browser sends an Origin, it must match the Host.
 *
 * The browser half (lib/client.js) adds the sidebar page that embeds /workbench/.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Workbench } from './lib/sessions.js'

export const name = 'cli-workbench'
export const inject = ['webServer', 'connection']

const MOUNT = '/workbench'
const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'"
const STATIC = {
  '/static/xterm.js': [() => require.resolve('@xterm/xterm/lib/xterm.js'), 'text/javascript'],
  '/static/xterm.css': [() => require.resolve('@xterm/xterm/css/xterm.css'), 'text/css'],
  '/static/addon-fit.js': [() => require.resolve('@xterm/addon-fit/lib/addon-fit.js'), 'text/javascript'],
}
const KEY = Symbol.for('cli-workbench.shared')

function forgeHome() {
  return path.resolve(process.env.AGENT_FORGE_HOME ?? path.join(here, '../../forge'))
}

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'content-security-policy': CSP, 'referrer-policy': 'no-referrer' })
  res.end(type === 'application/json' ? JSON.stringify(body) : body)
}

async function readJson(req) {
  let n = 0
  const chunks = []
  for await (const c of req) { n += c.length; if (n > 1024 * 1024) throw new Error('body too large'); chunks.push(c) }
  const s = Buffer.concat(chunks).toString('utf8')
  return s ? JSON.parse(s) : {}
}

export function apply(ctx) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('cli-workbench') : null
  const log = m => (logger ? logger.info(m) : console.error(`[cli-workbench] ${m}`))
  const wb = (globalThis[KEY] ??= new Workbench(forgeHome()))

  const sameOrigin = req => {
    const origin = req.headers.origin
    if (!origin) return true
    try { return new URL(origin).host === req.headers.host } catch { return false }
  }

  function stream(req, res, id) {
    res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-accel-buffering': 'no' })
    res.flushHeaders?.()
    const out = m => { try { res.write(`${JSON.stringify(m)}\n`) } catch {} }
    const off = wb.attach(id, out)
    const ping = setInterval(() => out({ t: 'p' }), 20000)
    const end = () => { clearInterval(ping); off() }
    req.on('close', end)
    res.on('close', end)
  }

  async function api(req, res, p, url) {
    const m = req.method
    let r
    if (m === 'GET' && p === '/api/state') return send(res, 200, { clis: wb.status(), ...wb.list() })
    if (m === 'POST' && p === '/api/sessions') {
      const b = await readJson(req)
      const count = Math.max(1, Math.min(32, Number(b.count) || 1))
      const accounts = wb.pickAccounts(b.cli, b.account ?? '', count)
      const made = []
      try {
        for (let i = 0; i < count; i++) made.push(wb.create({ ...b, account: accounts[i], login: false, title: count > 1 && b.title ? `${b.title} ${i + 1}` : b.title }))
      } catch (e) {
        if (!made.length) throw e
        return send(res, 200, { sessions: made, error: `started ${made.length} of ${count}: ${e.message}` })
      }
      return send(res, 200, { sessions: made })
    }
    if (m === 'POST' && p === '/api/accounts') return send(res, 200, wb.addAccount(await readJson(req)))
    if ((r = p.match(/^\/api\/accounts\/([a-z0-9-]{1,48})(\/login)?$/))) {
      if (m === 'DELETE' && !r[2]) return send(res, 200, wb.removeAccount(r[1]))
      if (m === 'POST' && r[2]) return send(res, 200, { session: wb.login(r[1]) })
    }
    if ((r = p.match(/^\/api\/sessions\/([a-z0-9]{6,24})(\/[a-z]+)?$/))) {
      const [, id, action = ''] = r
      if (m === 'GET' && action === '/stream') return stream(req, res, id)
      if (m === 'GET' && action === '/changes') return send(res, 200, wb.changes(id))
      if (m === 'DELETE' && !action) return send(res, 200, wb.close(id, { removeWorktree: url.searchParams.get('remove') === '1', force: url.searchParams.get('force') === '1' }))
      if (m === 'POST') {
        const b = await readJson(req)
        if (action === '/input') { wb.input(id, b.data); return send(res, 200, { ok: true }) }
        if (action === '/resize') { wb.resize(id, b.cols, b.rows); return send(res, 200, { ok: true }) }
        if (action === '/start') return send(res, 200, wb.start(id, { resume: !!b.resume }))
        if (action === '/restart') return send(res, 200, await wb.restart(id))
        if (action === '/stop') { wb.stop(id); return send(res, 200, { ok: true }) }
        if (action === '/rename') return send(res, 200, wb.rename(id, b.title))
      }
    }
    send(res, 404, { error: 'not found' })
  }

  const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://dsh.invalid')
    if (url.pathname === MOUNT) {
      res.writeHead(308, { location: `${MOUNT}/${url.search}`, 'cache-control': 'no-store' })
      return res.end()
    }
    // DSH browser-session cookie; writes DSH's own 401 when missing or invalid.
    if (!ctx.connection.authorizeIndex(req, res)) return
    const p = url.pathname.slice(MOUNT.length) || '/'
    if (p === '/' && req.method === 'GET') return send(res, 200, fs.readFileSync(path.join(here, 'ui/index.html'), 'utf8'), 'text/html; charset=utf-8')
    if (STATIC[p] && req.method === 'GET') return send(res, 200, fs.readFileSync(STATIC[p][0]()), STATIC[p][1])
    if (p.startsWith('/api/')) {
      if (req.headers['x-workbench-request'] !== '1' || !sameOrigin(req)) return send(res, 403, { error: 'forbidden' })
      try { return await api(req, res, p, url) } catch (e) { if (!res.headersSent) return send(res, 400, { error: e?.message ?? String(e) }) }
      return
    }
    send(res, 404, { error: 'not found' })
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: MOUNT, handler: (req, res) => {
    Promise.resolve(handler(req, res)).catch(e => { if (!res.headersSent) send(res, 500, { error: e?.message ?? String(e) }); else res.destroy() })
  } }), 'cli-workbench: /workbench route')
  log(`CLI Workbench mounted at ${MOUNT}/`)
}
