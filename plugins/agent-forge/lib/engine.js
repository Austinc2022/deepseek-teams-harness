/**
 * Orchestration engine.
 *
 * JS orchestrations (orchestrations/<name>.js):
 *   export const meta = { name, description, team, args: { key: 'description' } }
 *   export default async function ({ agent, parallel, pipeline, phase, log, save, args, run, team }) {
 *     const plan = await agent('planner', `Plan: ${args.task}`, { schema })
 *     ...
 *     return { summary }
 *   }
 *   agent(name, prompt, opts?) -> final text, or the validated object with opts.schema; null on failure.
 *   opts: { label, schema, cwd, model, effort, overrides: {...partial agent def} }
 *   host-only opts (callers inside this process, e.g. the super team driving a chat room):
 *     def (a resolved agent definition instead of the registry's), signal (extra AbortSignal),
 *     contextNote, onEvent (runner events), full (return the whole runAgent result, even on failure)
 *
 * YAML orchestrations (orchestrations/<name>.yaml): ordered stages; each stage
 * is one agent or a `parallel:` list; prompts use {{args.x}}, {{stages.<id>}},
 * {{date}}; `foreach: stages.<id>.<field>` fans a stage out over an array.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import YAML from 'yaml'
import { runAgent } from './runner.js'
import { deepMerge, normalizeAgent } from './registry.js'

class Semaphore {
  constructor(n) { this.n = n; this.q = [] }
  async acquire() {
    if (this.n > 0) { this.n--; return }
    await new Promise(r => this.q.push(r))
  }
  release() { const r = this.q.shift(); if (r) r(); else this.n++ }
}

const runIdNow = () => `${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')}-${crypto.randomBytes(2).toString('hex')}`

export class Engine {
  constructor(registry, { maxParallel = Number(process.env.FORGE_MAX_PARALLEL ?? 4), log = () => {} } = {}) {
    this.registry = registry
    this.maxParallel = maxParallel
    this.log = log
    this.active = new Map()
  }

  listRuns(limit = 50) {
    const dir = this.registry.d.runs
    return fs.readdirSync(dir).filter(n => fs.existsSync(path.join(dir, n, 'run.json'))).sort().reverse().slice(0, limit).map(id => {
      const r = this.getRun(id)
      return { id, orchestration: r.orchestration, status: r.status, startedAt: r.startedAt, endedAt: r.endedAt, phase: r.phase, agents: r.agents.length, costUsd: r.costUsd }
    })
  }

  getRun(id) {
    if (!/^[\w-]+$/.test(id)) throw new Error('bad run id')
    const live = this.active.get(id)
    if (live) return live.state
    const f = path.join(this.registry.d.runs, id, 'run.json')
    if (!fs.existsSync(f)) throw new Error(`unknown run ${id}`)
    return JSON.parse(fs.readFileSync(f, 'utf8'))
  }

  readRunFile(id, rel) {
    const dir = path.join(this.registry.d.runs, id)
    const full = path.resolve(dir, rel)
    if (!full.startsWith(dir + path.sep)) throw new Error('path escapes run directory')
    return fs.readFileSync(full, 'utf8')
  }

  cancel(id) {
    const live = this.active.get(id)
    if (!live) return false
    live.abort.abort()
    return true
  }

  /** Start an orchestration; returns { id, done } where done resolves to the final run state. */
  start(name, args = {}, { cwd } = {}) {
    const { format } = this.registry.orchestrationFile(name)
    return this.#launch(name, format, args, cwd, async (api, state) => {
      const r = await runNamed(this.registry, name, api, args)
      state.team = r.team
      return r.result
    })
  }

  /**
   * Start a run whose body is a function instead of a saved orchestration
   * (used by the Projects page to run a task's own sequence of agents and
   * workflows). It gets the same run folder, transcripts, live state and
   * Runs-tab entry as any orchestration. fn(api, state) returns the result.
   */
  startCustom(label, fn, args = {}, { cwd, meta } = {}) {
    return this.#launch(label, 'custom', args, cwd, fn, meta)
  }

  #launch(name, format, args, cwd, body, meta) {
    const id = runIdNow()
    const dir = path.join(this.registry.d.runs, id)
    fs.mkdirSync(path.join(dir, 'agents'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true })
    const state = { id, orchestration: name, format, ...(meta ? { meta } : {}), args, cwd: cwd ?? null, status: 'running', startedAt: new Date().toISOString(), endedAt: null, phase: null, phases: [], log: [], agents: [], result: null, error: null, costUsd: 0 }
    const abort = new AbortController()
    const live = { state, abort, dir }
    this.active.set(id, live)
    const persist = () => fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(state, null, 2))
    persist()
    live.persist = persist

    const done = (async () => {
      try {
        const api = this.#api(live, cwd)
        const result = await body(api, state)
        state.result = result ?? null
        state.status = abort.signal.aborted ? 'cancelled' : 'completed'
      } catch (e) {
        state.status = abort.signal.aborted ? 'cancelled' : 'failed'
        state.error = e?.stack ?? String(e)
      } finally {
        state.endedAt = new Date().toISOString()
        persist()
        if (state.result != null) fs.writeFileSync(path.join(dir, 'result.' + (typeof state.result === 'string' ? 'md' : 'json')), typeof state.result === 'string' ? state.result : JSON.stringify(state.result, null, 2))
        this.active.delete(id)
        this.log(`run ${id} ${state.status}`)
      }
      return state
    })()
    return { id, dir, done }
  }

  #api(live, defaultCwd) {
    const { state, abort, dir, persist } = live
    const sem = new Semaphore(this.maxParallel)
    const registry = this.registry
    let seq = 0
    const log = msg => { state.log.push({ ts: new Date().toISOString(), msg: String(msg) }); persist() }
    const phase = title => { state.phase = title; state.phases.push({ title, ts: new Date().toISOString() }); persist() }

    const agent = async (name, prompt, opts = {}) => {
      if (abort.signal.aborted) return null
      let def = opts.def ?? registry.getAgent(name)
      const overrides = { ...(opts.overrides ?? {}) }
      if (opts.model) overrides.model = opts.model
      if (opts.effort) overrides.effort = opts.effort
      if (Object.keys(overrides).length) def = normalizeAgent(deepMerge(def, overrides))
      const n = ++seq
      const label = opts.label ?? name
      const file = `agents/${String(n).padStart(3, '0')}-${label.replace(/[^\w.-]+/g, '_').slice(0, 60)}.md`
      const entry = { n, label, agent: name, model: def.model, phase: state.phase, status: 'queued', file, startedAt: null, endedAt: null, lastTool: null, tools: 0, costUsd: null, error: null }
      state.agents.push(entry)
      persist()
      await sem.acquire()
      try {
        if (abort.signal.aborted || opts.signal?.aborted) { entry.status = 'cancelled'; return null }
        entry.status = 'running'
        entry.startedAt = new Date().toISOString()
        persist()
        const res = await runAgent({
          def, registry, prompt, schema: opts.schema, cwd: opts.cwd ?? defaultCwd, team: opts.team ?? state.team,
          runId: state.id, label, signal: opts.signal ? AbortSignal.any([abort.signal, opts.signal]) : abort.signal, transcriptFile: path.join(dir, file),
          ...(opts.contextNote ? { contextNote: opts.contextNote } : {}),
          onEvent: e => { if (e.type === 'tool') { entry.tools++; entry.lastTool = e.brief; if (entry.tools % 3 === 1) persist() } opts.onEvent?.(e) },
        })
        entry.status = res.ok ? 'completed' : 'failed'
        entry.error = res.error ?? null
        entry.costUsd = res.costUsd ?? null
        entry.turns = res.turns
        if (res.costUsd) state.costUsd = Math.round((state.costUsd + res.costUsd) * 10000) / 10000
        if (opts.full) return res
        if (!res.ok) return null
        if (opts.schema) return res.structured ?? tryJson(res.text)
        return res.text
      } finally {
        entry.endedAt = new Date().toISOString()
        persist()
        sem.release()
      }
    }

    const parallel = thunks => Promise.all(thunks.map(t => Promise.resolve().then(t).catch(e => { log(`parallel task failed: ${e.message}`); return null })))
    const pipeline = (items, ...stages) => Promise.all(items.map(async (item, i) => {
      let v = item
      for (const s of stages) {
        if (v === null) return null
        try { v = await s(v, item, i) } catch (e) { log(`pipeline item ${i} failed: ${e.message}`); return null }
      }
      return v
    }))
    const save = (rel, content) => {
      const full = path.resolve(dir, 'artifacts', rel)
      if (!full.startsWith(path.join(dir, 'artifacts') + path.sep)) throw new Error('save path escapes artifacts directory')
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
      return full
    }
    const team = name => registry.getTeam(name)
    return {
      agent, parallel, pipeline, phase, log, save, team,
      args: state.args,
      run: { id: state.id, dir, artifacts: path.join(dir, 'artifacts'), cwd: defaultCwd ?? registry.d.workspaces, home: registry.home, reports: registry.d.reports },
      signal: abort.signal,
    }
  }
}

