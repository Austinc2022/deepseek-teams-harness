/**
 * Health and problems: what stops the company from working, shown at the top of the dashboard.
 *
 *   checks     run by the loop every 15 minutes: a live call to each model the agents use (it catches an outdated
 *              Claude Code, a retired model, missing login or credit), the installed Agent SDK against the lock
 *              file, the loop and budget hold, the engine and data feeds, stuck work, broken agent files, disk
 *              space. Each is ok, warn or fail, with what to do.
 *   problems   recent failures of agent runs, grouped by error (counts, first and last time, which agents), with
 *              the fix for known errors. A problem that keeps happening across agents is a showstopper.
 *   alerts     a showstopper or a failing check is posted to the owner's feed once, then again only after 6 hours.
 *
 * Results are written to forge/super-agent/health.json so any server process can show them.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { profile as P } from '../../company/lib/profile.js'
import { now, clip } from './store.js'

const HOUR = 3600_000
const require = createRequire(import.meta.url)

/** Known errors: how to recognise them, how bad they are, what to do. */
const KNOWN = [
  { re: /does not support this model|version [\d.]+ or newer is required/i, fatal: true, hint: 'The Claude Code bundled with the Agent SDK is too old for this model. In deepseekharness/plugins run "npm install" (the lock file pins a newer SDK), then restart dsh.' },
  { re: /issue with the selected model|model.*(does not exist|not found|not_found)|invalid model/i, fatal: true, hint: 'An agent names a model that does not exist, is retired, or that this login cannot use. Check its model in forge/agents/<agent>.yaml or the profile\'s models.' },
  { re: /credit balance|insufficient (funds|balance|credit)|quota|billing|payment required/i, fatal: true, hint: 'The provider account is out of credit or over its quota. Top it up or switch the agents to another provider.' },
  { re: /not logged in|please run \/login|invalid (x-)?api.?key|authentication|unauthorized|\b401\b|needs [A-Z_]+_API_KEY/i, fatal: true, hint: 'Missing or invalid credentials: run "claude" once to log in, or set the provider key in deepseekharness/.dsh-home/.env.' },
  { re: /ENOSPC|no space left/i, fatal: true, hint: 'The disk is full. Free space, then restart dsh.' },
  { re: /rate.?limit|\b429\b|overloaded|\b529\b|usage limit/i, fatal: false, hint: 'The provider is rate-limiting or overloaded. Work retries; if it persists, lower maxEvals and maxWorkers in the settings.' },
  { re: /maximum number of turns/i, fatal: false, hint: 'An agent hit its turn limit (maxTurns). Raise it for that agent or split its tasks.' },
  { re: /timed? ?out|aborted|AbortError/i, fatal: false, hint: 'Work ran past its time limit. Usually the task is too large for one turn; split it or raise the limit.' },
]
const known = msg => KNOWN.find(k => k.re.test(msg))
const signature = msg => String(msg ?? '').split('\n')[0].replace(/^(Error: )?Claude Code returned an error result: /, '').replace(/\b[0-9a-f]{8,}\b/gi, '#').replace(/\d{4}-\d\d-\d\dT[\d:.Z]+/g, '#').slice(0, 160).trim()

