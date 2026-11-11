/**
 * Engine operations, done by code and never by an agent:
 *
 *   EngineOps     keeps the paper engine's three processes running (the dry-run chain bot, the collector and the
 *                 paper daemon) the same way quant/services.sh starts them, without LaunchAgents: plain detached
 *                 processes that are checked every minute and restarted when they are gone.
 *   Changes       the only way a worker's patch reaches the engine: static checks -> independent audit -> the owner
 *                 answers Install -> the patch is tested on a copy -> backup -> applied -> engine self-test ->
 *                 rolled back when the self-test fails.
 *
 * Limits enforced here: a patch may only touch quantcore/, config/ and tests/; it may not loosen a loss limit or
 * switch protection off; nothing worker-written runs outside the sandbox before the owner has said Install.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { QUANT, CRYPTO } from '../../company/profiles/quant.js'
import { now, newId, str, clip } from './store.js'

const FT = path.join(CRYPTO, 'freqtrade')
const LIVE = path.join(QUANT, 'data', 'live')
const run = (cmd, args, opts = {}) => new Promise(res => execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024, timeout: 120_000, ...opts }, (e, stdout, stderr) => res({ ok: !e, code: e?.code ?? 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), error: e?.message })))
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
export const pythonBin = () => { const p = path.join(FT, '.venv', 'bin', 'python'); return fs.existsSync(p) ? p : 'python3' }

const PROCS = {
  ftchain: { pattern: 'chain-overrides.json', title: 'Dry-run chain bot' },
  collector: { pattern: 'quantcore collect', title: 'Market data collector' },
  daemon: { pattern: 'quantcore daemon', title: 'Paper trading daemon' },
}

/** Stand-ins for profiles that have no engine to run or patch (every profile except quant). */
export class NullOps {
  constructor() { this.checkedAt = 0 }
  snapshot() { return { none: true, engineAgeS: null, collectorAgeS: null, engineFresh: false, collectorFresh: false, kill: false, books: [], startEquity: 0, signals: null, procs: {}, autostart: false, paused: false, note: null, checkedAt: null } }
  async refresh() {}
  async ensure() {}
  async stop() {}
}
export class NullChanges {
  poll() {}
  submit() { throw new Error('this company has no engine to change; deliver work as a ticket and send it to the gate') }
  decide() { throw new Error('this company has no engine changes') }
}

export class EngineOps {
  constructor(sa) {
    this.sa = sa
    this.procs = { ftchain: [], collector: [], daemon: [] }
    this.checkedAt = 0
    this.startedAt = {}
    this.starts = []
    this.paused = false
    this.note = null
  }

  /** What is measured on disk right now: heartbeats, books, processes. Cheap; no model, no network. */
  snapshot() {
    const hb = readJson(path.join(QUANT, 'data', 'heartbeat.json'))
    const chb = readJson(path.join(LIVE, 'collector-heartbeat.json'))
    const age = h => (h?.ts ? Math.round(Date.now() / 1000 - h.ts) : null)
    const start = readJson(path.join(QUANT, 'config', 'engine.json'))?.capital?.start ?? 1000
    const books = Object.entries(hb?.books ?? {}).map(([name, b]) => ({ name, profile: b.profile, equity: b.equity, state: b.state, open: !!b.open, pnl: Math.round((b.equity - start) * 100) / 100 }))
    return {
      engineAgeS: age(hb), collectorAgeS: age(chb), engineFresh: age(hb) != null && age(hb) < 300, collectorFresh: age(chb) != null && age(chb) < 300,
      kill: hb?.kill === true, books, startEquity: start, signals: chb?.signals ?? null,
      procs: Object.fromEntries(Object.entries(PROCS).map(([k, p]) => [k, { title: p.title, pids: this.procs[k] }])),
      autostart: this.sa.store.read().settings.engine?.autostart === true, paused: this.paused, note: this.note, checkedAt: this.checkedAt ? new Date(this.checkedAt).toISOString() : null,
    }
  }

