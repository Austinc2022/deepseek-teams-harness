/**
 * Agent Forge web pages: host half.
 *
 * Serves the Agent Forge console under /forge on the DeepSeek Harness web
 * server itself, so it shares the DSH origin and login. Every request (page and
 * API) must carry the DSH browser-session cookie, checked by DSH's own
 * Connection service. API calls additionally need the X-Forge-Request header
 * (forces a CORS preflight that is never approved) and, when the browser sends
 * an Origin, it must match the Host.
 *
 * The browser half (lib/client.js) adds the sidebar pages that embed /forge/.
 */
import { shared } from '../agent-forge/lib/shared.js'
import { createForgeHandler, send } from '../agent-forge/lib/server.js'

export const name = 'agent-forge-web'
export const inject = ['webServer', 'connection']

const MOUNT = '/forge'

export function apply(ctx) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('agent-forge-web') : null
  const log = m => (logger ? logger.info(m) : console.error(`[agent-forge-web] ${m}`))
  const services = shared({ log })
  const handle = createForgeHandler(services)

  const sameOrigin = req => {
    const origin = req.headers.origin
    if (!origin) return true
    try { return new URL(origin).host === req.headers.host } catch { return false }
  }

  const handler = (req, res) => {
    const url = new URL(req.url ?? '/', 'http://dsh.invalid')
    if (url.pathname === MOUNT) {
      res.writeHead(308, { location: `${MOUNT}/${url.search}`, 'cache-control': 'no-store' })
      res.end()
      return
    }
    // DSH browser-session cookie; writes DSH's own 401 when missing or invalid.
    if (!ctx.connection.authorizeIndex(req, res)) return
    const subpath = url.pathname.slice(MOUNT.length) + url.search
    return handle(req, res, subpath, {
      authorizeApi: r => r.headers['x-forge-request'] === '1' && sameOrigin(r),
    })
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: MOUNT, handler: (req, res) => {
    Promise.resolve(handler(req, res)).catch(e => { if (!res.headersSent) send(res, 500, { error: e?.message ?? String(e) }); else res.destroy() })
  } }), 'agent-forge-web: /forge route')
  log(`Agent Forge pages mounted at ${MOUNT}/ on the web UI server`)
}
