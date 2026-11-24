/**
 * Training camp: turns a goal into a workflow, trains the agents and the team that run it, verifies them on a
 * sealed set, and publishes the ones that pass into Agent Forge.
 *
 *   draft      a goal, no workflow yet
 *   workflow   a workflow is proposed and waits for the owner: ask for changes (revise), edit it, or approve it
 *   approved   the owner approved this version; training can start
 *   training   skills scout -> datasets -> baseline -> rounds per role -> verify roles -> train and verify the team
 *   paused     stopped by the budget, a subscription limit, an error or the owner; `train` resumes from the cache
 *   ready      every trained role (and the team) passed the criteria; waits for the owner to publish
 *   not-passed at least one did not pass; the report says which and why
 *   published  agents, teams and the workflow are in forge/ (the previous files are in the camp's backup)
 *
 * The owner can ask for a workflow change at any time. A new version always needs a new approval; on approval,
 * roles whose job did not change keep their datasets and results, the others start again.
 */
import fs from 'node:fs'
import path from 'node:path'
import { deepMerge, normalizeAgent } from '../../agent-forge/lib/registry.js'
import { listSkills } from '../../agent-forge/lib/skills.js'
import { openMemory } from '../../agent-forge/lib/memory.js'
import { Store, CAMP_ID, now, newId, hash, clip, slug, readJson, writeJson, mean, round } from './store.js'
import { makeCtx, TEAM, Paused } from './evaluate.js'
import { WORKFLOW_SCHEMA, normalizeWorkflow, mergeRevision, roleContract, workflowText, proposePrompt, revisePrompt, orchestrationSource } from './workflow.js'
import { ensureRoleSets, ensureTeamSets, roleStages } from './datasets.js'
import { initialDef, scoutSkills, equipRoles, installScouted, trainRole, verifyRole, trainTeam, verifyTeam } from './optimize.js'

export const DEFAULTS = {
  budgetUsd: 20,            // the camp pauses when its estimated spend reaches this
  maxCalls: 1200,           // and when it has made this many model calls (a trial is two: the agent and the judge)
  trialMinutes: 15,         // an analyst's time for one task; a builder gets three times this
  parallelAgents: 4,        // how many agents are trained at the same time
  parallelCalls: 8,         // how many model calls the camp makes at the same time
  dataset: { train: 5, dev: 4, holdout: 4 },
  rounds: 2, candidates: 2, patience: 2,
  target: 0.9,              // stop training a role once its dev score reaches this
  minGain: 0.02,            // a candidate must beat the current best on dev by this much
  criteria: { minScore: 0.7, maxGap: 0.2, noise: 0.02 },
  verify: { trials: 1 },
  // what a trainee may use inside a trial besides its own tools: the web, and writing itself skills and tools
  // (the camp reviews those and tries them, measured). Both on; switch one off per camp when it costs more than it gives
  trial: { web: true, selfLearning: true },
  team: { enabled: true, dev: 2, holdout: 2, rounds: 1, candidates: 1 },
  roles: [],                // train only these roles; empty = all
  // Free models by default. On the Claude subscription use e.g. allowedModels haiku/sonnet/opus, trainee sonnet,
  // and a judge and sealer on a different model from the trainee (opus).
  allowedModels: ['combo:recommended-free', 'deepseek-v4.1-flash-free', 'hy4-flash-free', 'mimo-v2.6-flash-free', 'big-pickle'],
  trainee: { backend: 'claude-code', provider: 'free', model: 'combo:recommended-free', effort: 'high' },
  staff: { default: { backend: 'claude-code', provider: 'free', model: 'combo:recommended-free', effort: 'medium' }, judge: { model: 'deepseek-v4.1-flash-free' }, sealer: { model: 'hy4-flash-free' } },
  scout: { enabled: true, max: 6, allowOwners: ['anthropics'], assign: true, maxPerRole: 8, perRole: true, perRoleMax: 2 },
  publish: { workflowName: '', auto: false },
}

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d }
const int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d))

function cleanSettings(s) {
  const m = deepMerge(DEFAULTS, s ?? {})
  const D = DEFAULTS
  const strs = (v, d) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 40) : d)
  return {
    budgetUsd: num(m.budgetUsd, 0, 100000, D.budgetUsd), maxCalls: int(m.maxCalls, 1, 100000, D.maxCalls), trialMinutes: num(m.trialMinutes, 1, 240, D.trialMinutes),
    parallelAgents: int(m.parallelAgents, 1, 32, D.parallelAgents), parallelCalls: int(m.parallelCalls, 1, 48, D.parallelCalls),
    dataset: { train: int(m.dataset?.train, 2, 60, 5), dev: int(m.dataset?.dev, 2, 60, 4), holdout: int(m.dataset?.holdout, 2, 60, 4) },
    rounds: int(m.rounds, 0, 20, D.rounds), candidates: int(m.candidates, 1, 6, D.candidates), patience: int(m.patience, 1, 20, D.patience),
    target: num(m.target, 0, 1, D.target), minGain: num(m.minGain, 0, 1, D.minGain),
    criteria: { minScore: num(m.criteria?.minScore, 0, 1, 0.7), maxGap: num(m.criteria?.maxGap, 0, 1, 0.2), noise: num(m.criteria?.noise, 0, 0.5, 0.02) },
    verify: { trials: int(m.verify?.trials, 1, 5, 1) },
    trial: { web: m.trial?.web !== false, selfLearning: m.trial?.selfLearning !== false },
    team: { enabled: m.team?.enabled !== false, dev: int(m.team?.dev, 1, 20, 2), holdout: int(m.team?.holdout, 1, 20, 2), rounds: int(m.team?.rounds, 0, 10, 1), candidates: int(m.team?.candidates, 1, 3, 1) },
    roles: strs(m.roles, []), allowedModels: strs(m.allowedModels, D.allowedModels),
    trainee: m.trainee && typeof m.trainee === 'object' ? m.trainee : D.trainee,
    staff: m.staff && typeof m.staff === 'object' ? m.staff : D.staff,
    scout: { enabled: m.scout?.enabled !== false, max: int(m.scout?.max, 0, 20, 6), allowOwners: strs(m.scout?.allowOwners, D.scout.allowOwners), assign: m.scout?.assign !== false, maxPerRole: int(m.scout?.maxPerRole, 0, 16, 8), perRole: m.scout?.perRole !== false, perRoleMax: int(m.scout?.perRoleMax, 1, 6, 2) },
    publish: { workflowName: slug(m.publish?.workflowName ?? '', 44).replace(/^camp$/, ''), auto: m.publish?.auto === true },
  }
}

