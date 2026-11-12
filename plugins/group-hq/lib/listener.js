/**
 * The headquarters' public endpoint: the only thing companies talk to (docs/GROUP.md).
 *
 *   POST /v1/join    { code, company }            -> { companyId, key, hq, policies }    (one-time invite code)
 *   POST /v1/sync    { snapshot, responses, known } -> { directives, policies, hq }       (Bearer <id>.<key>)
 *   POST /v1/leave   {}                            -> { ok }                              (Bearer <id>.<key>)
 *   GET  /v1/health                                -> { ok, name }
 *
 * It is a separate server from the DSH web UI (which stays on localhost behind its login), on its own port, off
 * until the owner switches it on. Use https (cert and key files) or a private network (LAN, VPN, Tailscale):
 * over plain http on the internet the company keys travel in clear.
 */
import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import { httpError } from './hq.js'

const MAX_BODY = 1024 * 1024

export class Listener {
  constructor(hq, { log = () => {} } = {}) { this.hq = hq; this.log = log; this.server = null; this.sig = null; this.hits = new Map() }

  /** Start, restart or stop to match the settings. Safe to call often. */
  apply() {
    const { listen } = this.hq.read()
    const sig = JSON.stringify(listen)
    if (sig === this.sig) return this.state()
    this.stop()
    this.sig = sig
    if (!listen.enabled) { this.hq.listenerState = { running: false, note: 'off' }; return this.state() }
    let server
    try {
      const tls = listen.tls?.cert && listen.tls?.key
      server = tls ? https.createServer({ cert: fs.readFileSync(listen.tls.cert), key: fs.readFileSync(listen.tls.key) }, (q, r) => this.#handle(q, r)) : http.createServer((q, r) => this.#handle(q, r))
      server.requestTimeout = 30_000
      server.headersTimeout = 15_000
      server.on('error', e => { this.hq.listenerState = { running: false, error: e.message }; this.log(`listener: ${e.message}`) })
      server.listen(listen.port, listen.host, () => {
        this.hq.listenerState = { running: true, host: listen.host, port: listen.port, tls: !!tls, since: new Date().toISOString() }
        this.log(`headquarters listening on ${tls ? 'https' : 'http'}://${listen.host}:${listen.port}`)
      })
      this.server = server
    } catch (e) { this.hq.listenerState = { running: false, error: e.message }; this.log(`listener: ${e.message}`) }
    return this.state()
  }
  stop() { if (this.server) { try { this.server.close() } catch {} this.server = null } this.sig = null; this.hq.listenerState = { running: false, note: 'stopped' } }
  state() { return this.hq.listenerState ?? { running: false } }

  /** At most 60 requests a minute per address, and 10 join attempts an hour. */
  #limited(ip, join) {
    const k = `${join ? 'j' : 'r'}:${ip}`
    const win = join ? 3600_000 : 60_000
    const max = join ? 10 : 60
    const h = (this.hits.get(k) ?? []).filter(t => Date.now() - t < win)
    h.push(Date.now())
    this.hits.set(k, h)
    if (this.hits.size > 5000) this.hits.clear()
    return h.length > max
  }

  async #handle(req, res) {
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(body)) }
    const ip = req.socket.remoteAddress ?? ''
    try {
      const url = new URL(req.url ?? '/', 'http://hq.invalid')
      if (req.method === 'GET' && url.pathname === '/v1/health') return send(200, { ok: true, name: this.hq.read().name })
      if (req.method !== 'POST' || !url.pathname.startsWith('/v1/')) throw httpError(404, 'not found')
      const route = url.pathname.slice(4)
      if (this.#limited(ip, route === 'join')) throw httpError(429, 'too many requests')
      const body = await readBody(req)
      if (route === 'join') return send(200, this.hq.join(body, ip))
      const company = this.hq.authenticate(req.headers.authorization)
      if (route === 'sync') return send(200, this.hq.sync(company, body, ip))
      if (route === 'leave') return send(200, this.hq.leave(company))
      throw httpError(404, 'not found')
    } catch (e) {
      send(e.status ?? 400, { error: e.status ? e.message : `bad request: ${e.message}` })
    }
  }
}

async function readBody(req) {
  let n = 0
  const chunks = []
  for await (const c of req) { n += c.length; if (n > MAX_BODY) throw httpError(413, 'body too large'); chunks.push(c) }
  const s = Buffer.concat(chunks).toString('utf8')
  try { return s ? JSON.parse(s) : {} } catch { throw httpError(400, 'body is not JSON') }
}