/**
 * Run a saved orchestration (YAML or JS) on an existing run api with its own
 * args, so one run can contain several workflows. Returns { result, team }.
 */
export async function runNamed(registry, name, api, args = {}) {
  const { file, format } = registry.orchestrationFile(name)
  const sub = { ...api, args }
  if (format === 'js') {
    const mod = await import(`${pathToFileURL(file).href}?v=${fs.statSync(file).mtimeMs}`)
    const fn = mod.default ?? mod.run
    if (typeof fn !== 'function') throw new Error(`${name}.js must export a default async function`)
    return { result: await fn(sub), team: mod.meta?.team }
  }
  const spec = YAML.parse(fs.readFileSync(file, 'utf8'))
  return { result: await runYaml(spec, sub), team: spec.team }
}

function tryJson(t) {
  if (typeof t !== 'string') return t
  const m = t.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  try { return JSON.parse(m?.[0] ?? t) } catch { return null }
}

function getPath(obj, p) {
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

export function renderTemplate(tpl, ctx) {
  return String(tpl).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => {
    const v = getPath(ctx, key)
    if (v === undefined || v === null) return ''
    if (typeof v === 'string') return v
    if (Array.isArray(v) && v.every(x => typeof x === 'string' || x === null)) return v.map((x, i) => `--- result ${i + 1} ---\n${x ?? '(failed)'}`).join('\n\n')
    return JSON.stringify(v, null, 2)
  })
}