export class Health {
  constructor(sa) {
    this.sa = sa
    this.file = path.join(sa.store.dir, 'health.json')
    this.runsCache = null
  }
  read() { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { return { checks: [], problems: [], alerted: {} } } }
  write(h) { const tmp = `${this.file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(h, null, 1)); fs.renameSync(tmp, this.file) }

  // ---------------------------------------------------------------- problems: failed agent runs, grouped
  problems({ hours = 6, modelsOk } = {}) {
    if (!modelsOk && this.runsCache && Date.now() - this.runsCache.at < 60_000) return this.runsCache.v
    // model and version errors are fixed when the live test now passes for the models those agents use
    modelsOk ??= new Map((this.read().checks ?? []).filter(c => c.id.startsWith('model:') && c.status === 'ok').map(c => [c.id.slice(6), this.read().liveAt]))
    const { engine, registry } = this.sa.forge
    let ids = []
    try { ids = fs.readdirSync(registry.d.runs).sort().reverse().slice(0, 300) } catch {}
    const since = Date.now() - hours * HOUR
    const groups = new Map()
    const lastOk = {} // agent -> its last successful turn: an error it got before that is fixed
    for (const id of ids) {
      let r
      try { r = engine.getRun(id) } catch { continue }
      const started = new Date(r.startedAt ?? r.createdAt ?? 0).getTime()
      if (started && started < since - HOUR) break // run ids are time-ordered
      for (const a of r.agents ?? []) if (a.status === 'completed' && a.endedAt && !(lastOk[a.agent] > a.endedAt)) lastOk[a.agent] = a.endedAt
      const fails = (r.agents ?? []).filter(a => a.status === 'failed' && a.error).map(a => ({ msg: a.error, agent: a.agent, ts: a.endedAt ?? a.startedAt ?? r.startedAt }))
      if (r.status === 'failed' && r.error && !fails.length) fails.push({ msg: r.error, agent: r.orchestration ?? r.label ?? 'run', ts: r.endedAt ?? r.startedAt })
      for (const f of fails) {
        if (!f.ts || new Date(f.ts).getTime() < since) continue
        const sig = signature(f.msg)
        if (!sig) continue
        const g = groups.get(sig) ?? { signature: sig, count: 0, first: f.ts, last: f.ts, agents: new Set(), runs: new Set(), example: clip(String(f.msg), 600) }
        g.count++; g.agents.add(f.agent); g.runs.add(id)
        if (f.ts < g.first) g.first = f.ts
        if (f.ts > g.last) g.last = f.ts
        groups.set(sig, g)
      }
    }
    const v = [...groups.values()].map(g => {
      const k = known(g.signature + ' ' + g.example)
      const modelOf = a => { try { return this.sa.forge.registry.getAgent(a).model } catch { return null } }
      const modelError = KNOWN.slice(0, 2).some(x => x.re.test(g.signature))
      const fixed = [...g.agents].some(a => lastOk[a] && lastOk[a] > g.last) || (modelError && [...g.agents].every(a => { const t = modelsOk.get(modelOf(a)); return t && t > g.last }))
      const active = !fixed && Date.now() - new Date(g.last).getTime() < HOUR
      const showstopper = active && ((k?.fatal && g.count >= 2) || (g.count >= 5 && g.agents.size >= 2))
      return { signature: g.signature, count: g.count, first: g.first, last: g.last, agents: [...g.agents].slice(0, 12), runs: g.runs.size, example: g.example, hint: k?.hint ?? null, active, fixed, severity: showstopper ? 'showstopper' : active ? 'warning' : 'resolved' }
    }).sort((a, b) => ({ showstopper: 0, warning: 1, resolved: 2 }[a.severity] - { showstopper: 0, warning: 1, resolved: 2 }[b.severity]) || String(b.last).localeCompare(String(a.last)))
    this.runsCache = { at: Date.now(), v }
    return v
  }

  // ---------------------------------------------------------------- checks
  /** The models the active agents use, with their provider. */
  models() {
    const { registry } = this.sa.forge
    const set = new Map()
    for (const a of registry.listAgents().filter(x => !x.invalid && P.isOurs(x.name))) {
      let d; try { d = registry.getAgent(a.name) } catch { continue }
      const key = `${d.provider ?? 'claude-code'}|${d.model}`
      if (!set.has(key)) set.set(key, { provider: d.provider ?? 'claude-code', model: d.model, agents: [] })
      set.get(key).agents.push(a.name)
    }
    return [...set.values()]
  }

  /** A one-turn call to a model through the same Agent SDK the agents use. */
  async smoke(model) {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    const env = { ...process.env }
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ANTHROPIC_BASE_URL
    const abort = new AbortController()
    const t = setTimeout(() => abort.abort(), 90_000)
    try {
      let out = null
      for await (const m of query({ prompt: 'Reply with exactly: ok', options: { model, maxTurns: 1, env, settingSources: [], abortController: abort, tools: [] } })) {
        if (m.type === 'result') out = m.subtype === 'success' ? { ok: true } : { ok: false, error: String(m.result ?? m.errors ?? m.subtype) }
      }
      return out ?? { ok: false, error: 'no result' }
    } catch (e) { return { ok: false, error: e.message } } finally { clearTimeout(t) }
  }

  async runChecks({ live = true } = {}) {
    const checks = []
    const add = (id, name, status, detail, fix) => checks.push({ id, name, status, detail: clip(detail, 400), fix: fix ?? null })
    const s = this.sa.store.read()

    // the Agent SDK in use against the lock file
    try {
      // the package does not export its package.json: find it from the entry point
      let dir = path.dirname(require.resolve('@anthropic-ai/claude-agent-sdk'))
      while (!fs.existsSync(path.join(dir, 'package.json')) || JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name !== '@anthropic-ai/claude-agent-sdk') { const up = path.dirname(dir); if (up === dir) throw new Error('package.json not found'); dir = up }
      const pkgFile = path.join(dir, 'package.json')
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
      const lockFile = path.resolve(dir, '../../../package-lock.json')
      const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
      const want = lock.packages?.['node_modules/@anthropic-ai/claude-agent-sdk']?.version
      if (want && want !== pkg.version) add('sdk', 'Agent SDK installed', 'fail', `Installed ${pkg.version} (Claude Code ${pkg.claudeCodeVersion ?? '?'}), the lock file asks for ${want}.`, 'In deepseekharness/plugins run "npm install", then restart dsh.')
      else add('sdk', 'Agent SDK installed', 'ok', `${pkg.version}, bundling Claude Code ${pkg.claudeCodeVersion ?? '?'}`)
    } catch (e) { add('sdk', 'Agent SDK installed', 'warn', `Could not read the SDK version: ${e.message}`) }

    // a live call per model in use (Claude Code models only; other providers are checked by their failures)
    if (live) {
      for (const m of this.models()) {
        if (m.provider !== 'claude-code') { add(`model:${m.model}`, `Model ${m.model}`, 'ok', `${m.provider}; ${m.agents.length} agent(s); checked through their runs`); continue }
        const r = await this.smoke(m.model)
        const k = r.ok ? null : known(r.error)
        add(`model:${m.model}`, `Model ${m.model}`, r.ok ? 'ok' : k?.fatal === false ? 'warn' : 'fail', r.ok ? `A live test call answered (${m.agents.length} agent(s) use it).` : `The test call failed: ${r.error}`, r.ok ? null : k?.hint ?? `Used by ${m.agents.slice(0, 6).join(', ')}.`)
      }
    } else {
      for (const c of this.read().checks.filter(c => c.id.startsWith('model:'))) checks.push(c)
    }

    // the loop and the budget
    const holder = this.sa.store.holder()
    add('loop', 'Work loop', holder ? 'ok' : 'fail', holder ? `Running in process ${holder.pid}.` : 'No process runs the loop: nothing new starts.', holder ? null : 'Start dsh (./dsh web --no-open) or ./company-cli serve.')
    add('budget', 'Budget', this.sa.holdReason ? 'fail' : 'ok', this.sa.holdReason ? `On hold: ${this.sa.holdReason}` : 'No budget hold.', this.sa.holdReason ? 'Raise the daily budget or top up the provider; new work starts again by itself.' : null)
    add('proactive', 'Proactive mode', s.enabled ? 'ok' : 'warn', s.enabled ? 'On: leaders react to events and the clock.' : 'Off: leaders act only on your messages.', s.enabled ? null : 'Turn proactive mode on in the desk.')

    // the engine and its data (profiles with an engine)
    if (P.hasEngine) {
      const e = this.sa.ops.snapshot()
      if (e.none) add('engine', 'Engine and data', 'warn', 'The engine runner is not active in this process.')
      else add('engine', 'Engine and data', e.engineFresh && e.collectorFresh ? 'ok' : e.autostart ? 'fail' : 'warn', `Engine heartbeat ${e.engineAgeS ?? '?'} s old, data collector ${e.collectorAgeS ?? '?'} s old${e.note ? `; ${e.note}` : ''}.`, e.engineFresh && e.collectorFresh ? null : e.autostart ? 'The host restarts them; if this persists, check logs/ for the engine and collector.' : 'Switch the engine on in the desk if it should run.')
    }

    // stuck work
    const age = t => (Date.now() - new Date(t).getTime()) / 60000
    const stuckEvals = s.evals.filter(e => e.status === 'running' && age(e.startedAt) > 45)
    const stuckTk = s.tickets.filter(t => t.assignments.at(-1)?.status === 'running' && age(t.assignments.at(-1).startedAt) > s.settings.assignmentMinutes + 15)
    const stuckJobs = s.jobs.filter(j => j.status === 'running' && age(j.startedAt) > 120)
    const stuck = stuckEvals.length + stuckTk.length + stuckJobs.length
    add('stuck', 'Stuck work', stuck ? 'warn' : 'ok', stuck ? `${stuckEvals.length} leader turn(s) over 45 min, ${stuckTk.length} ticket turn(s) over their limit, ${stuckJobs.length} ask(s) over 2 h.` : 'Nothing has run far past its limit.', stuck ? 'Restarting dsh puts stuck work back in the queue.' : null)

    // agent files
    const bad = this.sa.forge.registry.listAgents().filter(a => a.invalid && P.isOurs(a.name ?? ''))
    add('agents', 'Agent files', bad.length ? 'fail' : 'ok', bad.length ? `${bad.length} agent file(s) do not load: ${bad.slice(0, 5).map(a => `${a.name}${a.error ? ` (${clip(a.error, 80)})` : ''}`).join(', ')}` : 'Every agent file loads.', bad.length ? 'Fix or restore them from forge/super-agent/backup/agents/.' : null)

    // disk
    try {
      const out = execFileSync('df', ['-Pk', this.sa.store.dir], { encoding: 'utf8' }).trim().split('\n').at(-1).split(/\s+/)
      const freeGb = Number(out[3]) / 1024 / 1024
      add('disk', 'Disk space', freeGb < 2 ? 'fail' : freeGb < 10 ? 'warn' : 'ok', `${freeGb.toFixed(1)} GB free.`, freeGb < 10 ? 'Free disk space; agent runs and data need room.' : null)
    } catch {}

    // recent failures of agent runs (model errors count as fixed when the live test above passed)
    const okNow = new Map(checks.filter(c => c.id.startsWith('model:') && c.status === 'ok').map(c => [c.id.slice(6), live ? now() : this.read().liveAt]))
    this.runsCache = null
    const probs = this.problems({ modelsOk: okNow })
    this.lastProblems = probs
    const stop = probs.filter(p => p.severity === 'showstopper')
    add('failures', 'Agent runs', stop.length ? 'fail' : probs.some(p => p.severity === 'warning') ? 'warn' : 'ok', stop.length ? `${stop.length} error(s) keep stopping work: ${stop.map(p => `${p.signature} (${p.count}x)`).join('; ')}` : probs.length ? `${probs.reduce((n, p) => n + p.count, 0)} failure(s) in 6 h, none stopping work now.` : 'No failed runs in 6 hours.', stop[0]?.hint ?? null)
    return checks
  }

  /** Called by the loop. Model checks every hour (they cost a call each), the rest every 15 minutes. */
  async tick({ force = false } = {}) {
    const h = this.read()
    const live = force || !h.liveAt || Date.now() - new Date(h.liveAt).getTime() > HOUR || (h.checks ?? []).some(c => c.id.startsWith('model:') && c.status !== 'ok')
    this.runsCache = null
    const checks = await this.runChecks({ live })
    const problems = this.lastProblems ?? this.problems()
    const next = { at: now(), liveAt: live ? now() : h.liveAt, checks, problems, alerted: h.alerted ?? {} }
    // alert the owner once per problem (again after 6 hours)
    const alerts = [
      ...problems.filter(p => p.severity === 'showstopper').map(p => ({ key: `p:${p.signature}`, text: `Problem stopping work: "${p.signature}" happened ${p.count} times since ${String(p.first).slice(11, 16)} (agents: ${p.agents.slice(0, 5).join(', ')}).${p.hint ? `\nFix: ${p.hint}` : ''}` })),
      ...checks.filter(c => c.status === 'fail' && c.id !== 'failures').map(c => ({ key: `c:${c.id}`, text: `Health check failing: ${c.name}. ${c.detail}${c.fix ? `\nFix: ${c.fix}` : ''}` })),
    ]
    for (const a of alerts) {
      const last = next.alerted[a.key]
      if (last && Date.now() - new Date(last).getTime() < 6 * HOUR) continue
      next.alerted[a.key] = now()
      this.sa.say({ from: 'system', kind: 'problem', question: true, text: a.text })
    }
    for (const k of Object.keys(next.alerted)) if (Date.now() - new Date(next.alerted[k]).getTime() > 24 * HOUR) delete next.alerted[k]
    this.write(next)
    return next
  }

  /** For the dashboard: the last results, with problems recomputed when stale. */
  view() {
    const h = this.read()
    const problems = this.problems()
    const checks = (h.checks ?? []).map(c => (c.id === 'failures' ? { ...c } : c))
    const fail = checks.filter(c => c.status === 'fail').length + problems.filter(p => p.severity === 'showstopper').length
    const warn = checks.filter(c => c.status === 'warn').length + problems.filter(p => p.severity === 'warning').length
    return { at: h.at ?? null, liveAt: h.liveAt ?? null, checks, problems, status: fail ? 'fail' : warn ? 'warn' : checks.length ? 'ok' : 'unknown', fail, warn }
  }
}
