/**
 * Group headquarters: host half (docs/GROUP.md). Serves the HQ page and the owner's API under /hq on the DSH web
 * server (DSH login required; API calls also need the X-HQ-Request header and a same-origin Origin), and runs the
 * public listener that companies connect to (its own port, off until the owner switches it on), the group CEO and
 * the review team.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from './lib/boot.js'
import { handle, readJson, send } from './lib/http.js'

export const name = 'group-hq'
export const inject = ['webServer', 'connection']

const MOUNT = '/hq'
const here = path.dirname(fileURLToPath(import.meta.url))

export function apply(ctx) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('group-hq') : null
  const log = m => (logger ? logger.info(m) : console.error(`[group-hq] ${m}`))
  const b = boot({ log })
  ctx.effect(() => b.start(), 'group-hq: listener and timer')

  const sameOrigin = req => {
    const origin = req.headers.origin
    if (!origin) return true
    try { return new URL(origin).host === req.headers.host } catch { return false }
  }
  const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://dsh.invalid')
    if (url.pathname === MOUNT) { res.writeHead(308, { location: `${MOUNT}/${url.search}`, 'cache-control': 'no-store' }); return res.end() }
    if (!ctx.connection.authorizeIndex(req, res)) return
    const p = url.pathname.slice(MOUNT.length) || '/'
    if (p === '/' && req.method === 'GET') return send(res, 200, fs.readFileSync(path.join(here, 'ui/index.html'), 'utf8'), 'text/html; charset=utf-8')
    if (p.startsWith('/api/')) {
      if (req.headers['x-hq-request'] !== '1' || !sameOrigin(req)) return send(res, 403, { error: 'forbidden' })
      try {
        const out = await handle(b, req.method, p, () => readJson(req))
        if (out === undefined) return send(res, 404, { error: 'not found' })
        return send(res, 200, out)
      } catch (e) { return send(res, 400, { error: e?.message ?? String(e) }) }
    }
    send(res, 404, { error: 'not found' })
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: MOUNT, handler: (req, res) => {
    Promise.resolve(handler(req, res)).catch(e => { if (!res.headersSent) send(res, 500, { error: e?.message ?? String(e) }); else res.destroy() })
  } }), 'group-hq: /hq route')
  const s = b.hq.read()
  log(`Headquarters "${s.name}" mounted at ${MOUNT}/; ${s.companies.filter(c => c.status === 'active').length} active compan${s.companies.filter(c => c.status === 'active').length === 1 ? 'y' : 'ies'}; listener ${s.listen.enabled ? `on ${s.listen.host}:${s.listen.port}` : 'off'}`)
}