  async #pids(name) {
    const r = await run('pgrep', ['-f', PROCS[name].pattern])
    return r.stdout.split('\n').map(x => Number(x)).filter(x => x > 1 && x !== process.pid)
  }

  async refresh() { for (const k of Object.keys(PROCS)) this.procs[k] = await this.#pids(k) }

  #spawn(name, cmd, args) {
    fs.mkdirSync(LIVE, { recursive: true })
    const log = fs.openSync(path.join(LIVE, `${name}.log`), 'a')
    const child = spawn(cmd, args, { cwd: QUANT, detached: true, stdio: ['ignore', log, log] })
    child.unref()
    fs.closeSync(log)
    this.startedAt[name] = Date.now()
    this.starts.push(Date.now())
    this.sa.log(`engine: started ${name} (pid ${child.pid})`)
  }

  /** Called from the loop. Starts what is missing when autostart is on; at most one check a minute. */
  async ensure(force = false) {
    if (!force && Date.now() - this.checkedAt < 60_000) return
    this.checkedAt = Date.now()
    await this.refresh()
    if (this.paused || this.sa.store.read().settings.engine?.autostart !== true) return
    this.starts = this.starts.filter(t => Date.now() - t < 30 * 60_000)
    if (this.starts.length >= 12) { this.note = 'the engine processes keep stopping; restarts are paused for 30 minutes (see quant/data/live/*.log)'; return }
    this.note = null
    const recently = n => Date.now() - (this.startedAt[n] ?? 0) < 90_000
    let chainOk = this.procs.ftchain.length > 0
    if (!chainOk && !recently('ftchain')) {
      const ft = path.join(FT, '.venv', 'bin', 'freqtrade')
      const cfg = ['--config', path.join(FT, 'user_data', 'config.json'), '--config', path.join(QUANT, 'freqtrade', 'chain-overrides.json')]
      if (!fs.existsSync(ft)) this.note = 'freqtrade is not installed, so the dry-run chain bot is not started'
      else if (await new Promise(r => { const s = net.connect(8081, '127.0.0.1'); s.once('connect', () => { s.destroy(); r(true) }); s.once('error', () => r(false)) })) chainOk = true
      else {
        // same guard as services.sh: never start the chain bot unless the merged config says dry_run
        const show = await run(ft, ['show-config', '--userdir', path.join(FT, 'user_data'), ...cfg], { cwd: QUANT })
        if (!/"dry_run":\s*true/.test(show.stdout)) this.note = 'REFUSED to start the chain bot: its merged config is not dry_run'
        else this.#spawn('ftchain', ft, ['trade', ...cfg, '--strategy-path', path.join(QUANT, 'freqtrade'), '--userdir', path.join(FT, 'user_data')])
      }
    }
    if (!this.procs.collector.length && !recently('collector')) this.#spawn('collector', path.join(QUANT, 'q'), ['collect'])
    if (!this.procs.daemon.length && !recently('daemon')) {
      // the daemon attaches to the chain bot, so give that 25 s to come up
      const chainAge = Date.now() - (this.startedAt.ftchain ?? 0)
      if (chainOk || chainAge > 25_000) this.#spawn('daemon', path.join(QUANT, 'q'), ['daemon', '--profile', 'max_day', ...(chainOk || this.startedAt.ftchain ? ['--mirror-freqtrade'] : [])])
      else this.checkedAt = Date.now() - 35_000
    }
  }

  /** Clean stop (SIGINT, like Ctrl-C) of the named processes. */
  async stop(names = Object.keys(PROCS)) {
    await this.refresh()
    for (const n of names) for (const pid of this.procs[n]) { try { process.kill(pid, 'SIGINT') } catch {} }
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500))
      await this.refresh()
      if (names.every(n => !this.procs[n].length)) break
    }
    for (const n of names) for (const pid of this.procs[n]) { try { process.kill(pid, 'SIGTERM') } catch {} }
    for (const n of names) delete this.startedAt[n]
  }
}

// ---------------------------------------------------------------- engine changes
const ALLOWED = ['quantcore/', 'config/', 'tests/']
const GIT_ENV = { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(QUANT) }
const TIGHTEN_MAX = ['max_day_loss', 'max_total_drawdown', 'hard_margin_frac', 'risk_frac']

