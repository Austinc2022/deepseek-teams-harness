/**
 * Agent Forge registry: agents, teams and orchestrations stored as plain files
 * under AGENT_FORGE_HOME so they can be edited by hand, by the web console,
 * or by the harness lead agent.
 *
 *   agents/<name>.yaml          agent definitions
 *   teams/<name>.yaml           named groups of agents
 *   orchestrations/<name>.yaml  declarative stage pipelines (console builder)
 *   orchestrations/<name>.js    code orchestrations (loops, branching)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const here = path.dirname(fileURLToPath(import.meta.url))

export function forgeHome() {
  return path.resolve(process.env.AGENT_FORGE_HOME ?? path.join(here, '../../../forge'))
}

export const dirs = home => ({
  home,
  agents: path.join(home, 'agents'),
  teams: path.join(home, 'teams'),
  orchestrations: path.join(home, 'orchestrations'),
  skills: path.join(home, 'skills'),
  memory: path.join(home, 'memory'),
  runs: path.join(home, 'runs'),
  workspaces: path.join(home, 'workspaces'),
  reports: path.join(home, 'reports'),
  chats: path.join(home, 'chats'),
  agentHomes: path.join(home, 'agent-homes'),
  mcp: path.join(home, 'mcp'),
  cache: path.join(home, '.cache'),
})

const NAME = /^[a-z][a-z0-9-]{0,47}$/
export function assertName(name, kind = 'name') {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`invalid ${kind} "${name}": use lowercase letters, digits and hyphens (max 48), starting with a letter`)
  return name
}

export const MODELS = ['opus', 'sonnet', 'haiku']
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
export const PERMISSIONS = ['allow', 'acceptEdits', 'auto', 'plan', 'deny']
export const EXEC_MODES = ['host', 'sandbox', 'container', 'vm']
export const MEMORY_MODES = ['none', 'markdown', 'journal', 'hybrid', 'session']
export const MEMORY_SCOPES = ['agent', 'team', 'global']
export const BACKENDS = ['claude-code', 'dsh']

/** Defaults applied to every agent definition. */
export function normalizeAgent(def) {
  const d = structuredClone(def ?? {})
  assertName(d.name, 'agent name')
  d.description ??= ''
  d.role ??= ''
  d.backend ??= 'claude-code'
  d.model ??= 'sonnet'
  d.permission ??= 'allow'
  d.tools ??= 'default'
  d.disallowedTools ??= []
  d.skills ??= []
  d.subagents ??= []
  d.mcpServers ??= {}
  d.mcp = [...new Set(d.mcp ?? [])]
  for (const m of d.mcp) assertName(m, 'MCP server name')
  for (const m of Object.keys(d.mcpServers)) assertName(m, 'MCP server name')
  if (d.mcpServers.forge_memory) throw new Error(`agent ${d.name}: the MCP server name forge_memory is reserved`)
  if (d.maxBudgetUsd !== undefined && !(Number(d.maxBudgetUsd) > 0)) throw new Error(`agent ${d.name}: maxBudgetUsd must be a positive number`)
  d.settingSources ??= ['project']
  d.tags ??= []
  if (d.project !== undefined && d.project !== null && typeof d.project !== 'string') throw new Error(`agent ${d.name}: project must be a folder path`)
  if (!d.project) delete d.project
  d.folders = (d.folders ?? []).map(f => typeof f === 'string' ? f : f?.path).filter(Boolean)
  d.memory = { mode: 'none', scope: 'agent', injectChars: 6000, ...(d.memory ?? {}) }
  d.execution = { mode: 'host', ...(d.execution ?? {}) }
  if (!BACKENDS.includes(d.backend)) throw new Error(`agent ${d.name}: backend must be one of ${BACKENDS.join(', ')}`)
  if (!PERMISSIONS.includes(d.permission)) throw new Error(`agent ${d.name}: permission must be one of ${PERMISSIONS.join(', ')}`)
  if (!EXEC_MODES.includes(d.execution.mode)) throw new Error(`agent ${d.name}: execution.mode must be one of ${EXEC_MODES.join(', ')}`)
  if (!MEMORY_MODES.includes(d.memory.mode)) throw new Error(`agent ${d.name}: memory.mode must be one of ${MEMORY_MODES.join(', ')}`)
  if (!MEMORY_SCOPES.includes(d.memory.scope)) throw new Error(`agent ${d.name}: memory.scope must be one of ${MEMORY_SCOPES.join(', ')}`)
  if (d.effort !== undefined && !EFFORTS.includes(d.effort)) throw new Error(`agent ${d.name}: effort must be one of ${EFFORTS.join(', ')}`)
  for (const s of d.skills) assertName(s, 'skill name')
  for (const s of d.subagents) assertName(s, 'subagent name')
  return d
}

