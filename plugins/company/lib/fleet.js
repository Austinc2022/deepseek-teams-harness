/**
 * Many companies on one machine (docs/COMPANIES.md).
 *
 * A company is a forge home: its own agents, teams, super teams, super agents, memory, knowledge, charter, budget,
 * advisory team and headquarters link. The main company is <repo>/forge and runs inside ./dsh web, as before.
 * Every other company lives in <repo>/companies/<id>/ and runs as its own `company-cli serve` process on a private
 * 127.0.0.1 port, so nothing (the profile, the loop, the budget, the org) is shared between companies. The portal
 * serves the same dashboard pages for each company under /company/c/<id>/ and forwards their api/ calls to it.
 *
 * Company processes are detached: restarting ./dsh web does not stop them, and the next portal adopts them. While
 * the portal runs it restarts a company that died (backoff, then it gives up and shows the error).
 */
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { REPO, MAIN_HOME, COMPANIES_DIR } from '../../agent-forge/lib/isolation.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const BIN = path.resolve(here, '../bin/company.js')
const SUPER_BIN = path.resolve(here, '../../super-agent/bin/super.js')
const PROFILES = path.resolve(here, '../profiles')
const STATE = path.join(MAIN_HOME, 'company', 'companies.json')
const ID = /^[a-z][a-z0-9-]{1,30}$/
const RESERVED = new Set(['main', 'api', 'c', 'new', 'archive'])
const FIRST_PORT = 3201
const OPUS = 'claude-opus-5-5'
const nowIso = () => new Date().toISOString()

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
const writeJson = (f, v, mode) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(v, null, 2), mode ? { mode } : undefined); fs.renameSync(t, f) }
/** A company process leads its own process group (spawned detached), and its agent sessions run in it. */
const groupAlive = pid => { if (!pid) return false; try { process.kill(-pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
async function killGroup(pid, waitMs = 10_000) {
  if (!groupAlive(pid)) return
  try { process.kill(-pid, 'SIGTERM') } catch {}
  const until = Date.now() + waitMs
  while (groupAlive(pid) && Date.now() < until) await new Promise(r => setTimeout(r, 250))
  if (groupAlive(pid)) try { process.kill(-pid, 'SIGKILL') } catch {}
}
const alive = pid => { if (!pid) return false; try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
const slug = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '').slice(0, 30).replace(/-+$/, '')

/** The profiles a company can be built from; `singleton` ones may be used by one company only. */
export function profiles() {
  return fs.readdirSync(PROFILES).filter(f => f.endsWith('.js')).map(f => {
    const src = fs.readFileSync(path.join(PROFILES, f), 'utf8')
    const label = src.match(/\blabel:\s*'([^']+)'/)?.[1] ?? f.slice(0, -3)
    return { id: f.slice(0, -3), label, singleton: /^\s*singleton:\s*true\b/m.test(src) }
  }).sort((a, b) => a.id.localeCompare(b.id))
}

const freePort = port => new Promise(resolve => {
  const s = net.createServer()
  s.once('error', () => resolve(false))
  s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)))
})

/** One HTTP call to a company process (used by the proxy and by the summaries). */
function call(c, method, p, { body, headers = {}, timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: c.port, path: p, method, headers: { ...companyHeaders(c), ...headers }, timeout: timeoutMs }, res => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', d => { data += d; if (data.length > 8_000_000) req.destroy(new Error('response too large')) })
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(data) }) } catch { resolve({ status: res.statusCode, text: data }) } })
    })
    req.on('timeout', () => req.destroy(new Error('the company did not answer in time')))
    req.on('error', reject)
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body))
    req.end()
  })
}
function companyHeaders(c) {
  let token = ''
  try { token = fs.readFileSync(path.join(c.home, 'company', 'console-token'), 'utf8').trim() } catch {}
  return { host: `127.0.0.1:${c.port}`, cookie: `company=${token}`, 'x-company-request': '1' }
}