/** Paths a unified diff touches, or an error string. */
export function patchPaths(text) {
  const paths = new Set()
  for (const l of text.split('\n')) {
    let m
    if (/^(new|old|deleted) file mode 120000|^GIT binary patch|^Binary files /.test(l)) return { error: 'the patch contains a symlink or a binary file' }
    if ((m = l.match(/^diff --git a\/(\S+) b\/(\S+)/))) { paths.add(m[1]); paths.add(m[2]) }
    else if ((m = l.match(/^(?:---|\+\+\+) (?:[ab]\/)?(\S+)/)) && m[1] !== '/dev/null') paths.add(m[1])
    else if ((m = l.match(/^rename (?:from|to) (\S+)/))) paths.add(m[1])
  }
  if (!paths.size) return { error: 'this is not a unified diff (no file headers found)' }
  for (const p of paths) {
    if (p.startsWith('/') || p.split('/').includes('..') || !ALLOWED.some(a => p.startsWith(a))) return { error: `the patch touches ${p}; only ${ALLOWED.join(', ')} may change` }
  }
  return { paths: [...paths].sort() }
}

/** What a config change does to the risk settings: violations stop the change, the rest is shown to the owner. */
export function riskDiff(a, b) {
  const violations = [], changes = []
  const pa = a?.protection ?? {}, pb = b?.protection ?? {}
  if (pb.enabled !== true) violations.push('protection.enabled is not true')
  if (pb.max_day_loss !== pa.max_day_loss) violations.push(`protection.max_day_loss changes from ${pa.max_day_loss} to ${pb.max_day_loss} (it is fixed)`)
  for (const k of TIGHTEN_MAX) if (typeof pa[k] === 'number' && !(pb[k] <= pa[k])) violations.push(`protection.${k} is loosened from ${pa[k]} to ${pb[k]}`)
  if (typeof pa.profit_lock === 'number' && !(pb.profit_lock >= pa.profit_lock)) violations.push(`protection.profit_lock is loosened from ${pa.profit_lock} to ${pb.profit_lock}`)
  const ha = a?.hard_limits ?? {}, hb = b?.hard_limits ?? {}
  for (const [k, v] of Object.entries(ha)) {
    if (typeof v !== 'number') continue
    if (typeof hb[k] !== 'number') violations.push(`hard_limits.${k} is removed`)
    else if (k.endsWith('_max') && hb[k] > v) violations.push(`hard_limits.${k} is loosened from ${v} to ${hb[k]}`)
    else if (k.endsWith('_min') && hb[k] < v) violations.push(`hard_limits.${k} is loosened from ${v} to ${hb[k]}`)
  }
  const walk = (x, y, p) => {
    for (const k of new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})])) {
      if (k.startsWith('_')) continue
      const u = x?.[k], v = y?.[k], q = p ? `${p}.${k}` : k
      if (u && v && typeof u === 'object' && typeof v === 'object' && !Array.isArray(u)) walk(u, v, q)
      else if (JSON.stringify(u) !== JSON.stringify(v)) changes.push(`${q}: ${u === undefined ? '(new)' : JSON.stringify(u)} -> ${v === undefined ? '(removed)' : clip(JSON.stringify(v), 160)}`)
    }
  }
  for (const k of ['protection', 'risk', 'hard_limits', 'capital', 'profiles', 'forward_test']) walk(a?.[k], b?.[k], k)
  const sa = a?.streams ?? {}, sb = b?.streams ?? {}
  for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
    if (!sa[k]) changes.push(`streams.${k}: new stream (enabled ${sb[k]?.enabled === true})`)
    else if (!sb[k]) changes.push(`streams.${k}: removed`)
    else if (JSON.stringify(sa[k]) !== JSON.stringify(sb[k])) changes.push(`streams.${k}: ${Object.keys(sb[k]).filter(f => JSON.stringify(sa[k][f]) !== JSON.stringify(sb[k][f])).map(f => `${f} ${JSON.stringify(sa[k][f])} -> ${JSON.stringify(sb[k][f])}`).join(', ')}`)
  }
  return { violations, changes: changes.slice(0, 60) }
}

