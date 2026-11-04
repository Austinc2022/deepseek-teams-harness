/**
 * Projects and tasks, with a per-task orchestration of agents and workflows.
 *
 * Storage: forge/projects/<projectId>.json, one file per project holding its
 * categories and tasks. A task's orchestration is an ordered list of steps:
 *   { kind: 'agents', agents: ['planner'], instructions }   one agent, or several in parallel
 *   { kind: 'workflow', workflow: 'pr-review', args: { repo: '{{folder}}' } }   a saved Agent Forge workflow
 * Each step sees the task and the results of the steps before it. A run is an
 * Agent Forge run (engine.startCustom), so it shows on the Workflows > Runs tab
 * with transcripts, and every agent keeps its own model, skills, memory and backend.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { runNamed, renderTemplate } from '../../agent-forge/lib/engine.js'

export const STATUSES = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
]
const STATUS_IDS = STATUSES.map(s => s.id)
export const COLORS = ['#4176e6', '#e5484d', '#8e4ec6', '#30a46c', '#f59e0b', '#0ea5a4', '#d6409f', '#6b7280']

const newId = () => `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`
const now = () => new Date().toISOString()
const ID = /^[a-z0-9]{6,24}$/
const expand = p => (p && (p === '~' || p.startsWith('~/')) ? path.join(os.homedir(), p.slice(1)) : p)
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const str = (v, max = 20000) => String(v ?? '').slice(0, max)

/** Starter categories; templates only use agents that exist. */
function defaultCategories(registry) {
  const have = new Set(registry.listAgents().filter(a => !a.invalid).map(a => a.name))
  const step = (agents, instructions = '') => ({ kind: 'agents', agents: agents.filter(a => have.has(a)), instructions })
  const tpl = steps => steps.filter(s => s.agents.length)
  return [
    { id: 'feature', name: 'Feature', color: COLORS[0], template: tpl([step(['planner'], 'Write a short implementation plan.'), step(['implementer'], 'Implement the plan.'), step(['code-reviewer', 'security-reviewer'], 'Review the changes.')]) },
    { id: 'bug', name: 'Bug', color: COLORS[1], template: tpl([step(['implementer'], 'Find the root cause and fix it with a regression test.'), step(['qa-engineer'], 'Verify the fix.')]) },
    { id: 'research', name: 'Research', color: COLORS[2], template: [] },
    { id: 'docs', name: 'Docs', color: COLORS[3], template: [] },
    { id: 'chore', name: 'Chore', color: COLORS[7], template: [] },
  ]
}

export class Projects {
  constructor({ registry, engine }) {
    this.registry = registry
    this.engine = engine
    this.dir = path.join(registry.home, 'projects')
    this.worktrees = path.join(registry.home, 'worktrees')
    fs.mkdirSync(this.dir, { recursive: true })
    this.live = new Map() // runId -> { projectId, taskId }
  }

