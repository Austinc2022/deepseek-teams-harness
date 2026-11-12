/**
 * Company dashboard: host half. Serves the dashboard page and the company API under /company on the
 * DeepSeek Harness web server. Every request needs the DSH browser-session cookie; API calls also need the
 * X-Company-Request header (forces a CORS preflight that is never approved) and a same-origin Origin when sent.
 *
 * It reads and drives the main Company of this process (plugins/company) and its super agent (plugins/super-agent,
 * under /api/super/), so the page, the CLIs, the autopilot and the super agent loop all see the same state.
 *
 * Other companies (docs/COMPANIES.md) run in their own processes; their pages are the same files, served under
 * /company/c/<id>/, and their api/ calls are forwarded to that company (company/lib/fleet.js). The Companies page
 * and api/companies manage them.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from '../company/lib/boot.js'
import { handle, readJson, send } from '../company/lib/http.js'
import { boot as bootSuper } from '../super-agent/lib/boot.js'
import { handleSuper } from '../super-agent/lib/http.js'
import { Fleet } from '../company/lib/fleet.js'
import { PROFILE_ID } from '../company/lib/profile.js'

export const name = 'company-dashboard'
export const inject = ['webServer', 'connection']

const MOUNT = '/company'
const here = path.dirname(fileURLToPath(import.meta.url))

export function apply(ctx) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('company-dashboard') : null
  const log = m => (logger ? logger.info(m) : console.error(`[company-dashboard] ${m}`))
  const co = boot({ log })
  const sa = bootSuper({ log })
  const fleet = new Fleet({ main: { co, sa }, mainProfile: PROFILE_ID, log })
  ctx.effect(() => fleet.watch(), 'company-dashboard: companies')
  const PAGES = new Set(['/board.html', '/knowledge.html', '/advisory.html', '/connections.html', '/companies.html'])
  const page = (res, f) => send(res, 200, fs.readFileSync(path.join(here, 'ui', f), 'utf8'), f.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8')

  async function fleetApi(method, sub, body) {
    if (sub === '' && method === 'GET') return fleet.list()
    if (sub === '' && method === 'POST') return fleet.create(await body())
    const m = sub.match(/^\/([a-z][a-z0-9-]{1,30})(?:\/(summary|start|stop|restart|archive|log))?$/)
    if (!m) return undefined
    const [, id, act] = m
    if (act === 'summary' && method === 'GET') return fleet.summary(id)
    if (act === 'log' && method === 'GET') return { log: fleet.logTail(id, 120) }
    if (id === 'main' && act) throw new Error('the main company runs inside ./dsh web: restart that to restart it')
    if (act === 'start' && method === 'POST') { fleet.restarts.delete(id); return fleet.start(id) }
    if (act === 'stop' && method === 'POST') return fleet.stop(id)
    if (act === 'restart' && method === 'POST') return fleet.restart(id)
    if (act === 'archive' && method === 'POST') return fleet.archive(id)
    if (!act && method === 'PUT') return fleet.rename(id, (await body()).name)
    return undefined
  }

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
    let p = url.pathname.slice(MOUNT.length) || '/'
    // /company/c/<id>/...: another company (c/main/ is the main one, so links can always name a company)
    let cid = null
    const cm = p.match(/^\/c\/([a-z][a-z0-9-]{1,30})(\/.*)?$/)
    if (cm) {
      if (!cm[2]) { res.writeHead(308, { location: `${MOUNT}/c/${cm[1]}/${url.search}`, 'cache-control': 'no-store' }); return res.end() }
      p = cm[2]
      if (cm[1] !== 'main') cid = cm[1]
    }
    if (req.method === 'GET' && (p === '/' || PAGES.has(p) || p === '/switcher.js')) return page(res, p === '/' ? 'index.html' : p.slice(1))
    if (p.startsWith('/api/')) {
      if (req.headers['x-company-request'] !== '1' || !sameOrigin(req)) return send(res, 403, { error: 'forbidden' })
      if (p === '/api/companies' || p.startsWith('/api/companies/')) {
        try {
          const out = await fleetApi(req.method, p.slice('/api/companies'.length), () => readJson(req))
          return out === undefined ? send(res, 404, { error: 'not found' }) : send(res, 200, out)
        } catch (e) { return send(res, 400, { error: e?.message ?? String(e) }) }
      }
      if (cid) {
        try { fleet.entry(cid) } catch (e) { return send(res, 404, { error: e.message }) }
        return fleet.proxy(cid, req, res, p + url.search)
      }
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
