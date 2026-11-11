#!/usr/bin/env node
/**
 * Company CLI (works without the harness running).
 *   company setup [--force]        create the CEO, leads, HR, teams, departments (safe to repeat)
 *   company status                 charter, budget, org, initiatives, open decisions
 *   company cycle ["focus"]        run one CEO cycle now and wait for it
 *   company decide <id> <choice>   answer a decision
 *   company autopilot on|off [hours]
 *   company serve [--port 3093]    the dashboard on its own port (no harness needed)
 *   company profile [id]           show the active profile and the available ones, or select one (restart to apply)
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { boot } from '../lib/boot.js'
import { handle, readJson, send } from '../lib/http.js'
import { PROFILE_ID, listProfiles, selectProfile } from '../lib/profile.js'
import { boot as bootSuper } from '../../super-agent/lib/boot.js'
import { handleSuper } from '../../super-agent/lib/http.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const [cmd, ...rest] = process.argv.slice(2)
const co = boot({ log: m => console.error(`[company] ${m}`) })
const money = n => (n == null ? '?' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`)

function status() {
  const o = co.overview()
  const out = [
    `Profile: ${o.profile.id} (${o.profile.label}); models on ${o.profile.provider}; project folder ${o.profile.projectDir}`,
    `Mission: ${o.charter.mission}`,
    `Budget ${o.budget.date}: spent ${money(o.budget.spentTodayUsd)} of ${money(o.budget.dailyUsd)}${o.profile.metering === 'balance' ? `; ${o.profile.provider} balance ${money(o.budget.balanceUsd)}` : ' (estimated from run costs)'}; autopilot ${o.charter.autopilot.enabled ? `on, every ${o.charter.autopilot.everyHours} h` : 'off'}`,
    '', 'Organisation:', `  CEO ${o.ceo?.name ?? '(not set up)'}  auditor ${o.auditor?.name ?? '-'} (${o.auditor?.model ?? '-'})`,
    ...o.departments.map(d => `  ${d.name} — lead ${d.lead}\n${d.teams.map(t => `      ${t.name}: ${t.members.map(m => `${m.name} (${m.model})`).join(', ')}`).join('\n')}`),
    '', 'Initiatives:', ...(o.initiatives.length ? o.initiatives.map(i => `  ${i.id} [${i.stage}] ${i.title}  confidence ${i.confidence ?? '-'}`) : ['  (none)']),
    '', 'Open decisions:', ...(o.decisions.filter(d => d.status === 'open').map(d => `  ${d.id} ${d.question}\n      options: ${d.options.join(' | ')}; recommended: ${d.recommendation}`)),
    '', 'Last cycles:', ...o.cycles.slice(0, 5).map(c => `  ${c.id} ${c.status} ${c.startedAt.slice(0, 16)} spend ${money(c.spendUsd)} ${c.report ?? ''}`),
  ]
  console.log(out.join('\n'))
}

async function serve() {
  const i = rest.indexOf('--port')
  const port = i >= 0 ? Number(rest[i + 1]) : 3093
  const tokenFile = path.join(co.dir, 'console-token')
  if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile, crypto.randomBytes(24).toString('hex'), { mode: 0o600 })
  const token = fs.readFileSync(tokenFile, 'utf8').trim()
  const page = path.resolve(here, '../../company-dashboard/ui/index.html')
  const sa = bootSuper({ log: m => console.error(`[super-agent] ${m}`) })
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x')
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host ?? '')) return send(res, 403, { error: 'forbidden' })
      const cookie = (req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith('company='))?.slice(8)
      if (url.searchParams.get('token') === token) {
        res.writeHead(302, { 'set-cookie': `company=${token}; HttpOnly; SameSite=Strict; Path=/`, location: '/' })
        return res.end()
      }
      if (cookie !== token) return send(res, 401, 'Open the link with ?token=... printed by "company-cli serve".', 'text/plain; charset=utf-8')
      if (url.pathname === '/' && req.method === 'GET') return send(res, 200, fs.readFileSync(page, 'utf8'), 'text/html; charset=utf-8')
      if (url.pathname.startsWith('/api/')) {
        if (req.headers['x-company-request'] !== '1') return send(res, 403, { error: 'forbidden' })
        const out = url.pathname.startsWith('/api/super/') ? await handleSuper(sa, req.method, url.pathname, () => readJson(req), url.searchParams) : await handle(co, req.method, url.pathname, () => readJson(req), url.searchParams)
        return out === undefined ? send(res, 404, { error: 'not found' }) : send(res, 200, out)
      }
      send(res, 404, { error: 'not found' })
    } catch (e) { if (!res.headersSent) send(res, 400, { error: e?.message ?? String(e) }) }
  })
  server.listen(port, '127.0.0.1', () => console.log(`Company dashboard: http://127.0.0.1:${port}/?token=${token}`))
  co.schedule()
  sa.start() // the super agent loop runs here unless another process (./dsh web) already runs it
  return new Promise(() => {})
}

async function main() {
  if (cmd === 'setup') {
    console.log(JSON.stringify(co.setup({ force: rest.includes('--force') }), null, 2))
    await co.meter('setup')
    return
  }
  if (cmd === 'status' || !cmd) { await co.meter('status'); return status() }
  if (cmd === 'cycle') {
    const { cycleId, runId, done } = await co.startCycle({ trigger: 'cli', focus: rest.join(' ') || undefined })
    console.error(`cycle ${cycleId} started (run ${runId})`)
    process.on('SIGINT', () => co.cancel())
    let last = 0
    const t = setInterval(() => {
      try {
        const st = co.forge.engine.getRun(runId)
        for (const l of (st.log ?? []).slice(last)) console.error(`  ${l.ts.slice(11, 19)} ${l.msg}`)
        last = (st.log ?? []).length
      } catch {}
    }, 3000)
    const st = await done
    clearInterval(t)
    console.log(JSON.stringify({ status: st?.status, error: st?.error ? String(st.error).split('\n')[0] : undefined, result: st?.result }, null, 2))
    return
  }
  if (cmd === 'decide') { console.log(JSON.stringify(co.answer(rest[0], { choice: rest.slice(1).join(' ') }), null, 2)); return }
  if (cmd === 'autopilot') {
    console.log(JSON.stringify(co.updateCharter({ autopilot: { enabled: rest[0] === 'on', ...(rest[1] ? { everyHours: Number(rest[1]) } : {}) } }).autopilot))
    return
  }
  if (cmd === 'serve') return serve()
  if (cmd === 'profile') {
    if (!rest[0]) { console.log(`active: ${PROFILE_ID}\navailable: ${listProfiles().join(', ')}`); return }
    if (!listProfiles().includes(rest[0])) throw new Error(`no profile ${rest[0]} (available: ${listProfiles().join(', ')})`)
    selectProfile(rest[0])
    console.log(`selected ${rest[0]}. Restart ./dsh web (or the CLI), then run ./company-cli setup and ./super-cli setup.`)
    return
  }
  console.error('usage: company-cli profile [id]|setup|status|cycle ["focus"]|decide <id> <choice>|autopilot on|off [hours]|serve [--port N]')
  process.exit(2)
}
main().then(() => process.exit(0), e => { console.error(`error: ${e.message}`); process.exit(1) })