const pidAlive = pid => { try { process.kill(pid, 0); return true } catch { return false } }

export class Camps {
  constructor(forge, { log = () => {} } = {}) {
    // set by the company when there is one (plugins/super-agent/lib/camp-link.js): its skill scout, its audited
    // skill install, what its own skill trials found, and where a camp's measured skill results go
    this.hooks = {}
    this.forge = forge
    this.registry = forge.registry
    this.engine = forge.engine
    this.store = new Store(forge.registry.home)
    this.log = log
  }

  // ---------------------------------------------------------------- reading

  list() {
    return this.store.list().map(c => ({ id: c.id, name: c.name, goal: clip(c.goal, 300), status: c.status, busy: this.#busy(c), workflowVersion: c.workflowVersion, spend: c.spend, createdAt: c.createdAt, updatedAt: c.updatedAt }))
  }

  get(id) {
    let c = this.store.read(id)
    const busy = this.#busy(c)
    // the process that ran the camp is gone (harness stopped or restarted): say so, and let training resume
    if (!busy && (c.active || c.status === 'training')) {
      c = this.store.update(id, x => {
        const was = x.active?.what
        delete x.active
        if (x.status === 'training') { x.status = 'paused'; x.pause = { reason: 'the harness stopped or was restarted while training ran; nothing finished is lost', ts: now() } }
        x.log.push({ ts: now(), msg: `${was ?? 'training'} was interrupted: the process that ran it ended` })
      })
    }
    let run = null
    const last = c.active?.runId ?? c.runs.at(-1)?.id
    if (last) {
      try {
        const st = this.engine.getRun(last)
        run = { id: st.id, what: st.orchestration, status: busy ? 'running' : st.status === 'running' ? 'interrupted' : st.status, phase: st.phase, costUsd: st.costUsd, startedAt: st.startedAt, endedAt: st.endedAt, error: st.error ? String(st.error).split('\n')[0] : null, log: (st.log ?? []).slice(-10), running: (st.agents ?? []).filter(a => a.status === 'running').map(a => ({ label: a.label, model: a.model, lastTool: a.lastTool })), agents: (st.agents ?? []).length,
          // everything that runs or waits for a free slot right now, for the agent pages
          live: (st.agents ?? []).filter(a => a.status === 'running' || a.status === 'queued').map(a => ({ label: a.label, status: a.status, startedAt: a.startedAt, lastTool: a.lastTool, tools: a.tools })) }
      } catch {}
    }
    const sets = {}
    for (const k of [...Object.keys(c.roles), TEAM]) sets[k] = { train: this.store.tasks(id, k, 'train').length, dev: this.store.tasks(id, k, 'dev').length, holdout: this.store.tasks(id, k, 'holdout').length }
    return { ...c, busy, run, sets, log: c.log.slice(-60), report: this.report(id) }
  }

  workflowVersions(id) {
    const c = this.store.read(id)
    return c.workflowHistory.map(h => ({ ...h, workflow: readJson(this.store.dir(id, `workflow.v${h.version}.json`)) }))
  }

  trials(id, role) {
    const titles = {}
    for (const s of ['train', 'dev']) for (const t of this.store.tasks(id, role, s)) titles[t.id] = t.title
    return this.store.trials(id).filter(t => t.role === role).map(t => ({ cand: t.cand, task: t.task, title: t.split === 'holdout' ? '(sealed)' : titles[t.task] ?? t.task, split: t.split, n: t.n, score: t.score, ok: t.ok, ...(t.void ? { void: true } : {}), ...(t.partial ? { partial: true } : {}), error: t.error, costUsd: t.costUsd, turns: t.turns, ms: t.ms, problems: t.split === 'holdout' ? [] : t.judge?.problems ?? [], ts: t.ts }))
  }

  candidate(id, role, cid) { return this.store.candidate(id, role, cid) }

  /**
   * Training seen per workflow step: who works on it, the tasks written for it, what each configuration scored on
   * it, and what was done. Tasks written before tasks carried a step count for every step of their role.
   */
  steps(id) {
    const c = this.store.read(id)
    if (!c.workflow) return []
    const trials = this.store.trials(id).filter(t => !t.void)
    const avg = rows => (rows.length ? round(mean(rows.map(r => r.score)), 2) : null)
    const out = c.workflow.stages.map(s => {
      const people = [{ role: s.role, as: 'owner' }, ...(s.reviewer ? [{ role: s.reviewer, as: 'reviewer' }] : [])].map(p => {
        const st = c.roles[p.role] ?? {}
        const many = roleStages(c.workflow, p.role).length > 1
        const mine = t => !many || !t.stage || t.stage === s.id
        const sets = Object.fromEntries(['train', 'dev', 'holdout'].map(k => [k, this.store.tasks(id, p.role, k).filter(mine)]))
        const tr = trials.filter(t => t.role === p.role && mine(t))
        const of = (cand, split) => avg(tr.filter(t => t.cand === cand && t.split === split))
        const best = st.best?.id ?? 'base'
        const chosen = st.verify?.chosen ?? best
        const done = []
        if (sets.train.length) done.push(`${sets.train.length} practice, ${sets.dev.length} dev and ${sets.holdout.length} sealed tasks written`)
        if (st.baseline) done.push(`starting configuration measured: dev ${of('base', 'dev') ?? '-'} on this step`)
        for (const r of st.rounds ?? []) done.push(`round ${r.n}: ${r.candidates.length ? r.candidates.map(k => `${k.lever} (${k.id})`).join(', ') : 'no usable proposal'}; ${r.accepted ? `${r.promoted} accepted` : 'nothing accepted'}`)
        if (st.verify) done.push(`verified on the sealed set: ${of(chosen, 'holdout') ?? st.verify.score} on this step; the role as a whole ${st.verify.passed ? 'passed' : 'did not pass'}`)
        return {
          ...p, status: st.status ?? 'not started', shared: many && [...sets.train, ...sets.dev].some(t => !t.stage),
          counts: { train: sets.train.length, dev: sets.dev.length, holdout: sets.holdout.length },
          scores: { baselineTrain: of('base', 'train'), baselineDev: of('base', 'dev'), bestId: best, bestTrain: of(best, 'train'), bestDev: of(best, 'dev'), sealed: st.verify ? of(chosen, 'holdout') : null },
          verdict: st.verify ? { passed: st.verify.passed, chosen } : null, done,
        }
      })
      return { id: s.id, title: s.title, kind: s.kind, people }
    })
    return out
  }

  /** The tasks of a role, for the owner to read. The sealed set stays sealed: only how many it has. */
  tasks(id, role, stage) {
    const c = this.store.read(id)
    const many = role !== TEAM && c.workflow ? roleStages(c.workflow, role).length > 1 : false
    const mine = t => !stage || !many || !t.stage || t.stage === stage
    return {
      train: this.store.tasks(id, role, 'train').filter(mine), dev: this.store.tasks(id, role, 'dev').filter(mine),
      sealed: this.store.tasks(id, role, 'holdout').filter(mine).length,
    }
  }

  /** Everything recorded about the trials of a role on one step: scores per criterion, defects, the answer, the folder. */
  trialDetails(id, role, stage) {
    const c = this.store.read(id)
    const many = role !== TEAM && c.workflow ? roleStages(c.workflow, role).length > 1 : false
    const titles = {}
    for (const k of ['train', 'dev']) for (const t of this.store.tasks(id, role, k)) titles[t.id] = t.title
    return this.store.trials(id).filter(t => t.role === role && (!stage || !many || !t.stage || t.stage === stage)).map(t => {
      const sealed = t.split === 'holdout'
      return { cand: t.cand, task: t.task, title: sealed ? '(sealed task)' : titles[t.task] ?? t.task, split: t.split, n: t.n, score: t.score, ok: t.ok, ...(t.void ? { void: true } : {}), ...(t.partial ? { partial: true } : {}), error: t.error, costUsd: t.costUsd, turns: t.turns, seconds: t.ms ? Math.round(t.ms / 1000) : null, ts: t.ts,
        checks: t.checks ?? [], criteria: t.judge?.scores ?? [], problems: sealed ? [] : t.judge?.problems ?? [], answer: sealed ? '' : t.excerpt ?? '', folder: t.work ? path.join(this.store.dir(id), t.work) : null }
    })
  }

  /** The scoreboard as text: what was trained, what it scored, what passed and why not. */
  report(id) {
    const c = this.store.read(id)
    const f = v => (v == null ? '-' : Number(v).toFixed(2))
    const lines = [`Camp ${c.id} "${c.name}": ${c.status}; workflow v${c.workflowVersion}${c.approvedVersion === c.workflowVersion ? ' (approved)' : ' (not approved)'}; spend about $${c.spend.usd} in ${c.spend.calls} model calls (budget $${c.settings.budgetUsd})`]
    if (c.pause) lines.push(`Paused: ${c.pause.reason}`)
    if (!c.workflow) return [...lines, 'No workflow yet: run propose.'].join('\n')
    const rows = c.workflow.roles.map(r => {
      const s = c.roles[r.name] ?? {}
      const v = s.verify
      return `  ${r.name.padEnd(30)} ${String(s.status ?? 'not trained').padEnd(11)} baseline dev ${f(s.baseline?.dev)}  best dev ${f(s.best?.dev)} (${s.best?.id ?? '-'})  verification ${f(v?.score)}  ${v ? (v.passed ? 'PASSED' : 'NOT PASSED') : ''}${v?.reasons?.length ? `\n      ${v.reasons.join('\n      ')}` : ''}`
    })
    lines.push('', 'Roles:', ...rows)
    if (c.team?.baseline) lines.push('', `Team: baseline dev ${f(c.team.baseline.dev)}  best dev ${f(c.team.best?.dev)} (${c.team.best?.id})  verification ${f(c.team.verify?.score)}  ${c.team.verify ? (c.team.verify.passed ? 'PASSED' : 'NOT PASSED') : ''}${c.team.verify?.reasons?.length ? `\n      ${c.team.verify.reasons.join('\n      ')}` : ''}`)
    const pending = (c.scout?.skills ?? []).filter(s => s.status === 'pending')
    if (pending.length) lines.push('', 'Skills found on GitHub that wait for your approval:', ...pending.map(s => `  ${c.scout.skills.indexOf(s)}  ${s.source}: ${s.why}`))
    if (c.published) lines.push('', `Published ${c.published.ts.slice(0, 16)}: agents ${c.published.agents.join(', ') || '-'}; teams ${c.published.teams.join(', ') || '-'}; workflow "${c.published.orchestration}"${c.published.skipped.length ? `; left as they were: ${c.published.skipped.join(', ')}` : ''}`)
    return lines.join('\n')
  }

  // ---------------------------------------------------------------- the owner's actions

  create({ goal, name, hint, settings } = {}) {
    goal = String(goal ?? '').trim()
    if (goal.length < 10) throw new Error('describe the goal in at least a sentence')
    const id = newId('c')
    const camp = {
      id, name: String(name ?? '').trim().slice(0, 60) || clip(goal.replace(/\s+/g, ' '), 48).replace(/\n.*/s, ''), goal: goal.slice(0, 8000), hint: String(hint ?? '').trim().slice(0, 8000),
      status: 'draft', createdAt: now(), settings: cleanSettings(settings),
      workflow: null, workflowVersion: 0, approvedVersion: 0, workflowHistory: [],
      roles: {}, team: { status: 'new', rounds: [] }, spend: { usd: 0, calls: 0 }, runs: [], log: [],
    }
    fs.mkdirSync(this.store.dir(id, 'work', 'staff'), { recursive: true })
    return this.store.write(camp)
  }

  /** `by`: 'owner' (the page, the CLI) or who else changed it. How many agents and calls the owner chose is remembered as the speed to return to. */
  updateSettings(id, patch, { by = 'owner' } = {}) {
    return this.store.update(id, c => {
      c.settings = cleanSettings(deepMerge(c.settings, patch ?? {}))
      if (by === 'owner' && (patch?.parallelAgents != null || patch?.parallelCalls != null)) c.protect = { ...(c.protect ?? {}), parallel: { agents: c.settings.parallelAgents, calls: c.settings.parallelCalls } }
    }).settings
  }

  remove(id) {
    if (this.#busy(this.store.read(id))) throw new Error('the camp is busy; stop it first')
    this.store.remove(id)
    return { ok: true }
  }

  /** Ask the architect for the first workflow. */
  propose(id) {
    return this.#start(id, 'propose workflow', async ctx => {
      const c = ctx.camp
      const v = await ctx.ask('architect', proposePrompt({ goal: c.goal, hint: c.hint, catalog: this.#catalog() }), WORKFLOW_SCHEMA, 'architect')
      const wf = normalizeWorkflow(v, this.#checks())
      this.#saveWorkflow(id, wf, { by: 'architect', note: 'first proposal' })
      return workflowText(wf)
    })
  }

  /** Ask for a change to the workflow in plain words. Produces a new version that needs approval. */
  revise(id, feedback) {
    feedback = String(feedback ?? '').trim()
    if (!feedback) throw new Error('say what should change')
    if (!this.store.read(id).workflow) throw new Error('there is no workflow yet; run propose first')
    return this.#start(id, 'revise workflow', async ctx => {
      const c = ctx.camp
      const history = c.workflowHistory.filter(h => h.by === 'owner request').map(h => h.note)
      const v = await ctx.ask('architect', revisePrompt({ goal: c.goal, workflow: c.workflow, feedback, history, catalog: this.#catalog() }), WORKFLOW_SCHEMA, 'architect:revise')
      const wf = normalizeWorkflow(mergeRevision(c.workflow, v), this.#checks())
      this.#saveWorkflow(id, wf, { by: 'owner request', note: clip(feedback, 1000), changes: (v.changes ?? []).map(x => clip(x, 400)).slice(0, 12) })
      return `${(v.changes ?? []).map(x => `- ${x}`).join('\n')}\n\n${workflowText(wf)}`
    })
  }

  /** Replace the workflow with the owner's own edit. */
  setWorkflow(id, workflow, note = 'edited by hand') {
    if (this.#busy(this.store.read(id))) throw new Error('the camp is busy; stop it first')
    const wf = normalizeWorkflow(workflow, this.#checks())
    this.#saveWorkflow(id, wf, { by: 'owner edit', note: clip(note, 300) })
    return this.store.read(id)
  }

  /** Go back to an earlier version (it becomes a new version that needs approval). */
  restoreWorkflow(id, version) {
    const wf = readJson(this.store.dir(id, `workflow.v${Number(version)}.json`))
    if (!wf) throw new Error(`no workflow version ${version}`)
    return this.setWorkflow(id, wf, `restored version ${version}`)
  }

  /** Approve the current workflow. Roles whose job is unchanged keep their datasets and results. */
  approve(id) {
    const c0 = this.store.read(id)
    if (!c0.workflow) throw new Error('there is no workflow to approve')
    if (this.#busy(c0)) throw new Error('the camp is busy; stop it first')
    const wf = c0.workflow
    const kept = [], reset = []
    const camp = this.store.update(id, c => {
      for (const name of Object.keys(c.roles)) {
        if (!wf.roles.some(r => r.name === name)) { this.#dropRole(id, name, true); delete c.roles[name] }
      }
      let changed = false
      for (const r of wf.roles) {
        const contract = roleContract(wf, r.name)
        const seed = hash({ base: r.base, role: r.role, kind: r.kind, skills: r.skills })
        const st = c.roles[r.name]
        if (st && st.contract === contract && st.seed === seed) { kept.push(r.name); continue }
        this.#dropRole(id, r.name, !st || st.contract !== contract)
        c.roles[r.name] = { contract, seed, status: 'new', rounds: [] }
        reset.push(r.name)
        changed = true
      }
      const teamContract = hash(wf.stages)
      if (changed || c.team.contract !== teamContract) { this.#dropRole(id, TEAM, c.team.contract !== teamContract); c.team = { contract: teamContract, status: 'new', rounds: [] } }
      c.approvedVersion = c.workflowVersion
      c.status = 'approved'
      delete c.pause
      c.log.push({ ts: now(), msg: `workflow v${c.workflowVersion} approved${kept.length ? `; kept the training of ${kept.join(', ')}` : ''}` })
    })
    return { camp, kept, reset }
  }

  /** Start or resume training. */
  train(id, { roles } = {}) {
    const c0 = this.store.read(id)
    if (!c0.workflow || c0.approvedVersion !== c0.workflowVersion) throw new Error('approve the workflow first')
    if (Array.isArray(roles)) this.updateSettings(id, { roles })
    return this.#start(id, 'train', async ctx => {
      this.store.update(id, c => { c.status = 'training'; delete c.pause; delete c.pauseBy; delete c.drain })
      const wf = ctx.camp.workflow
      const S = ctx.settings
      const want = S.roles.length ? wf.roles.filter(r => S.roles.includes(r.name)) : wf.roles
      if (!want.length) throw new Error(`settings.roles names no role of the workflow (${wf.roles.map(r => r.name).join(', ')})`)

      ctx.api.phase('Skills')
      await scoutSkills(ctx)
      await equipRoles(ctx, want)

      for (const r of wf.roles) {
        const file = ctx.dir('candidates', r.name, 'base.json')
        const def = initialDef(this.registry, S, r)
        const old = readJson(file)
        // The starting point is fixed once it exists. It is made again only when the owner changes the camp's trainee
        // model before the role has a first score. It must not follow the live agent it was copied from: that agent
        // keeps learning skills while the camp runs, and every such change used to throw away the role's finished trials.
        const from = hash(S.trainee ?? {})
        if (old && (old.kept || ctx.camp.roles[r.name].baseline || old.from === undefined || old.from === from)) { if (old.from === undefined) ctx.store.saveCandidate(id, r.name, { ...old, from }); continue }
        if (old) { this.store.dropTrials(id, r.name); ctx.log(`${r.name}: the trainee model changed before its first score, so it starts again from the new one`) }
        ctx.store.saveCandidate(id, r.name, { id: 'base', parent: null, lever: 'base', from, why: 'the starting configuration: the existing agent as it is, or the architect\'s first draft', def, lessons: [], ts: now() })
      }

      ctx.api.phase('Datasets')
      // one role's error must not stop the others: it is counted, retried on the next run, and after 3 the role is
      // closed as failed so the camp can finish and say so. A pause (limit, budget, stop) still stops everything.
      const MAX_ERRORS = 3
      const troubled = []
      const trouble = (r, e, where) => {
        if (e?.pause) throw e
        const msg = clip(e?.message ?? e, 400)
        const n = this.store.update(id, x => { const st = x.roles[r.name]; st.errors = (st.errors ?? 0) + 1; st.lastError = { where, message: msg, ts: now() } }).roles[r.name].errors
        ctx.log(`${r.name}: ${where} failed (${n} of ${MAX_ERRORS}): ${msg}`)
        if (n >= MAX_ERRORS) this.store.update(id, x => { const st = x.roles[r.name]; st.status = 'failed'; st.verify = { passed: false, score: null, error: msg, ts: now() } })
        else troubled.push(r.name)
      }
      const made = await Promise.allSettled(want.map(r => ensureRoleSets(ctx, r)))
      const pausedSet = made.find(m => m.status === 'rejected' && m.reason?.pause)
      if (pausedSet) throw pausedSet.reason
      const noSets = new Set()
      made.forEach((m, i) => { if (m.status === 'rejected') { noSets.add(want[i].name); trouble(want[i], m.reason, 'writing its tasks') } })
      ctx.log(`datasets ready for ${want.length - noSets.size} role${want.length - noSets.size === 1 ? '' : 's'}`)

      // agents are trained and verified side by side, settings.parallelAgents at a time
      ctx.api.phase('Training and verifying agents')
      const quiet = Object.create(ctx)
      quiet.api = { ...ctx.api, phase() {} }
      const queue = want.filter(r => !ctx.camp.roles[r.name].verify && !noSets.has(r.name))
      let stop = null
      const worker = async () => {
        while (queue.length && !stop) {
          const r = queue.shift()
          try { await trainRole(quiet, r); await verifyRole(quiet, r); this.store.update(id, x => { delete x.roles[r.name].errors; delete x.roles[r.name].lastError }) }
          catch (e) { try { trouble(r, e, 'training') } catch (p) { stop ??= p } }
        }
      }
      await Promise.all(Array.from({ length: Math.min(S.parallelAgents, queue.length) }, worker))
      if (stop) throw stop
      // roles that hit an error are tried again: the camp pauses, and whoever watches it (the leaders' loop, or you) resumes it
      if (troubled.length) throw new Paused(`error in ${troubled.length} role${troubled.length === 1 ? '' : 's'} (${troubled.slice(0, 6).join(', ')}); the rest is done and they are tried again on the next run. Last: ${ctx.camp.roles[troubled[0]].lastError?.message}`)

      const team = S.team.enabled && wf.stages.length > 1
      if (team) {
        ctx.api.phase('Team datasets')
        await ensureTeamSets(ctx)
        if (!ctx.camp.team.verify) await trainTeam(ctx)
        await verifyTeam(ctx)
      }

      const c = ctx.camp
      const ok = want.every(r => c.roles[r.name].verify?.passed) && (!team || c.team.verify?.passed)
      this.store.update(id, x => { x.status = ok ? 'ready' : 'not-passed' })
      ctx.log(ok ? 'every trained role and the team passed: ready to publish' : 'training finished, but not everything passed the criteria')
      if (ok && S.publish.auto) { const p = this.publish(id); ctx.log(`published: ${p.agents.join(', ')}`) }
      const report = this.report(id)
      fs.writeFileSync(ctx.dir('report.md'), `# Training camp report\n\n\`\`\`\n${report}\n\`\`\`\n`)
      return report
    })
  }

  /** Finish what is running and start nothing new: the camp pauses by itself within one trial's time. For restarts. */
  drain(id) {
    const c = this.store.read(id)
    if (!this.#busy(c)) return { ok: false, note: 'nothing is running' }
    this.store.update(id, x => { x.drain = now(); x.log.push({ ts: now(), msg: 'draining: running work finishes, nothing new starts' }) })
    return { ok: true }
  }

  /** Stop the running phase. Training resumes from the trial cache with `train`. */
  cancel(id, { by = 'owner', reason } = {}) {
    const c = this.store.read(id)
    if (!c.active) return { ok: false, note: 'nothing is running' }
    if (c.active.pid !== process.pid && pidAlive(c.active.pid)) throw new Error(`the camp runs in another process (pid ${c.active.pid}); stop it there`)
    // a pause someone asked for is marked, so nothing resumes it automatically (a restart or a provider limit is not)
    this.store.update(id, x => { x.pauseBy = { by, ...(reason ? { reason } : {}) } })
    const ok = this.engine.cancel(c.active.runId)
    if (!ok) this.store.update(id, x => { delete x.active; if (x.status === 'training') { x.status = 'paused'; x.pause = { reason: 'the process that ran the camp ended', ts: now() } } })
    return { ok: true }
  }

  /**
   * Send one agent back to training. It starts from the agent as it works today (the published one), the real work
   * it got wrong is added to its practice and check tasks, and the coach is told why it is back. The other roles and
   * the team keep their training. Start it with train(id, { roles: [role] }); a publish then replaces the agent only
   * if the retrained one passes the final exam and beats the one it started from.
   * @param {{title?: string, task: string, wrong?: string, stage?: string}[]} examples  real work that fell short
   */
  retrain(id, roleName, { why = '', examples = [], by = 'owner' } = {}) {
    const c = this.store.read(id)
    if (this.#busy(c)) throw new Error('the camp is busy; pause it first or wait')
    const role = c.workflow?.roles.find(r => r.name === roleName)
    const st = c.roles[roleName]
    if (!role || !st) throw new Error(`the camp has no role ${roleName}`)
    const bestId = st.verify?.chosen ?? st.best?.id
    const best = bestId ? this.store.candidate(id, roleName, bestId) : null
    let def = null
    try { def = this.registry.getAgent(roleName) } catch {}
    def ??= best?.def
    if (!def) throw new Error(`${roleName} has not been trained or published yet; train the camp first`)
    def = structuredClone(def)
    delete def.clonedFrom; delete def.camp; delete def.invalid
    const stages = c.workflow.stages.filter(s => s.role === roleName || s.reviewer === roleName).map(s => s.id)
    const rows = examples.filter(e => String(e?.task ?? '').trim().length >= 40).slice(0, 6).map(e => ({
      id: `t-real-${hash({ t: e.task, w: e.wrong }, 8)}`, title: clip(e.title || `Real work: ${String(e.task).replace(/\s+/g, ' ')}`, 90), real: true,
      stage: stages.includes(e.stage) ? e.stage : stages[0], input: String(e.task).slice(0, 12000), fixtures: [],
      rubric: [{ criterion: 'Does what the task asks, completely and correctly, to the standard of the best work in the field', weight: 3 }, ...(e.wrong ? [{ criterion: `Does not repeat the fault found when this was real work: ${clip(e.wrong, 400)}`, weight: 3 }] : []), { criterion: 'Says what was verified and how; claims nothing that was not checked', weight: 2 }],
      checks: [],
    }))
    rows.forEach((row, i) => {
      const split = i % 3 === 2 ? 'dev' : 'train'
      const have = this.store.tasks(id, roleName, split)
      if (!have.some(t => t.id === row.id)) this.store.saveTasks(id, roleName, split, [...have, row])
    })
    this.#dropRole(id, roleName, false)
    this.store.saveCandidate(id, roleName, { id: 'base', parent: null, lever: 'base', kept: true, why: `the agent as it worked when it was sent back to training: ${clip(why, 300)}`, def, lessons: best?.lessons ?? [], ts: now() })
    return this.store.update(id, x => {
      x.roles[roleName] = { contract: st.contract, seed: st.seed, kit: st.kit, status: 'new', rounds: [], retrain: { why: clip(why, 1000), by, ts: now(), n: (st.retrain?.n ?? 0) + 1, realTasks: rows.length } }
      if (['ready', 'not-passed', 'published', 'paused'].includes(x.status)) x.status = 'approved'
      delete x.pause
      x.log.push({ ts: now(), msg: `${roleName} was sent back to training by ${by} (${rows.length} real task${rows.length === 1 ? '' : 's'} added): ${clip(why, 300)}` })
    })
  }

  /** Forget the training of one role, of the team ("_team") or of everything ("all"). Datasets are kept unless datasets = true. */
  reset(id, what = 'all', { datasets = false } = {}) {
    if (this.#busy(this.store.read(id))) throw new Error('the camp is busy; stop it first')
    return this.store.update(id, c => {
      const keys = what === 'all' ? [...Object.keys(c.roles), TEAM] : [what]
      for (const k of keys) {
        if (k !== TEAM && !c.roles[k]) throw new Error(`unknown role ${k}`)
        this.#dropRole(id, k, datasets)
        if (k === TEAM) c.team = { contract: c.team.contract, status: 'new', rounds: [] }
        else c.roles[k] = { contract: c.roles[k].contract, seed: c.roles[k].seed, status: 'new', rounds: [] }
      }
      // the team was scored with the roles as they were
      if (what !== TEAM && what !== 'all') { this.#dropRole(id, TEAM, false); c.team = { contract: c.team.contract, status: 'new', rounds: [] } }
      if (['ready', 'not-passed', 'published', 'paused'].includes(c.status)) c.status = c.approvedVersion === c.workflowVersion ? 'approved' : 'workflow'
    })
  }

  /**
   * Run one training stage again. Everything that depends on the stage is forgotten with it, earlier stages are kept:
   *   scout   the skill search runs again (nothing else changes)
   *   sets    all tasks are written again; scores, rounds and verification go with them
   *   base    starting scores are measured again; rounds and verification go with them (tasks are kept)
   *   rounds  the training rounds run again from the starting scores (tasks and starting scores are kept)
   *   verify  the sealed tasks are done again (tasks, starting scores and rounds are kept)
   *   team    the team is trained and verified again (the agents are kept)
   * Training continues with `train`.
   */
  redo(id, stage) {
    const c0 = this.store.read(id)
    if (this.#busy(c0)) throw new Error('the camp is busy; pause it first')
    if (!c0.workflow || c0.approvedVersion !== c0.workflowVersion) throw new Error('approve the workflow first')
    if (stage === 'sets') return this.reset(id, 'all', { datasets: true })
    if (stage === 'base') return this.reset(id, 'all')
    if (!['scout', 'rounds', 'verify', 'team'].includes(stage)) throw new Error(`unknown stage "${stage}"`)
    const names = Object.keys(c0.roles)
    if (stage === 'rounds' || stage === 'verify') {
      const keep = stage === 'rounds' ? t => t.cand === 'base' && t.split !== 'holdout' : t => t.split !== 'holdout'
      const all = this.store.trials(id)
      const rest = all.filter(t => t.role === TEAM || !names.includes(t.role) ? false : keep(t))
      fs.writeFileSync(this.store.dir(id, 'trials.jsonl'), rest.map(t => JSON.stringify(t)).join('\n') + (rest.length ? '\n' : ''))
      if (stage === 'rounds') for (const r of names) for (const f of fs.existsSync(this.store.dir(id, 'candidates', r)) ? fs.readdirSync(this.store.dir(id, 'candidates', r)) : []) if (f !== 'base.json') fs.rmSync(this.store.dir(id, 'candidates', r, f))
    }
    if (stage !== 'scout') this.#dropRole(id, TEAM, false)
    return this.store.update(id, c => {
      if (stage === 'scout') { delete c.scout; for (const r of names) if (!c.roles[r].baseline) delete c.roles[r].kit }
      for (const r of stage === 'rounds' || stage === 'verify' ? names : []) {
        const x = c.roles[r]
        delete x.verify
        if (stage === 'rounds') { x.rounds = []; delete x.pending; if (x.baseline) { x.best = { id: 'base', ...x.baseline }; x.status = 'training' } }
        else if (x.status === 'verified') x.status = 'trained'
      }
      if (stage !== 'scout') c.team = { contract: c.team.contract, status: 'new', rounds: [] }
      if (['ready', 'not-passed', 'published', 'paused'].includes(c.status)) c.status = 'approved'
      delete c.pause
      c.log.push({ ts: now(), msg: `stage "${stage}" will run again` })
    })
  }

  /** Start the camp fresh: the goal, the settings and the approved workflow stay; tasks, scores, rounds, the scout's result, spend and the log go. */
  fresh(id) {
    const c0 = this.store.read(id)
    if (this.#busy(c0)) throw new Error('the camp is busy; pause it first')
    for (const d of ['datasets', 'sealed', 'candidates', 'work']) fs.rmSync(this.store.dir(id, d), { recursive: true, force: true })
    fs.rmSync(this.store.dir(id, 'trials.jsonl'), { force: true })
    fs.rmSync(this.store.dir(id, 'report.md'), { force: true })
    fs.mkdirSync(this.store.dir(id, 'work', 'staff'), { recursive: true })
    return this.store.update(id, c => {
      for (const r of Object.keys(c.roles)) c.roles[r] = { contract: c.roles[r].contract, seed: c.roles[r].seed, status: 'new', rounds: [] }
      c.team = { contract: c.team.contract, status: 'new', rounds: [] }
      delete c.scout; delete c.pause; delete c.lastError
      c.spend = { usd: 0, calls: 0 }
      c.status = c.published ? 'published' : c.workflow ? (c.approvedVersion === c.workflowVersion ? 'approved' : 'workflow') : 'draft'
      c.log = [{ ts: now(), msg: 'the camp was started fresh: tasks, scores and rounds were cleared; the workflow and the settings were kept' }]
    })
  }

  /** Approve (install) or reject a skill the scout found outside the trusted owners. */
  async decideSkill(id, index, approve) {
    const c = this.store.read(id)
    const item = c.scout?.skills?.[Number(index)]
    if (!item || item.status !== 'pending') throw new Error('no such pending skill')
    let next = { ...item, status: 'rejected', reason: 'You rejected it.' }
    if (approve) { try { next = { ...(await installScouted(this.registry, item)), reason: 'You approved it.' } } catch (e) { next = { ...item, status: 'failed', error: clip(e.message, 200) } } }
    this.store.update(id, x => { x.scout.skills[Number(index)] = next })
    return next
  }

  // ---------------------------------------------------------------- publish

  /**
   * Write what passed into Agent Forge: the trained agents, the workflow's teams and the workflow as an
   * orchestration. Whatever a file replaces is copied to the camp's backup first.
   */
  publish(id, { force = false } = {}) {
    const c = this.store.read(id)
    if (this.#busy(c) && c.active.what !== 'train') throw new Error('the camp is busy')
    if (!c.workflow || c.approvedVersion !== c.workflowVersion) throw new Error('the current workflow is not approved and trained; approve it and train first')
    if (!['ready', 'published'].includes(c.status) && !force) throw new Error(`the camp is "${c.status}", not ready: ${c.status === 'not-passed' ? 'some roles or the team did not pass (see the report). Publish with force to publish what passed and keep the rest as it is' : 'train it first'}`)
    const d = this.registry.d
    const exists = n => fs.existsSync(path.join(d.agents, `${n}.yaml`))
    const plan = c.workflow.roles.map(r => {
      const st = c.roles[r.name]
      return { role: r, st, cand: st?.verify?.passed ? st.verify.chosen : null, exists: exists(r.name) }
    })
    const missing = plan.filter(p => !p.cand && !p.exists)
    if (missing.length && !force) throw new Error(`these new roles did not pass and do not exist as agents, so the workflow could not run: ${missing.map(p => p.role.name).join(', ')}. Train them, change the workflow, or publish with force`)

    const stamp = now().replace(/[:.]/g, '-')
    const backup = this.store.dir(id, 'backup', stamp)
    const manifest = { ts: now(), created: [], replaced: [] }
    const put = (kind, file, write) => {
      const rel = path.join(kind, path.basename(file))
      if (fs.existsSync(file)) { fs.mkdirSync(path.join(backup, kind), { recursive: true }); fs.copyFileSync(file, path.join(backup, rel)); manifest.replaced.push(rel) } else manifest.created.push(rel)
      write()
    }
    const teamOf = n => c.workflow.teams.find(t => t.members.includes(n))?.name
    const agents = [], skipped = []
    for (const p of plan) {
      const name = p.role.name
      const candId = p.cand ?? (p.exists ? null : p.st?.best?.id ?? 'base')
      if (!candId) { skipped.push(name); continue }
      const cand = this.store.candidate(id, name, candId)
      const def = structuredClone(cand.def)
      def.tags = [...new Set([...(def.tags ?? []).filter(t => !t.startsWith('camp-')), p.cand ? 'camp-trained' : 'camp-below-bar'])]
      def.camp = { id, workflowVersion: c.workflowVersion, candidate: candId, verification: p.st?.verify?.score ?? null, passed: !!p.cand, publishedAt: now() }
      put('agents', path.join(d.agents, `${name}.yaml`), () => this.registry.saveAgent(def))
      if (cand.lessons?.length && ['markdown', 'hybrid'].includes(def.memory?.mode)) {
        const mem = openMemory(this.registry.home, normalizeAgent(def), { team: teamOf(name) })
        for (const l of cand.lessons) mem.handle('memory_save', { title: l.title, content: l.content, tags: ['training-camp'] })
      }
      // the agent's own record of what training taught it, in its content library (listed in its instructions every run)
      const lib = path.join(this.registry.agentHome(name).files, 'training-camp.md')
      fs.appendFileSync(lib, `\n## Camp "${c.name}" (${id}), published ${now().slice(0, 10)}\n\nVerification score ${p.st?.verify?.score ?? '-'}; configuration ${candId}.\n\nWhat training changed:\n${this.#lineage(id, name, candId).map(x => `- ${x.lever}: ${x.why}`).join('\n') || '- nothing: the starting configuration was already the best'}\n${cand.lessons?.length ? `\nLessons:\n${cand.lessons.map(l => `- ${l.title}: ${l.content}`).join('\n')}\n` : ''}`)
      const titles = Object.fromEntries(['train', 'dev'].flatMap(k => this.store.tasks(id, name, k)).map(t => [t.id, t.title]))
      const hard = this.store.trials(id).filter(t => t.role === name && t.cand === candId && t.split !== 'holdout' && t.judge?.problems?.length).sort((a, b) => a.score - b.score).slice(0, 6)
      if (hard.length) fs.appendFileSync(lib, `\nHard cases met in training (what the judge still found wrong with this configuration):\n${hard.map(t => `- ${titles[t.task] ?? t.task} (score ${t.score}): ${t.judge.problems.slice(0, 3).join(' | ')}`).join('\n')}\n`)
      agents.push(name)
    }
    const teams = []
    for (const t of c.workflow.teams) {
      put('teams', path.join(d.teams, `${t.name}.yaml`), () => this.registry.saveTeam({ name: t.name, description: t.description, members: t.members.filter(exists) }))
      teams.push(t.name)
    }
    // team memory: how the team works together and what its members learned, shared with every member whose
    // memory scope is "team". Notes add up over camps: a later camp adds to them and overwrites only its own.
    const stagesNow = c.team?.verify?.passed && c.team.verify.chosen !== 'base' ? this.store.candidate(id, TEAM, c.team.verify.chosen).workflow.stages : c.workflow.stages
    for (const t of c.workflow.teams) {
      const mem = openMemory(this.registry.home, normalizeAgent({ name: 'camp-team-notes', memory: { mode: 'markdown', scope: 'team' } }), { team: t.name })
      const mine = stagesNow.filter(s => t.members.includes(s.role) || t.members.includes(s.reviewer))
      mem.handle('memory_save', { title: `How ${t.name} works (camp ${c.name})`, tags: ['training-camp'], content: `Goal: ${c.goal}\n\nStages this team owns or reviews:\n${mine.map(s => `- ${s.title} (${s.role}${s.reviewer ? `, reviewed by ${s.reviewer}` : ''}): delivers ${s.deliverable}. Accepted when: ${s.acceptance.join('; ')}.${s.notes ? ` Hand-off: ${s.notes}` : ''}`).join('\n')}\n\nTeam verification score: ${c.team?.verify?.score ?? 'not verified'}.` })
      const learned = t.members.flatMap(m => { const st = c.roles[m]; if (!st?.verify?.passed) return []; return (this.store.candidate(id, m, st.verify.chosen).lessons ?? []).map(l => `- (${m}) ${l.title}: ${l.content}`) })
      if (learned.length) mem.handle('memory_save', { title: `Lessons of ${t.name} (camp ${c.name})`, tags: ['training-camp'], content: learned.join('\n') })
    }
    const tv = c.team?.verify
    const stages = tv?.passed && tv.chosen !== 'base' ? this.store.candidate(id, TEAM, tv.chosen).workflow.stages : c.workflow.stages
    const orchestration = c.settings.publish.workflowName || `${slug(c.name, 34)}-workflow`
    const existing = ['.yaml', '.yml', '.js', '.mjs'].map(e => path.join(d.orchestrations, orchestration + e)).find(f => fs.existsSync(f))
    put('orchestrations', existing ?? path.join(d.orchestrations, `${orchestration}.js`), () => this.registry.saveOrchestration(orchestration, 'js', orchestrationSource({ name: orchestration, camp: c, workflow: { ...c.workflow, stages }, orchestrationsDir: d.orchestrations, team: c.workflow.teams[0]?.name })))
    if (existing && !existing.endsWith('.js')) manifest.created.push(path.join('orchestrations', `${orchestration}.js`))
    writeJson(path.join(backup, 'manifest.json'), manifest)
    const published = { ts: now(), backup: stamp, agents, skipped, teams, orchestration }
    this.store.update(id, x => { x.published = published; x.status = 'published'; x.log.push({ ts: now(), msg: `published agents ${agents.join(', ') || '-'}, teams ${teams.join(', ') || '-'} and the workflow "${orchestration}"` }) })
    return published
  }

  /** Undo the last publish: restore what it replaced and remove what it created. Memory notes it saved stay. */
  rollback(id) {
    const c = this.store.read(id)
    if (!c.published) throw new Error('this camp has not published anything')
    const backup = this.store.dir(id, 'backup', c.published.backup)
    const m = readJson(path.join(backup, 'manifest.json'))
    if (!m) throw new Error('the backup of the last publish is missing')
    const d = this.registry.d
    const target = rel => path.join({ agents: d.agents, teams: d.teams, orchestrations: d.orchestrations }[rel.split(path.sep)[0]], path.basename(rel))
    for (const rel of m.created) fs.rmSync(target(rel), { force: true })
    for (const rel of m.replaced) fs.copyFileSync(path.join(backup, rel), target(rel))
    this.store.update(id, x => { delete x.published; if (x.status === 'published') x.status = 'ready'; x.log.push({ ts: now(), msg: 'publish rolled back' }) })
    return { ok: true, restored: m.replaced, removed: m.created }
  }

  // ---------------------------------------------------------------- internals

  /** The accepted changes that led from the starting configuration to a candidate, oldest first. */
  #lineage(id, role, candId) {
    const out = []
    for (let cur = candId; cur && cur !== 'base';) { const k = this.store.candidate(id, role, cur); out.unshift({ lever: k.lever, why: k.why }); cur = k.parent }
    return out
  }

  #busy(c) {
    const a = c.active
    if (!a) return false
    if (a.pid === process.pid) return this.engine.active?.has?.(a.runId) ?? false
    return pidAlive(a.pid)
  }

  #dropRole(id, key, datasets) {
    this.store.dropCandidates(id, key)
    this.store.dropTrials(id, key)
    if (datasets) this.store.dropTasks(id, key)
    fs.rmSync(this.store.dir(id, 'work', key), { recursive: true, force: true })
  }

  #checks() {
    const skills = new Set(listSkills(this.registry.d.skills).map(s => s.name))
    return { agentExists: n => fs.existsSync(path.join(this.registry.d.agents, `${n}.yaml`)), skillExists: s => skills.has(s) }
  }

  #catalog() {
    const agents = this.registry.listAgents().filter(a => !a.invalid && !a.name.startsWith('camp-')).slice(0, 120)
      .map(a => `- ${a.name} [${a.model}, ${Array.isArray(a.tools) && !a.tools.includes('Write') && !a.tools.includes('Bash') ? 'read-only' : 'can write'}]: ${clip(a.description, 140)}`).join('\n')
    const skills = listSkills(this.registry.d.skills).map(s => `- ${s.name}: ${clip(s.description, 100)}`).join('\n')
    return { agents, skills }
  }

  #saveWorkflow(id, wf, { by, note, changes }) {
    this.store.update(id, c => {
      c.workflowVersion++
      writeJson(this.store.dir(id, `workflow.v${c.workflowVersion}.json`), wf)
      c.workflow = wf
      c.workflowHistory.push({ version: c.workflowVersion, ts: now(), by, note, ...(changes?.length ? { changes } : {}) })
      c.status = 'workflow'
      delete c.pause
      c.log.push({ ts: now(), msg: `workflow v${c.workflowVersion} (${by}): ${clip(note, 200)}` })
    })
  }

  /** Run one phase of a camp as an Agent Forge run (so it shows on Workflows > Runs with every transcript). */
  #start(id, what, body) {
    if (!CAMP_ID.test(id)) throw new Error('bad camp id')
    const camp = this.store.read(id)
    if (this.#busy(camp)) throw new Error(`the camp is busy: ${camp.active.what} (run ${camp.active.runId})`)
    fs.mkdirSync(this.store.dir(id, 'work', 'staff'), { recursive: true })
    const r = this.engine.startCustom(`camp ${clip(camp.name, 40)}: ${what}`, async api => {
      const ctx = makeCtx({ store: this.store, registry: this.registry, id, api, hooks: this.hooks })
      try {
        return await body(ctx)
      } catch (e) {
        const paused = e?.pause === true
        const reason = paused ? e.message : `error: ${e?.message ?? e}`
        this.store.update(id, c => {
          if (what === 'train') { c.status = 'paused'; c.pause = { reason: c.pauseBy?.reason ? `${reason}: ${c.pauseBy.reason}` : reason, ts: now(), ...(c.pauseBy && /you paused it/.test(reason) ? { by: c.pauseBy.by } : {}) } }
          delete c.pauseBy
          c.log.push({ ts: now(), msg: `${what} ${paused ? 'paused' : 'failed'}: ${clip(reason, 400)}` })
        })
        if (paused) return `Paused: ${reason}${what === 'train' ? '\nNothing is lost: start training again to continue from where it stopped.' : ''}`
        throw e
      } finally {
        this.store.update(id, c => { delete c.active })
      }
    }, { camp: id }, { cwd: this.store.dir(id, 'work'), meta: { camp: id, what }, maxParallel: camp.settings.parallelCalls })
    this.store.update(id, c => { c.active = { runId: r.id, pid: process.pid, what, ts: now() }; c.runs.push({ id: r.id, what, ts: now() }); if (c.runs.length > 60) c.runs.splice(0, c.runs.length - 60) })
    return { runId: r.id, done: r.done }
  }
}

const KEY = Symbol.for('training-camp.shared')
/** The one Camps of this process, on the shared Agent Forge registry and engine. */
export function camps(forge, opts) { return (globalThis[KEY] ??= new Camps(forge, opts)) }