const FLAGS = /api[_-]?key|secret|token|subprocess|os\.system|socket|requests\.|urllib|http\.client|eval\(|exec\(|dry_run|8080|private[_-]?key|withdraw/i
const AUDIT = { type: 'object', additionalProperties: false, required: ['fatal', 'objections', 'summary'], properties: { fatal: { type: 'boolean' }, objections: { type: 'array', items: { type: 'string' } }, summary: { type: 'string', description: 'what the change does, in plain words a non-programmer can follow, at most 80 words' } } }

export class Changes {
  constructor(sa) {
    this.sa = sa
    this.dir = path.join(sa.store.dir, 'changes')
    this.busy = false
  }

  #set(id, patch) { return this.sa.store.update(s => { const c = (s.changes ??= []).find(x => x.id === id); if (c) Object.assign(c, patch, { updatedAt: now() }); return c }) }

  /** A fresh copy of the engine with the patch applied (no code is executed). */
  async #copyWithPatch(id, patchFile) {
    const tmp = path.join(os.tmpdir(), `engine-change-${id}`)
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.cpSync(QUANT, tmp, { recursive: true, filter: src => !/\/(__pycache__|\.venv)(\/|$)/.test(src) && !/\.sqlite(-shm|-wal)?$/.test(src) })
    const env = { ...process.env, GIT_CEILING_DIRECTORIES: os.tmpdir() }
    const chk = await run('git', ['apply', '--check', patchFile], { cwd: tmp, env })
    if (!chk.ok) return { tmp, error: `the patch does not apply to the current engine: ${clip(chk.stderr || chk.error, 500)}` }
    const ap = await run('git', ['apply', patchFile], { cwd: tmp, env })
    if (!ap.ok) return { tmp, error: `the patch did not apply: ${clip(ap.stderr || ap.error, 500)}` }
    return { tmp }
  }

  /** Step 1, started by a super agent's tool: checks that execute nothing, then the audit, then the owner is asked. */
  submit(me, ticket, a) {
    const s = this.sa.store.read()
    if ((s.changes ?? []).some(c => ['checking', 'awaiting-owner', 'installing'].includes(c.status))) throw new Error('another engine change is still open; one at a time')
    const rel = String(a.patch ?? '')
    const src = path.resolve(ticket.dir, rel)
    if (!src.startsWith(ticket.dir + path.sep) || !fs.existsSync(src)) throw new Error(`no file ${rel} in the ticket folder`)
    const st = fs.lstatSync(src)
    if (!st.isFile() || st.size > 600_000) throw new Error('the patch must be a plain file of at most 600 KB')
    const text = fs.readFileSync(src, 'utf8')
    const pp = patchPaths(text)
    if (pp.error) throw new Error(pp.error)
    const id = newId('g')
    const home = path.join(this.dir, id)
    fs.mkdirSync(home, { recursive: true })
    const patchFile = path.join(home, 'change.patch')
    fs.writeFileSync(patchFile, text)
    const flags = [...new Set(text.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++') && FLAGS.test(l)).map(l => clip(l.slice(1).trim(), 160)))].slice(0, 25)
    const rec = { id, ts: now(), status: 'checking', ticket: ticket.id, by: me.id, title: str(a.title, 140), summary: str(a.summary, 3000), patch: rel, sha: crypto.createHash('sha256').update(text).digest('hex'), files: pp.paths, flags }
    this.sa.store.update(x => { (x.changes ??= []).push(rec); x.changes = x.changes.slice(-60) })
    const { done } = this.sa.forge.engine.startCustom(`engine change: ${rec.title.slice(0, 40)}`, async api => {
      const c = await this.#copyWithPatch(id, patchFile)
      try {
        if (c.error) return { reject: c.error }
        const risk = riskDiff(readJson(path.join(QUANT, 'config', 'engine.json')), readJson(path.join(c.tmp, 'config', 'engine.json')))
        if (!readJson(path.join(c.tmp, 'config', 'engine.json'))) return { reject: 'config/engine.json is not valid JSON after the patch' }
        if (risk.violations.length) return { reject: `it loosens a protected limit: ${risk.violations.join('; ')}`, risk }
        const auditor = this.sa.co.read().auditor
        const res = await api.agent(auditor, `Audit this change to the paper-trading engine before the owner is asked to install it. You are independent of the worker who wrote it and of the super agent who submits it.\n\nThe patch: ${patchFile}\nThe worker's folder (notes, tests): ${ticket.dir}\nThe engine it applies to: ${QUANT}\n\nWhat the submitter says it does:\n${rec.summary}\n\nFiles it touches: ${pp.paths.join(', ')}\nRisk settings it changes:\n${risk.changes.join('\n') || '(none)'}\nAdded lines that mention network, secrets, shell or dry-run:\n${flags.join('\n') || '(none)'}\n\nRead the patch. Mark fatal when it could place a real order, reach an exchange with keys, weaken a loss limit, the kill switch or the validator's honesty (lookahead, a lower bar, trials not counted, an approval that can be forged), touch the freqtrade bot on port 8080, run a shell or reach the network in a new way, or when it is not what the summary says. List every objection. The summary you return is shown to the owner.`, { schema: AUDIT, label: `audit-change:${id}`, full: true, signal: AbortSignal.timeout(25 * 60_000) })
        const v = res?.structured
        if (!v) return { reject: 'the auditor gave no verdict (no engine change without an audit)', risk }
        return { risk, audit: { fatal: v.fatal === true, objections: (v.objections ?? []).slice(0, 12).map(o => str(o, 500)), summary: str(v.summary, 900) } }
      } finally { fs.rmSync(c.tmp, { recursive: true, force: true }) }
    }, { change: id }, { cwd: QUANT, meta: { engineChange: id } })
    done.then(st => {
      const r = st.result ?? { reject: `the check ${st.status}: ${String(st.error ?? '').split('\n')[0]}` }
      const fatal = r.audit?.fatal
      if (r.reject || fatal) {
        const why = r.reject ?? `the auditor found a fatal problem: ${r.audit.objections.join('; ')}`
        this.#set(id, { status: 'rejected', note: clip(why, 1500), risk: r.risk, audit: r.audit })
        this.sa.say({ from: 'system', kind: 'change', ticket: ticket.id, text: `Engine change "${rec.title}" was rejected before reaching you: ${clip(why, 600)}` })
        this.sa.trigger({ source: 'engine-change', kind: 'rejected', to: me.id, ticket: ticket.id, text: `Your engine change "${rec.title}" (${id}) was rejected: ${why}\nFix it in the ticket and submit again, or drop it.` })
        return
      }
      this.#set(id, { status: 'awaiting-owner', risk: r.risk, audit: r.audit })
      const co = this.sa.co
      const d = co.update(x => co.addDecision(x, {
        from: me.id, kind: 'engine-change', change: id,
        question: `Install the engine change "${rec.title}"? ${r.audit.summary}`,
        options: ['Install', 'Do not install'], recommendation: r.audit.objections.length ? 'Do not install' : 'Install',
        why: `${pp.paths.length} files (${pp.paths.join(', ')}). ${r.risk.changes.length ? `Risk settings it changes: ${r.risk.changes.join('; ')}.` : 'It changes no risk setting.'} ${r.audit.objections.length ? `The auditor's objections (not fatal): ${r.audit.objections.join('; ')}.` : 'The independent auditor found no objection.'} If you install it, it is first tested on a copy, the engine is backed up, and it is rolled back if the engine's own tests fail. Paper trading only.`,
      }))
      this.#set(id, { decision: d?.id })
      this.sa.say({ from: me.id, kind: 'change', ticket: ticket.id, question: true, text: `Engine change "${rec.title}" passed the audit and waits for your answer in "Needs you".` })
    }).catch(e => this.sa.log(`engine change ${id}: ${e.message}`))
    return `Engine change ${id} submitted. It is checked and audited now; then the owner is asked. The result reaches you as a trigger.`
  }

  /** Called from the loop: act on the owner's answers. */
  poll() {
    if (this.busy) return
    const s = this.sa.store.read()
    const c = (s.changes ?? []).find(x => x.status === 'awaiting-owner' && x.decision)
    if (!c) return
    const d = this.sa.co.read().decisions.find(x => x.id === c.decision)
    if (!d || d.status !== 'answered') return
    if (!/^install$/i.test(d.choice)) {
      this.#set(c.id, { status: 'declined', note: 'the owner declined' })
      this.sa.trigger({ source: 'engine-change', kind: 'declined', to: c.by, ticket: c.ticket, text: `The owner declined to install your engine change "${c.title}" (${c.id}).${d.note ? ` Their note: ${d.note}` : ''}` })
      return
    }
    this.busy = true
    this.#set(c.id, { status: 'installing' })
    this.#install(c).then(r => {
      this.#set(c.id, { status: r.ok ? 'installed' : r.rolledBack ? 'rolled-back' : 'failed', note: clip(r.note, 1500), installedAt: r.ok ? now() : undefined })
      this.sa.say({ from: 'system', kind: 'change', ticket: c.ticket, text: `Engine change "${c.title}": ${r.note}` })
      this.sa.trigger({ source: 'engine-change', kind: r.ok ? 'installed' : 'failed', to: c.by, ticket: c.ticket, text: `Engine change "${c.title}" (${c.id}): ${r.note}${r.ok ? '\nThe engine now runs the new code. Decide what this unblocks and update your plan.' : ''}` })
    }).catch(e => { this.#set(c.id, { status: 'failed', note: e.message }); this.sa.log(`install ${c.id}: ${e.message}`) }).finally(() => { this.busy = false; this.sa.ops.paused = false; this.sa.ops.checkedAt = 0 })
  }

  async #install(c) {
    const home = path.join(this.dir, c.id)
    const patchFile = path.join(home, 'change.patch')
    if (crypto.createHash('sha256').update(fs.readFileSync(patchFile, 'utf8')).digest('hex') !== c.sha) return { ok: false, note: 'not installed: the stored patch is not the one that was audited' }
    const py = pythonBin()
    const tests = async cwd => {
      const r = await run(py, ['-m', 'quantcore', 'selftest'], { cwd, timeout: 20 * 60_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
      const out = `${r.stdout}\n${r.stderr}`
      return { ok: r.ok && !/FAILED|Traceback|"ok":\s*false/.test(out) && /"ok":\s*true|^OK\b/m.test(out), out: clip(out.trim().split('\n').slice(-25).join('\n'), 2500) }
    }
    // 1. on a copy
    const cp = await this.#copyWithPatch(c.id, patchFile)
    try {
      if (cp.error) return { ok: false, note: `not installed: ${cp.error}` }
      const t = await tests(cp.tmp)
      fs.writeFileSync(path.join(home, 'test-on-copy.log'), t.out)
      if (!t.ok) return { ok: false, note: `not installed: the engine's tests fail on a copy with the patch. Last lines:\n${t.out}` }
    } finally { fs.rmSync(cp.tmp, { recursive: true, force: true }) }
    // 2. stop the engine, back up, apply
    this.sa.ops.paused = true
    await this.sa.ops.stop(['daemon', 'collector'])
    const backup = path.join(home, 'backup')
    fs.rmSync(backup, { recursive: true, force: true })
    for (const d of ALLOWED) fs.cpSync(path.join(QUANT, d), path.join(backup, d), { recursive: true })
    const restore = () => { for (const d of ALLOWED) { fs.rmSync(path.join(QUANT, d), { recursive: true, force: true }); fs.cpSync(path.join(backup, d), path.join(QUANT, d), { recursive: true }) } }
    const ap = await run('git', ['apply', patchFile], { cwd: QUANT, env: GIT_ENV })
    if (!ap.ok) { restore(); return { ok: false, rolledBack: true, note: `not installed: the patch did not apply to the engine (${clip(ap.stderr || ap.error, 400)}). The engine is unchanged.` } }
    // 3. the engine's own tests on the real thing; roll back when they fail
    const t = await tests(QUANT)
    fs.writeFileSync(path.join(home, 'test-installed.log'), t.out)
    if (!t.ok) { restore(); return { ok: false, rolledBack: true, note: `rolled back: the engine's tests failed after installing. The engine is as it was before. Last lines:\n${t.out}` } }
    return { ok: true, note: `installed. ${c.files.length} files changed, the engine's tests pass, and the engine is restarting. The previous version is kept in ${backup}.` }
  }
}