export class Fleet {
  /**
   * @param {object} main  { co, sa } of the main company (this process), for its row and summary
   */
  constructor({ main, mainProfile, log = () => {} } = {}) {
    this.main = main
    this.mainProfile = mainProfile
    this.log = log
    this.restarts = new Map() // id -> [timestamps]
    this.busy = new Set()
  }

  read() { const s = readJson(STATE, {}); s.companies ??= []; return s }
  write(s) { writeJson(STATE, s) }
  entry(id) {
    const c = this.read().companies.find(x => x.id === id)
    if (!c) throw new Error(`no company "${id}"`)
    return c
  }
  #patch(id, fn) { const s = this.read(); const c = s.companies.find(x => x.id === id); if (!c) throw new Error(`no company "${id}"`); fn(c); this.write(s); return c }

  pidFile(c) { return path.join(c.home, '.run', 'company.pid') }
  logFile(c) { return path.join(c.home, '.run', 'company.log') }
  running(c) {
    const r = readJson(this.pidFile(c), null)
    if (!r?.pid || !alive(r.pid)) return null
    // the pid may have been reused by something else after a reboot: it must be this company's server
    const cmd = spawnSync('ps', ['-o', 'command=', '-p', String(r.pid)], { encoding: 'utf8' }).stdout ?? ''
    return cmd.includes('company.js') && cmd.includes('serve') ? r : null
  }

  /** Every company, the main one first. */
  list() {
    const usedSingletons = this.#singletonsInUse()
    const mainName = this.main?.co?.overview?.()?.profile?.label ?? 'Main company'
    const rows = [{ id: 'main', name: mainName, profile: this.mainProfile, main: true, status: 'running', home: path.relative(REPO, MAIN_HOME) }]
    for (const c of this.read().companies) {
      const r = this.running(c)
      const fails = (this.restarts.get(c.id) ?? []).length
      rows.push({
        id: c.id, name: c.name, profile: c.profile, createdAt: c.createdAt, home: path.relative(REPO, c.home), port: c.port,
        enabled: c.enabled !== false,
        status: this.busy.has(c.id) ? 'starting' : r ? 'running' : c.error ? 'error' : c.enabled === false ? 'stopped' : 'starting',
        pid: r?.pid ?? null, startedAt: r?.startedAt ?? null, error: c.error ?? null, restarts: fails,
      })
    }
    return { companies: rows, profiles: profiles().map(p => ({ ...p, available: !p.singleton || !usedSingletons.has(p.id) })) }
  }

