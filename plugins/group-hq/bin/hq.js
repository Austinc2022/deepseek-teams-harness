#!/usr/bin/env node
/**
 * Group headquarters CLI (works without the harness running; docs/GROUP.md).
 *
 *   hq serve [--port 3096]             the HQ page on localhost (token link), the listener and the timers
 *   hq status                          companies, listener, directives
 *   hq invite "<who it is for>" [--days 7]   a one-time invite code (shown once)
 *   hq listen on|off [--host 0.0.0.0] [--port 3095] [--cert f --key f]
 *   hq name "<name>"
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { boot } from '../lib/boot.js'
import { handle, readJson, send } from '../lib/http.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flags = {}
const pos = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const n = argv[i + 1]; if (n !== undefined && !n.startsWith('--')) { flags[k] = n; i++ } else flags[k] = true } else pos.push(argv[i])
}
const b = boot({ log: m => console.error(`[hq] ${m}`) })

async function serve() {
  const stop = b.start()
  const port = Number(flags.port ?? 3096)
  const tokenFile = path.join(b.hq.dir, 'console-token')
  if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile, crypto.randomBytes(24).toString('hex'), { mode: 0o600 })
  const token = fs.readFileSync(tokenFile, 'utf8').trim()
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const cookie = (req.headers.cookie ?? '').split(';').map(x => x.trim()).find(x => x.startsWith('hq='))?.slice(3)
      if (url.searchParams.get('token') === token) { res.writeHead(302, { 'set-cookie': `hq=${token}; HttpOnly; SameSite=Strict; Path=/`, location: '/' }); return res.end() }
      if (cookie !== token) return send(res, 401, 'Open the link with ?token=... printed by "hq-cli serve".', 'text/plain; charset=utf-8')
      if (url.pathname === '/' && req.method === 'GET') return send(res, 200, fs.readFileSync(path.join(here, '../ui/index.html'), 'utf8'), 'text/html; charset=utf-8')
      if (url.pathname.startsWith('/api/')) {
        if (req.headers['x-hq-request'] !== '1') return send(res, 403, { error: 'forbidden' })
        const out = await handle(b, req.method, url.pathname, () => readJson(req))
        return out === undefined ? send(res, 404, { error: 'not found' }) : send(res, 200, out)
      }
      send(res, 404, { error: 'not found' })
    } catch (e) { if (!res.headersSent) send(res, 400, { error: e.message }) }
  })
  server.listen(port, '127.0.0.1', () => console.log(`Headquarters page: http://127.0.0.1:${port}/?token=${token}`))
  const quit = () => { stop(); server.close(); process.exit(0) }
  process.on('SIGINT', quit); process.on('SIGTERM', quit)
}

async function main() {
  const cmd = pos[0]
  if (cmd === 'serve') return serve()
  if (cmd === 'status') {
    const o = b.hq.overview()
    console.log(`${o.settings.name}: listener ${o.settings.listen.enabled ? `on ${o.settings.listen.host}:${o.settings.listen.port}` : 'off'}; HQ spend today $${o.spentTodayUsd}`)
    for (const c of o.companies) console.log(`- ${c.id} ${c.name} (${c.status}${c.online ? ', online' : ', offline'}, authority ${c.authority}) score ${c.summary?.kpis?.companyScore ?? '?'}, goal ${c.summary?.progress?.percent ?? '?'}%, last seen ${c.lastSeenAt}`)
    console.log(`Open directives: ${o.portfolio.openDirectives}; invites open: ${o.invites.filter(i => i.status === 'open').length}`)
    return
  }
  if (cmd === 'invite') {
    const inv = b.hq.createInvite({ label: pos[1] ?? 'company', days: flags.days })
    const l = b.hq.read().listen
    console.log(`Invite for "${inv.label}" (expires ${inv.expiresAt.slice(0, 10)}, works once):\n\n  ${inv.code}\n\nThe company's owner enters it on their Company page under Connections, with this headquarters' address: ${l.tls.cert ? 'https' : 'http'}://<this computer>:${l.port}${l.enabled ? '' : '\n(The listener is off: run "hq-cli listen on" or switch it on in Settings.)'}`)
    return
  }
  if (cmd === 'listen') {
    const listen = { enabled: pos[1] === 'on' }
    if (flags.host) listen.host = flags.host
    if (flags.port) listen.port = Number(flags.port)
    if (flags.cert || flags.key) listen.tls = { cert: flags.cert ?? '', key: flags.key ?? '' }
    const s = b.hq.setSettings({ listen })
    console.log(`Listener ${s.listen.enabled ? `on ${s.listen.host}:${s.listen.port}${s.listen.tls.cert ? ' (https)' : ''}` : 'off'}. It starts with "hq-cli serve" or the DSH web UI.`)
    return
  }
  if (cmd === 'name') { console.log(b.hq.setSettings({ name: pos.slice(1).join(' ') }).name); return }
  console.error('usage: hq-cli serve [--port N] | status | invite "<for>" [--days N] | listen on|off [--host H] [--port N] [--cert F --key F] | name "<name>"')
  process.exit(1)
}
main().catch(e => { console.error(e.message); process.exit(1) })