  #file(id) {
    if (!ID.test(id)) throw new Error('bad project id')
    return path.join(this.dir, `${id}.json`)
  }
  get(id) {
    const f = this.#file(id)
    if (!fs.existsSync(f)) throw new Error('unknown project')
    return JSON.parse(fs.readFileSync(f, 'utf8'))
  }
  #save(p) {
    p.updatedAt = now()
    const f = this.#file(p.id)
    fs.writeFileSync(`${f}.tmp`, JSON.stringify(p, null, 2))
    fs.renameSync(`${f}.tmp`, f)
    return p
  }

  list() {
    return fs.readdirSync(this.dir).filter(f => f.endsWith('.json')).map(f => {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'))
        const counts = Object.fromEntries(STATUS_IDS.map(s => [s, p.tasks.filter(t => t.status === s).length]))
        return { id: p.id, name: p.name, description: p.description, folder: p.folder, counts, tasks: p.tasks.length, running: p.tasks.filter(t => this.#running(t)).length, updatedAt: p.updatedAt }
      } catch { return null }
    }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
  }

  create({ name, description = '', folder = '' }) {
    if (!str(name).trim()) throw new Error('project name is required')
    const p = { id: newId(), name: str(name, 80).trim(), description: str(description), folder: str(folder, 1000).trim(), categories: defaultCategories(this.registry), tasks: [], createdAt: now() }
    return this.#save(p)
  }

  update(id, patch) {
    const p = this.get(id)
    if (patch.name !== undefined) { if (!str(patch.name).trim()) throw new Error('project name is required'); p.name = str(patch.name, 80).trim() }
    if (patch.description !== undefined) p.description = str(patch.description)
    if (patch.folder !== undefined) p.folder = str(patch.folder, 1000).trim()
    if (patch.categories !== undefined) {
      if (!Array.isArray(patch.categories) || !patch.categories.length) throw new Error('a project needs at least one category')
      p.categories = patch.categories.map(c => ({
        id: /^[a-z0-9-]{1,40}$/.test(c.id ?? '') ? c.id : (str(c.name, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || newId()),
        name: str(c.name, 40).trim() || 'Untitled',
        color: /^#[0-9a-f]{6}$/i.test(c.color ?? '') ? c.color : COLORS[0],
        template: this.#cleanStages(c.template ?? []),
      }))
      const ids = new Set(p.categories.map(c => c.id))
      if (ids.size !== p.categories.length) throw new Error('two categories have the same name')
      for (const t of p.tasks) if (!ids.has(t.category)) t.category = p.categories[0].id
    }
    return this.#save(p)
  }

  delete(id) {
    const p = this.get(id)
    if (p.tasks.some(t => this.#running(t))) throw new Error('stop the running tasks first')
    fs.rmSync(this.#file(id), { force: true })
    return { ok: true }
  }

  // ---------- tasks ----------
  #cleanStages(stages) {
    if (!Array.isArray(stages)) throw new Error('stages must be a list')
    return stages.slice(0, 40).map(s => {
      if (s.kind === 'workflow') {
        if (!s.workflow) throw new Error('a workflow step needs a workflow')
        this.registry.orchestrationFile(s.workflow)
        const args = {}
        for (const [k, v] of Object.entries(s.args ?? {})) if (/^[\w-]{1,40}$/.test(k)) args[k] = str(v, 4000)
        return { kind: 'workflow', workflow: s.workflow, args, label: str(s.label, 60) || undefined }
      }
      const agents = [...new Set((s.agents ?? []).map(String))].slice(0, 16)
      if (!agents.length) throw new Error('an agent step needs at least one agent')
      for (const a of agents) this.registry.getAgent(a)
      return { kind: 'agents', agents, instructions: str(s.instructions, 8000), label: str(s.label, 60) || undefined, optional: s.optional === true || undefined }
    })
  }

  #task(p, tid) {
    const t = p.tasks.find(x => x.id === tid)
    if (!t) throw new Error('unknown task')
    return t
  }

  createTask(pid, b) {
    const p = this.get(pid)
    if (!str(b.title).trim()) throw new Error('task title is required')
    const category = p.categories.some(c => c.id === b.category) ? b.category : p.categories[0].id
    const cat = p.categories.find(c => c.id === category)
    const t = {
      id: newId(), title: str(b.title, 200).trim(), description: str(b.description), category,
      status: STATUS_IDS.includes(b.status) ? b.status : 'todo',
      folder: str(b.folder, 1000).trim() || undefined, worktree: b.worktree === true || undefined,
      stages: b.stages ? this.#cleanStages(b.stages) : structuredClone(cat.template ?? []),
      runs: [], createdAt: now(), updatedAt: now(),
    }
    p.tasks.push(t)
    this.#save(p)
    return t
  }

  updateTask(pid, tid, b) {
    const p = this.get(pid)
    const t = this.#task(p, tid)
    if (b.title !== undefined) { if (!str(b.title).trim()) throw new Error('task title is required'); t.title = str(b.title, 200).trim() }
    if (b.description !== undefined) t.description = str(b.description)
    if (b.category !== undefined) { if (!p.categories.some(c => c.id === b.category)) throw new Error('unknown category'); t.category = b.category }
    if (b.status !== undefined) { if (!STATUS_IDS.includes(b.status)) throw new Error('unknown status'); t.status = b.status }
    if (b.folder !== undefined) t.folder = str(b.folder, 1000).trim() || undefined
    if (b.worktree !== undefined) t.worktree = b.worktree === true || undefined
    if (b.stages !== undefined) t.stages = this.#cleanStages(b.stages)
    if (b.order !== undefined && Number.isInteger(b.order)) {
      p.tasks.splice(p.tasks.indexOf(t), 1)
      p.tasks.splice(Math.max(0, Math.min(p.tasks.length, b.order)), 0, t)
    }
    t.updatedAt = now()
    this.#save(p)
    return t
  }

  deleteTask(pid, tid) {
    const p = this.get(pid)
    const t = this.#task(p, tid)
    if (this.#running(t)) throw new Error('stop this task first')
    p.tasks = p.tasks.filter(x => x !== t)
    this.#save(p)
    return { ok: true, worktree: t.worktreePath }
  }

  #running(t) {
    const r = t.runs?.at(-1)
    return !!r && r.status === 'running' && this.engine.active.has(r.id)
  }

  /** Working folder for a task: its worktree, its folder, or the project folder. Creates the worktree on first use. */
  taskFolder(p, t, { create = false } = {}) {
    const base = path.resolve(expand(t.folder || p.folder || '') || this.registry.d.workspaces)
    if (!t.worktree) return base
    if (t.worktreePath && fs.existsSync(t.worktreePath)) return t.worktreePath
    if (!create) return base
    let top
    try { top = git(base, 'rev-parse', '--show-toplevel') } catch { throw new Error(`${base} is not a git repository, so the task cannot have its own worktree. Untick "Own worktree" or set a git folder.`) }
    const wt = path.join(this.worktrees, path.basename(top).replace(/[^\w.-]/g, '_'), `task-${t.id}`)
    const branch = `task/${t.id}`
    fs.mkdirSync(path.dirname(wt), { recursive: true })
    let exists = false
    try { git(top, 'rev-parse', '--verify', `refs/heads/${branch}`); exists = true } catch {}
    git(top, 'worktree', 'add', ...(exists ? [wt, branch] : ['-b', branch, wt]))
    t.worktreePath = wt
    t.branch = branch
    t.repo = top
    return wt
  }

  /** Start the task's orchestration as an Agent Forge run. */
  run(pid, tid) {
    const p = this.get(pid)
    const t = this.#task(p, tid)
    if (this.#running(t)) throw new Error('this task is already running')
    if (!t.stages.length) throw new Error('add at least one step (agents or a workflow) to the orchestration first')
    this.#cleanStages(t.stages) // agents/workflows may have been deleted since
    const cwd = this.taskFolder(p, t, { create: true })
    fs.mkdirSync(cwd, { recursive: true })
    const cat = p.categories.find(c => c.id === t.category)
    const snapshot = { project: { id: p.id, name: p.name, description: p.description }, task: { id: t.id, title: t.title, description: t.description, category: cat?.name }, stages: structuredClone(t.stages) }
    const { id, done } = this.engine.startCustom(`task: ${t.title}`.slice(0, 80), (api, state) => runStages(this.registry, api, state, snapshot, cwd), { task: t.title }, { cwd, meta: { projectId: p.id, taskId: t.id } })
    t.runs.push({ id, status: 'running', startedAt: now() })
    t.runs = t.runs.slice(-30)
    if (['backlog', 'todo'].includes(t.status)) t.status = 'doing'
    t.updatedAt = now()
    this.#save(p)
    done.then(state => {
      try {
        const q = this.get(pid)
        const qt = q.tasks.find(x => x.id === tid)
        if (!qt) return
        const r = qt.runs.find(x => x.id === id)
        if (r) Object.assign(r, { status: state.status, endedAt: state.endedAt, costUsd: state.costUsd || undefined })
        if (state.status === 'completed' && qt.status === 'doing') qt.status = 'review'
        qt.updatedAt = now()
        this.#save(q)
      } catch {}
    })
    return { runId: id, cwd }
  }

  cancel(pid, tid) {
    const t = this.#task(this.get(pid), tid)
    const r = t.runs.at(-1)
    return { ok: !!r && this.engine.cancel(r.id) }
  }
}

/** Default template for a workflow argument, guessed from its name. */
export function defaultArg(name) {
  if (/repo|folder|dir|path|cwd/i.test(name)) return '{{folder}}'
  if (/task|goal|request|topic|description|brief|prompt|question/i.test(name)) return '{{task.text}}'
  return ''
}

const asText = v => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v, null, 2))
const MAX_PREV = 30000

async function runStages(registry, api, state, snap, cwd) {
  const { task, project, stages } = snap
  const taskText = `${task.title}${task.description ? `\n\n${task.description}` : ''}`
  const results = []
  const previous = () => {
    if (!results.length) return ''
    let s = results.map(r => `## Step ${r.n}: ${r.label}\n\n${r.text ?? '(no result)'}`).join('\n\n')
    if (s.length > MAX_PREV) s = `[earlier output trimmed]\n…${s.slice(-MAX_PREV)}`
    return s
  }
  const ctx = () => ({ task: { ...task, text: taskText }, project, folder: cwd, previous: previous(), last: results.at(-1)?.text ?? '', date: new Date().toISOString().slice(0, 10) })

  for (const [i, s] of stages.entries()) {
    const n = i + 1
    const label = s.label || (s.kind === 'workflow' ? `workflow ${s.workflow}` : s.agents.join(' + '))
    api.phase(`${n}. ${label}`)
    if (api.signal.aborted) break
    let text
    if (s.kind === 'workflow') {
      const args = Object.fromEntries(Object.entries(s.args ?? {}).map(([k, v]) => [k, renderTemplate(v, ctx())]))
      const { result } = await runNamed(registry, s.workflow, api, args)
      text = asText(result)
    } else {
      const prompt = [
        `# Task (project "${project.name}"${task.category ? `, category ${task.category}` : ''})`,
        taskText,
        project.description ? `# Project context\n${project.description}` : null,
        `# Working folder\n${cwd}`,
        results.length ? `# Results of earlier steps\n${previous()}` : null,
        `# Your step (${n} of ${stages.length})\n${s.instructions?.trim() || (n === 1 ? 'Do this task.' : 'Continue the task, building on the earlier steps.')}`,
        s.agents.length > 1 ? `Other agents work on this step in parallel: ${s.agents.join(', ')}. Focus on your own role.` : null,
      ].filter(Boolean).join('\n\n')
      const outs = s.agents.length === 1
        ? [await api.agent(s.agents[0], prompt, { label: `${n}:${s.agents[0]}`, cwd })]
        : await api.parallel(s.agents.map(a => () => api.agent(a, prompt, { label: `${n}:${a}`, cwd })))
      if (outs.every(o => o == null) && !s.optional && !api.signal.aborted) throw new Error(`step ${n} (${label}) failed; see the agent transcript`)
      text = s.agents.length === 1 ? outs[0] : outs.map((o, j) => `### ${s.agents[j]}\n\n${o ?? '(failed)'}`).join('\n\n')
    }
    results.push({ n, label, text })
    api.save(`step-${String(n).padStart(2, '0')}.md`, text ?? '(no result)')
  }
  return `# ${task.title}\n\n${results.map(r => `## Step ${r.n}: ${r.label}\n\n${r.text ?? '(no result)'}`).join('\n\n')}`
}
