/**
 * Super agent store. State lives in forge/super-agent/ (git-ignored):
 *   state.json   super agents, triggers, tickets, jobs, evals, feed, settings
 *   inbox/       commands from other processes (the CLI, a second server), one JSON file each
 *   loop.lock    which process runs the loop; only that process writes state.json
 *   work/        one folder per ticket (the worker's sandbox)
 *   backup/      agent files as they were before the super agent changed them
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { profile as P } from '../../company/lib/profile.js'

export const now = () => new Date().toISOString()
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const newId = (p = '') => p + crypto.randomBytes(5).toString('hex')
export const str = (v, max = 4000) => String(v ?? '').slice(0, max)
export const clip = (s, n = 6000) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n)}\n...[truncated]` : s }
export const slug = (s, max = 32) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '')

export const DEFAULT_SETTINGS = {
  maxWorkers: 4,          // tickets worked at the same time, shared fairly between the leaders
  maxEvals: 4,            // leader turns running at the same time (your messages may use one more)
  maxLanes: 3,            // threads one leader runs at once (your messages, workstreams, the main thread)
  maxJobs: 6,             // background asks (agents, teams, super teams, critiques) running at once
  idleWakeMinutes: 20,    // an idle leader with ready plan items is woken at most this often
  planAheadMinutes: 180,  // an idle leader with nothing planned is asked to plan ahead at most this often
  assignmentMinutes: 45,  // one worker turn is stopped after this long
  maxAssignments: 8,      // worker turns per ticket; then one extension, then the ticket is stopped
  maxTicketsPerDay: 30,
  maxEvalsPerDay: 400,
  maxSuperAgents: 8,
  maxSkillsPerDay: 5,
  sources: { company: true, engine: true, clock: true },
  leaders: { company: true }, // the COO and the department heads run as leaders (with the company in continuous mode)
  engine: { autostart: false }, // the host starts and keeps the paper engine's processes running
  ...P.scale,             // the active profile's scale (maxWorkers, maxTicketsPerDay, maxSuperAgents, ...)
}

const LISTS = ['agents', 'triggers', 'tickets', 'jobs', 'evals', 'feed']

export class Store {
  constructor(home) {
    this.dir = path.join(home, 'super-agent')
    this.file = path.join(this.dir, 'state.json')
    this.inbox = path.join(this.dir, 'inbox')
    this.work = path.join(this.dir, 'work')
    this.backup = path.join(this.dir, 'backup')
    this.lockFile = path.join(this.dir, 'loop.lock')
    for (const d of [this.inbox, this.work, this.backup]) fs.mkdirSync(d, { recursive: true })
  }

  read() {
    let s
    try { s = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { s = {} }
    s.enabled = s.enabled === true
    s.settings = { ...DEFAULT_SETTINGS, ...(s.settings ?? {}), sources: { ...DEFAULT_SETTINGS.sources, ...(s.settings?.sources ?? {}) }, leaders: { ...DEFAULT_SETTINGS.leaders, ...(s.settings?.leaders ?? {}) } }
    // settings saved before leaders worked in parallel kept the old, lower limits: raise them once
    if ((s.settingsVersion ?? 1) < 2) for (const k of ['maxWorkers', 'maxEvals', 'maxTicketsPerDay', 'maxEvalsPerDay']) s.settings[k] = Math.max(s.settings[k], DEFAULT_SETTINGS[k])
    for (const k of LISTS) s[k] ??= []
    s.sourceState ??= {}
    s.teamChats ??= {}
    s.days ??= {}
    return s
  }

  /** Read, change, write (atomic rename). Only the loop holder calls this. */
  update(fn) {
    const s = this.read()
    const out = fn(s)
    s.triggers = s.triggers.slice(-600)
    s.feed = s.feed.slice(-400)
    s.evals = s.evals.slice(-200)
    s.jobs = s.jobs.slice(-200)
    if (s.changes) s.changes = s.changes.slice(-60)
    s.updatedAt = now()
    s.settingsVersion = 2
    const tmp = `${this.file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(s, null, 1))
    fs.renameSync(tmp, this.file)
    return out
  }

  day(s) { return (s.days[today()] ??= { tickets: 0, evals: 0, agents: 0, skills: 0, gates: 0 }) }

  // ---------------- commands from any process
  command(cmd) {
    const id = `${Date.now()}-${newId()}`
    const tmp = path.join(this.inbox, `.${id}.tmp`)
    fs.writeFileSync(tmp, JSON.stringify({ id, ts: now(), ...cmd }))
    fs.renameSync(tmp, path.join(this.inbox, `${id}.json`))
    return { ok: true, queued: id, loop: this.holder() }
  }

  takeCommands() {
    const out = []
    for (const f of fs.readdirSync(this.inbox).filter(f => f.endsWith('.json')).sort()) {
      const full = path.join(this.inbox, f)
      try { out.push(JSON.parse(fs.readFileSync(full, 'utf8'))) } catch { /* unreadable command: dropped */ }
      fs.rmSync(full, { force: true })
    }
    return out
  }

  // ---------------- loop lock
  /** { pid, ts, alive } of the process that runs the loop, or null. */
  holder() {
    let l
    try { l = JSON.parse(fs.readFileSync(this.lockFile, 'utf8')) } catch { return null }
    let alive = false
    try { process.kill(l.pid, 0); alive = true } catch (e) { alive = e.code === 'EPERM' }
    const fresh = Date.now() - new Date(l.ts).getTime() < 120_000
    return alive && fresh ? { ...l, mine: l.pid === process.pid } : null
  }

  /** Take or refresh the lock. False when another live process holds it. */
  claim() {
    const h = this.holder()
    if (h && !h.mine) return false
    fs.writeFileSync(this.lockFile, JSON.stringify({ pid: process.pid, ts: now() }))
    return true
  }

  release() {
    const h = this.holder()
    if (h?.mine) fs.rmSync(this.lockFile, { force: true })
  }
}
