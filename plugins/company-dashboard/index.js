/**
 * Company dashboard: host half. Serves the dashboard page and the company API under /company on the
 * DeepSeek Harness web server. Every request needs the DSH browser-session cookie; API calls also need the
 * X-Company-Request header (forces a CORS preflight that is never approved) and a same-origin Origin when sent.
 *
 * It reads and drives the one Company of this process (plugins/company) and its super agent (plugins/super-agent,
 * under /api/super/), so the page, the CLIs, the autopilot and the super agent loop all see the same state.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from '../company/lib/boot.js'
import { handle, readJson, send } from '../company/lib/http.js'
import { boot as bootSuper } from '../super-agent/lib/boot.js'
import { handleSuper } from '../super-agent/lib/http.js'

export const name = 'company-dashboard'
export const inject = ['webServer', 'connection']

const MOUNT = '/company'
const here = path.dirname(fileURLToPath(import.meta.url))

export function apply(ctx) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('company-dashboard') : null
  const log = m => (logger ? logger.info(m) : console.error(`[company-dashboard] ${m}`))
  const co = boot({ log })
  const sa = bootSuper({ log })

  const sameOrigin = req => {
    const origin = req.headers.origin
    if (!origin) return true
    try { return new URL(origin).host === req.headers.host } catch { return false }
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
    if (p === '/board.html' && req.method === 'GET') return send(res, 200, fs.readFileSync(path.join(here, 'ui/board.html'), 'utf8'), 'text/html; charset=utf-8')
    if (p === '/knowledge.html' && req.method === 'GET') return send(res, 200, fs.readFileSync(path.join(here, 'ui/knowledge.html'), 'utf8'), 'text/html; charset=utf-8')
    if ((p === '/advisory.html' || p === '/connections.html') && req.method === 'GET') return send(res, 200, fs.readFileSync(path.join(here, 'ui', p.slice(1)), 'utf8'), 'text/html; charset=utf-8')
    if (p.startsWith('/api/')) {
      if (req.headers['x-company-request'] !== '1' || !sameOrigin(req)) return send(res, 403, { error: 'forbidden' })
      try {
        const out = p.startsWith('/api/super/') ? await handleSuper(sa, req.method, p, () => readJson(req), url.searchParams) : await handle(co, req.method, p, () => readJson(req), url.searchParams)
        if (out === undefined) return send(res, 404, { error: 'not found' })
        return send(res, 200, out)
      } catch (e) { return send(res, 400, { error: e?.message ?? String(e) }) }
    }
    send(res, 404, { error: 'not found' })
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: MOUNT, handler: (req, res) => {
    Promise.resolve(handler(req, res)).catch(e => { if (!res.headersSent) send(res, 500, { error: e?.message ?? String(e) }); else res.destroy() })
  } }), 'company-dashboard: /company route')
  log(`Company dashboard mounted at ${MOUNT}/`)
}