async function runYaml(spec, api) {
  const stages = {}
  const ctx = () => ({ args: api.args, stages, date: new Date().toISOString().slice(0, 10), run: api.run })
  for (const s of spec.stages) {
    api.phase(s.title ?? s.id)
    const opts = st => ({ label: st.label ?? `${s.id}:${st.agent}`, schema: st.schema, model: st.model, effort: st.effort, cwd: st.cwd ? renderTemplate(st.cwd, ctx()) : undefined })
    if (s.foreach) {
      const items = getPath(ctx(), s.foreach)
      if (!Array.isArray(items)) throw new Error(`stage ${s.id}: foreach ${s.foreach} is not an array`)
      stages[s.id] = await api.parallel(items.map((item, i) => () => api.agent(s.agent, renderTemplate(s.prompt, { ...ctx(), item, index: i }), { ...opts(s), label: `${s.id}[${i}]` })))
    } else if (s.parallel) {
      stages[s.id] = await api.parallel(s.parallel.map(st => () => api.agent(st.agent, renderTemplate(st.prompt, ctx()), opts(st))))
    } else {
      stages[s.id] = await api.agent(s.agent, renderTemplate(s.prompt, ctx()), opts(s))
      if (stages[s.id] === null && s.required !== false) throw new Error(`stage ${s.id} (${s.agent}) failed`)
    }
    if (s.save) api.save(renderTemplate(s.save, ctx()), typeof stages[s.id] === 'string' ? stages[s.id] : JSON.stringify(stages[s.id], null, 2))
  }
  const last = spec.stages[spec.stages.length - 1].id
  return spec.output ? renderTemplate(spec.output, ctx()) : stages[last]
}