export class Registry {
  constructor(home = forgeHome()) {
    this.home = home
    this.d = dirs(home)
    for (const p of Object.values(this.d)) fs.mkdirSync(p, { recursive: true })
  }

  // ---------- agents ----------
  listAgents() {
    return readYamlDir(this.d.agents).map(({ value, file }) => {
      if (value.parseError) return { name: path.basename(file, '.yaml'), invalid: `YAML parse error: ${value.parseError}` }
      try { return normalizeAgent(value) } catch (e) { return { name: path.basename(file, '.yaml'), invalid: e.message } }
    })
  }
  getAgent(name) {
    const file = path.join(this.d.agents, `${assertName(name, 'agent name')}.yaml`)
    if (!fs.existsSync(file)) throw new Error(`unknown agent "${name}"`)
    return normalizeAgent(YAML.parse(fs.readFileSync(file, 'utf8')))
  }
  getAgentSource(name) {
    return fs.readFileSync(path.join(this.d.agents, `${assertName(name, 'agent name')}.yaml`), 'utf8')
  }
  saveAgent(def) {
    const norm = normalizeAgent(def)
    for (const s of norm.subagents) if (s === norm.name) throw new Error('an agent cannot list itself as a subagent')
    writeYaml(path.join(this.d.agents, `${norm.name}.yaml`), stripDefaults(def))
    return norm
  }
  saveAgentSource(name, source) {
    const parsed = YAML.parse(source)
    if (parsed?.name !== name) throw new Error(`agent YAML must have name: ${name}`)
    normalizeAgent(parsed)
    fs.writeFileSync(path.join(this.d.agents, `${assertName(name)}.yaml`), source)
    return this.getAgent(name)
  }
  cloneAgent(source, newName, changes = {}) {
    assertName(newName, 'agent name')
    if (fs.existsSync(path.join(this.d.agents, `${newName}.yaml`))) throw new Error(`agent "${newName}" already exists`)
    const src = YAML.parse(this.getAgentSource(source))
    const next = deepMerge(src, changes)
    next.name = newName
    next.clonedFrom = source
    // the clone starts with a copy of the source agent's content folder
    const from = this.agentHome(source).files, to = this.agentHome(newName).files
    if (fs.readdirSync(from).length) fs.cpSync(from, to, { recursive: true, errorOnExist: false, force: false })
    // a clone gets its own memory unless it explicitly shares a namespace
    return this.saveAgent(next)
  }
  /** The agent's own folder (forge/agent-homes/<name>) with its files/ content folder; created on demand. */
  agentHome(name) {
    const home = path.join(this.d.agentHomes, assertName(name, 'agent name'))
    fs.mkdirSync(path.join(home, 'files'), { recursive: true })
    return { home, files: path.join(home, 'files') }
  }

  /** Resolve a configured folder: ~ expands to the user home, relative paths are relative to the forge home. */
  resolveFolder(p) {
    if (!p) return undefined
    if (p === '~' || p.startsWith('~/')) p = path.join(os.homedir(), p.slice(1))
    return path.resolve(this.home, p)
  }

  /** Folders an agent works with: its home and content folder, project folder, extra folders. */
  agentFolders(def) {
    const { home, files } = this.agentHome(def.name)
    return { home, files, project: this.resolveFolder(def.project), extra: def.folders.map(f => this.resolveFolder(f)) }
  }

  deleteAgent(name) {
    fs.rmSync(path.join(this.d.agents, `${assertName(name)}.yaml`), { force: true })
  }

  // ---------- teams ----------
  listTeams() {
    return readYamlDir(this.d.teams).map(({ value }) => ({ members: [], orchestrations: [], description: '', ...value }))
  }
  getTeam(name) {
    const file = path.join(this.d.teams, `${assertName(name, 'team name')}.yaml`)
    if (!fs.existsSync(file)) throw new Error(`unknown team "${name}"`)
    return { members: [], orchestrations: [], ...YAML.parse(fs.readFileSync(file, 'utf8')) }
  }
  saveTeam(team) {
    assertName(team.name, 'team name')
    for (const m of team.members ?? []) this.getAgent(m)
    writeYaml(path.join(this.d.teams, `${team.name}.yaml`), team)
    return team
  }
  deleteTeam(name) { fs.rmSync(path.join(this.d.teams, `${assertName(name)}.yaml`), { force: true }) }