  #singletonsInUse() {
    const single = new Set(profiles().filter(p => p.singleton).map(p => p.id))
    const used = new Set()
    if (single.has(this.mainProfile)) used.add(this.mainProfile)
    for (const c of this.read().companies) if (single.has(c.profile)) used.add(c.profile)
    return used
  }

  /** Create a company: its forge home, its organisation (company and super agent setup), its charter; then start it. */
  async create(b = {}) {
    const name = String(b.name ?? '').trim().slice(0, 60)
    if (name.length < 2) throw new Error('give the company a name')
    const id = String(b.id || slug(name))
    if (!ID.test(id) || RESERVED.has(id)) throw new Error(`"${id}" cannot be a company id: 2 to 31 lowercase letters, digits and dashes, starting with a letter`)
    const s = this.read()
    if (s.companies.some(c => c.id === id)) throw new Error(`a company "${id}" exists already`)
    const profile = String(b.profile ?? 'generic')
    const prof = profiles().find(p => p.id === profile)
    if (!prof) throw new Error(`no profile "${profile}"`)
    if (prof.singleton && this.#singletonsInUse().has(profile)) throw new Error(`the ${profile} profile drives shared machinery (${prof.label}) and another company already uses it`)
    const home = path.join(COMPANIES_DIR, id)
    if (fs.existsSync(home)) throw new Error(`the folder ${path.relative(REPO, home)} exists already; move it away first`)

    this.busy.add(id)
    try {
      fs.mkdirSync(path.join(home, 'company'), { recursive: true })
      fs.mkdirSync(path.join(home, '.run'), { recursive: true })
      const projectDir = path.join(home, 'project')
      fs.mkdirSync(projectDir, { recursive: true })
      const overrides = { companyName: name, label: name, projectDir }
      // like the main company: every agent on Claude Opus 5.5 through the local Claude subscription
      if (b.models !== 'profile') overrides.models = { provider: 'claude-code', ceo: OPUS, lead: OPUS, worker: OPUS, fast: OPUS, auditor: OPUS, choices: [OPUS], ceoEffort: 'high' }
      writeJson(path.join(home, 'company', 'profile.json'), { profile, overrides })
      this.#copySkills(home)
      const entry = { id, name, profile, home, port: null, enabled: false, createdAt: nowIso() }
      s.companies.push(entry)
      this.write(s)

      const env = this.#env(home)
      const out = []
      out.push(await this.#run([BIN, 'setup'], env))
      out.push(await this.#run([SUPER_BIN, 'setup'], env))
      const charter = {}
      if (b.mission) charter.mission = String(b.mission).slice(0, 2000)
      if (b.dailyUsd != null && b.dailyUsd !== '') charter.budget = { dailyUsd: Number(b.dailyUsd) }
      charter.autopilot = { enabled: b.autopilot === true, ...(b.everyHours ? { everyHours: Number(b.everyHours) } : {}) }
      out.push(await this.#run([BIN, 'charter', JSON.stringify(charter)], env))
      fs.appendFileSync(this.logFile(entry), `${nowIso()} created\n${out.join('\n')}\n`)
      this.log(`company ${id} created (${profile})`)
    } catch (e) {
      this.busy.delete(id)
      // keep the folder for inspection, but drop the half-made entry so the id can be used again after moving it
      const cur = this.read(); cur.companies = cur.companies.filter(c => c.id !== id); this.write(cur)
      throw new Error(`could not create ${id}: ${e.message}`)
    }
    this.busy.delete(id)
    if (b.start !== false) await this.start(id)
    return this.list().companies.find(c => c.id === id)
  }

  /** Skills are company know-how: a new company starts with the repository's own skills, not with another company's. */
  #copySkills(home) {
    const src = path.join(REPO, 'forge', 'skills'), dest = path.join(home, 'skills')
    const r = spawnSync('git', ['-C', REPO, 'ls-files', '-z', 'forge/skills'], { encoding: 'utf8' })
    const files = r.status === 0 ? r.stdout.split('\0').filter(Boolean) : null
    if (!files?.length) { if (fs.existsSync(src)) fs.cpSync(src, dest, { recursive: true }); return }
    for (const f of files) {
      const from = path.join(REPO, f)
      if (!fs.existsSync(from)) continue
      const to = path.join(dest, path.relative(path.join('forge', 'skills'), f))
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
    }
  }

  #env(home) {
    const env = { ...process.env, AGENT_FORGE_HOME: home, DSH_HOME: process.env.DSH_HOME ?? path.join(REPO, '.dsh-home') }
    delete env.COMPANY_PROFILE // the company's own profile.json decides
    return env
  }

  #run(args, env, timeoutMs = 180_000) {
    return new Promise((resolve, reject) => {
      const p = spawn(process.execPath, args, { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = '', err = ''
      const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs)
      p.stdout.on('data', d => { out += d })
      p.stderr.on('data', d => { err += d })
      p.on('error', e => { clearTimeout(t); reject(e) })
      p.on('close', code => {
        clearTimeout(t)
        if (code === 0) resolve(`$ ${path.basename(args[0])} ${args[1]}\n${out.slice(-4000)}`)
        else reject(new Error(`${path.basename(args[0])} ${args[1]} failed: ${(err || out).trim().split('\n').slice(-3).join(' ')}`))
      })
    })
  }

  async start(id) {
    const c = this.entry(id)
    if (this.running(c)) { this.#patch(id, x => { x.enabled = true; delete x.error }); return this.list().companies.find(x => x.id === id) }
    this.busy.add(id)
    try {
      let port = c.port
      if (!port || !(await freePort(port))) {
        const taken = new Set(this.read().companies.map(x => x.port).filter(Boolean))
        port = FIRST_PORT
        while (taken.has(port) || !(await freePort(port))) port++
      }
      fs.mkdirSync(path.join(c.home, '.run'), { recursive: true })
      // after a crash the old process's agent sessions may still be running: end them before new ones start
      const old = readJson(this.pidFile(c), null)
      if (old?.pid) await killGroup(old.pid, 5000)
      const fd = fs.openSync(this.logFile(c), 'a')
      const child = spawn(process.execPath, [BIN, 'serve', '--port', String(port)], { cwd: REPO, env: { ...this.#env(c.home), COMPANY_ID: id }, detached: true, stdio: ['ignore', fd, fd] })
      fs.closeSync(fd)
      child.unref()
      writeJson(this.pidFile(c), { pid: child.pid, port, startedAt: nowIso() })
      this.#patch(id, x => { x.port = port; x.enabled = true; delete x.error })
      // wait until it answers (it sets its console token on the first start)
      const until = Date.now() + 30_000
      let ok = false
      while (Date.now() < until) {
        await new Promise(r => setTimeout(r, 500))
        if (!alive(child.pid)) break
        try { const r = await call({ ...c, port }, 'GET', '/api/overview', { timeoutMs: 3000 }); if (r.status === 200) { ok = true; break } } catch {}
      }
      if (!ok) {
        const tail = this.logTail(id, 6)
        this.#patch(id, x => { x.error = `did not start: ${tail.split('\n').filter(Boolean).slice(-2).join(' ') || 'no output'}` })
        throw new Error(`${id} did not start; see its log`)
      }
      this.log(`company ${id} started on port ${port} (pid ${child.pid})`)
    } finally { this.busy.delete(id) }
    return this.list().companies.find(x => x.id === id)
  }

  async stop(id, { keepEnabled = false } = {}) {
    const c = this.#patch(id, x => { if (!keepEnabled) x.enabled = false })
    const r = this.running(c)
    // the whole process group: the company server and every agent session it started
    const pid = r?.pid ?? readJson(this.pidFile(c), null)?.pid
    if (pid) await killGroup(pid)
    if (r) this.log(`company ${id} stopped`)
    try { fs.rmSync(this.pidFile(c)) } catch {}
    return this.list().companies.find(x => x.id === id)
  }

  async restart(id) { await this.stop(id, { keepEnabled: true }); this.restarts.delete(id); return this.start(id) }

  rename(id, name) {
    name = String(name ?? '').trim().slice(0, 60)
    if (name.length < 2) throw new Error('give the company a name')
    const c = this.#patch(id, x => { x.name = name })
    const f = path.join(c.home, 'company', 'profile.json')
    const p = readJson(f, {})
    writeJson(f, { ...p, overrides: { ...(p.overrides ?? {}), companyName: name, label: name } })
    return { ok: true, note: 'The new name shows after a restart of the company. Agents keep their role texts until the organisation is refreshed (company-cli --company <id> setup --refresh-agents).' }
  }

  /** Stop the company and move its folder to companies/.archive/ (nothing is deleted). */
  async archive(id) {
    await this.stop(id)
    const c = this.entry(id)
    const dest = path.join(COMPANIES_DIR, '.archive', `${id}-${nowIso().replace(/[:.]/g, '-')}`)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.renameSync(c.home, dest)
    const s = this.read(); s.companies = s.companies.filter(x => x.id !== id); this.write(s)
    this.restarts.delete(id)
    this.log(`company ${id} archived to ${path.relative(REPO, dest)}`)
    return { ok: true, archived: path.relative(REPO, dest) }
  }

  logTail(id, lines = 80) {
    const c = this.entry(id)
    try {
      const st = fs.statSync(this.logFile(c))
      const fd = fs.openSync(this.logFile(c), 'r')
      const len = Math.min(st.size, 200_000)
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, st.size - len)
      fs.closeSync(fd)
      // the company's own console token is printed by `serve`: never show it
      return buf.toString('utf8').replace(/token=[A-Za-z0-9_-]+/g, 'token=(hidden)').split('\n').slice(-lines - 1).join('\n')
    } catch { return '' }
  }

  /** The few numbers the Companies page shows for each company. */
  async summary(id) {
    let o, so
    if (id === 'main') { o = this.main.co.overview(); so = this.main.sa.overview() }
    else {
      const c = this.entry(id)
      if (!this.running(c)) return { id, status: 'stopped' }
      const [a, b] = await Promise.all([call(c, 'GET', '/api/overview'), call(c, 'GET', '/api/super/overview')])
      if (a.status !== 200) throw new Error(a.json?.error ?? `the company answered ${a.status}`)
      o = a.json; so = b.status === 200 ? b.json : {}
    }
    return {
      id,
      label: o.profile?.label, profile: o.profile?.id, mission: o.charter?.mission,
      budget: { spentTodayUsd: o.budget?.spentTodayUsd ?? null, dailyUsd: o.budget?.dailyUsd ?? null },
      autopilot: o.charter?.autopilot ?? null,
      ceo: o.ceo?.name ?? null,
      departments: o.departments?.length ?? 0,
      agents: (o.departments ?? []).reduce((n, d) => n + (d.teams ?? []).reduce((m, t) => m + (t.members?.length ?? 0), 0), 0),
      openDecisions: (o.decisions ?? []).filter(d => d.status === 'open').length,
      tickets: (so.tickets ?? []).filter(t => t.status === 'open').length,
      needsYou: (so.needsYou ?? []).length,
      superAgents: (so.agents ?? []).length,
      proactive: so.enabled ?? null,
      hold: so.hold ?? null,
      lastCycle: o.cycles?.[0] ? { status: o.cycles[0].status, startedAt: o.cycles[0].startedAt } : null,
    }
  }

  /** Forward one browser request (already authorised by the portal) to company `id`'s process. */
  proxy(id, req, res, pathAndQuery) {
    const c = this.entry(id)
    if (!this.running(c)) {
      res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(JSON.stringify({ error: `company "${c.name}" is not running; start it on the Companies page` }))
    }
    const headers = { ...companyHeaders(c) }
    for (const h of ['content-type', 'content-length', 'accept']) if (req.headers[h]) headers[h] = req.headers[h]
    const up = http.request({ host: '127.0.0.1', port: c.port, path: pathAndQuery, method: req.method, headers, timeout: 120_000 }, r => {
      const out = { 'cache-control': 'no-store' }
      for (const h of ['content-type', 'content-length']) if (r.headers[h]) out[h] = r.headers[h]
      res.writeHead(r.statusCode ?? 502, out)
      r.pipe(res)
    })
    up.on('timeout', () => up.destroy(new Error('timeout')))
    up.on('error', e => {
      if (res.headersSent) return res.destroy()
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: `company "${c.name}" did not answer: ${e.message}` }))
    })
    req.pipe(up)
  }

  /** Start what should run (adopting company processes left running by a previous portal), then keep them up. */
  watch() {
    const tick = async () => {
      for (const c of this.read().companies) {
        if (c.enabled === false || this.busy.has(c.id) || this.running(c)) continue
        const recent = (this.restarts.get(c.id) ?? []).filter(t => Date.now() - t < 15 * 60_000)
        if (recent.length >= 5) {
          if (!c.error?.startsWith('stopped restarting')) this.#patch(c.id, x => { x.error = `stopped restarting after ${recent.length} failures in 15 minutes; see its log, then start it again` })
          continue
        }
        if (c.error?.startsWith('stopped restarting')) continue
        recent.push(Date.now())
        this.restarts.set(c.id, recent)
        this.log(`company ${c.id} is not running: starting it`)
        await this.start(c.id).catch(e => this.log(`company ${c.id}: ${e.message}`))
      }
    }
    const first = setTimeout(() => tick().catch(() => {}), 3000)
    const t = setInterval(() => tick().catch(() => {}), 30_000)
    t.unref?.(); first.unref?.()
    return () => { clearTimeout(first); clearInterval(t) }
  }
}