  // ---------- orchestrations ----------
  listOrchestrations() {
    const out = []
    for (const f of safeReaddir(this.d.orchestrations).sort()) {
      const full = path.join(this.d.orchestrations, f)
      if (f.endsWith('.yaml') || f.endsWith('.yml')) {
        try {
          const v = YAML.parse(fs.readFileSync(full, 'utf8'))
          out.push({ name: v.name, format: 'yaml', description: v.description ?? '', team: v.team, args: v.args ?? {}, stages: (v.stages ?? []).length })
        } catch (e) { out.push({ name: f.replace(/\.ya?ml$/, ''), format: 'yaml', invalid: e.message }) }
      } else if (f.endsWith('.js') || f.endsWith('.mjs')) {
        const src = fs.readFileSync(full, 'utf8')
        out.push({ name: f.replace(/\.m?js$/, ''), format: 'js', ...extractJsMeta(src) })
      }
    }
    return out
  }
  orchestrationFile(name) {
    assertName(name, 'orchestration name')
    for (const ext of ['.yaml', '.yml', '.js', '.mjs']) {
      const f = path.join(this.d.orchestrations, name + ext)
      if (fs.existsSync(f)) return { file: f, format: ext.includes('y') ? 'yaml' : 'js' }
    }
    throw new Error(`unknown orchestration "${name}"`)
  }
  getOrchestrationSource(name) {
    const { file, format } = this.orchestrationFile(name)
    return { name, format, source: fs.readFileSync(file, 'utf8') }
  }
  saveOrchestration(name, format, source) {
    assertName(name, 'orchestration name')
    if (!['yaml', 'js'].includes(format)) throw new Error('format must be yaml or js')
    if (format === 'yaml') {
      const v = YAML.parse(source)
      if (v?.name !== name) throw new Error(`orchestration YAML must have name: ${name}`)
      validateYamlOrchestration(v, this)
    }
    for (const ext of ['.yaml', '.yml', '.js', '.mjs']) fs.rmSync(path.join(this.d.orchestrations, name + ext), { force: true })
    fs.writeFileSync(path.join(this.d.orchestrations, `${name}.${format}`), source)
    return { name, format }
  }
  deleteOrchestration(name) {
    const { file } = this.orchestrationFile(name)
    fs.rmSync(file)
  }
}

export function validateYamlOrchestration(v, registry) {
  if (!Array.isArray(v.stages) || v.stages.length === 0) throw new Error('orchestration needs a non-empty stages list')
  const ids = new Set()
  for (const s of v.stages) {
    if (!s.id) throw new Error('every stage needs an id')
    if (ids.has(s.id)) throw new Error(`duplicate stage id ${s.id}`)
    ids.add(s.id)
    const steps = s.parallel ?? [s]
    for (const step of steps) {
      if (!step.agent) throw new Error(`stage ${s.id}: missing agent`)
      if (registry) registry.getAgent(step.agent)
      if (!step.prompt) throw new Error(`stage ${s.id}: missing prompt`)
    }
  }
}

function extractJsMeta(src) {
  const m = src.match(/export\s+const\s+meta\s*=\s*(\{[\s\S]*?\n\})/)
  if (!m) return { description: '' }
  try {
    // meta must be a plain object literal; evaluate it without running the module
    const meta = Function(`"use strict"; return (${m[1]})`)()
    return { description: meta.description ?? '', team: meta.team, args: meta.args ?? {} }
  } catch { return { description: '' } }
}

function safeReaddir(d) { try { return fs.readdirSync(d) } catch { return [] } }

function readYamlDir(dir) {
  return safeReaddir(dir).filter(f => /\.ya?ml$/.test(f)).sort().map(f => {
    const file = path.join(dir, f)
    try { return { file, value: YAML.parse(fs.readFileSync(file, 'utf8')) ?? {} } } catch (e) { return { file, value: { name: f.replace(/\.ya?ml$/, ''), parseError: e.message } } }
  })
}

function writeYaml(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, YAML.stringify(value, { lineWidth: 0 }))
}

function stripDefaults(def) {
  const d = structuredClone(def)
  delete d.invalid
  return d
}

export function deepMerge(a, b) {
  if (b === undefined) return structuredClone(a)
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return structuredClone(b)
  const out = { ...(typeof a === 'object' && a && !Array.isArray(a) ? structuredClone(a) : {}) }
  for (const [k, v] of Object.entries(b)) out[k] = deepMerge(out[k], v)
  return out
}
