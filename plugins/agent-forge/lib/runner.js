/**
 * Run one forge agent to completion.
 *
 * backend claude-code (default): a genuine Claude Code session via the Claude
 *   Agent SDK on the local Claude Code login (Claude subscription), configured
 *   from the agent definition: model, effort, permission mode, built-in tools,
 *   skills (per-agent plugin), memory (MCP tools + injected context), native
 *   subagents, MCP servers and execution environment.
 * backend dsh: the task runs through `dsh headless` with the agent's
 *   provider/model, e.g. a DeepSeek model; memory context is injected into the
 *   prompt (no skills/subagents/sandbox options on this backend).
 *
 * Backup models (def.fallbacks): when the primary run fails, returns an empty reply or the
 * model declines (stop_reason "refusal"), the same prompt runs on the next backup model.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { openMemory, agentKind, areasOf } from './memory.js'
import { getKnowledge, knowledgeTools } from './knowledge.js'
import { currentMemory } from './memctx.js'
import { buildSkillPlugin } from './skills.js'
import { filesSummary } from './agent-files.js'
import { McpLibrary } from './mcp.js'
import { runCli, CLI_BACKENDS } from './cli-backends.js'
import { deepMerge, normalizeAgent } from './registry.js'
import { providerEnv } from './providers.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const PERMISSION_MODE = { allow: 'bypassPermissions', acceptEdits: 'acceptEdits', auto: 'auto', plan: 'plan', deny: 'dontAsk' }

/** Default sandbox network allowlist; agents extend it with execution.allowedDomains. */
const DEFAULT_DOMAINS = ['github.com', '*.github.com', '*.githubusercontent.com', 'codeload.github.com', 'registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org', 'crates.io', 'static.crates.io', 'proxy.golang.org']

/** An in-process MCP server from tool definitions and a (possibly async) handler. */
export function toolsMcp(name, toolDefs, handle) {
  const mcp = new McpServer({ name: name.replace(/_/g, '-'), version: '1.0.0' }, { capabilities: { tools: {} } })
  mcp.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefs }))
  mcp.server.setRequestHandler(CallToolRequestSchema, async req => {
    try {
      return { content: [{ type: 'text', text: String(await handle(req.params.name, req.params.arguments ?? {})) }] }
    } catch (e) {
      return { content: [{ type: 'text', text: `${name} error: ${e.message}` }], isError: true }
    }
  })
  return { type: 'sdk', name, instance: mcp }
}

const memoryMcp = mem => toolsMcp('forge_memory', mem.toolDefs, (n, a) => mem.handle(n, a))

/** The folder an agent run works in: explicit run/chat folder, else the agent's project folder, else its own home folder. */
export function resolveCwd(registry, def, cwd) {
  const folders = registry.agentFolders(def)
  return path.resolve(cwd ?? folders.project ?? (def.cwd ? registry.resolveFolder(def.cwd) : folders.home))
}

/** A one-shot, tool-less Claude call (e.g. summaries). Returns the structured output with a schema, else the text. */
export async function quickQuery({ prompt, system, schema, model = 'haiku', signal }) {
  const abort = new AbortController()
  if (signal) signal.addEventListener('abort', () => abort.abort(), { once: true })
  const env = { ...cleanEnv(), CLAUDE_AGENT_SDK_CLIENT_APP: 'agent-forge/0.1.0' }
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ANTHROPIC_BASE_URL
  const options = {
    model, cwd: os.tmpdir(), abortController: abort, env, tools: [], persistSession: false, maxTurns: 3,
    systemPrompt: system ?? 'You summarize multi-agent project activity accurately and concisely.',
    settingSources: [], strictMcpConfig: true, settings: { autoMemoryEnabled: false, disableClaudeAiConnectors: true },
  }
  if (schema) options.outputFormat = { type: 'json_schema', schema }
  let result
  for await (const m of query({ prompt, options })) if (m.type === 'result') result = m
  if (!result || result.subtype !== 'success' || result.is_error) throw new Error(result?.errors?.join('; ') || result?.result || 'summary failed')
  if (schema) return result.structured_output ?? JSON.parse(result.result)
  return result.result
}

/** Parent env minus session variables of any Claude Code process that launched the forge. */
export function cleanEnv() {
  const keep = new Set(['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX'])
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.has(k) || !/^(CLAUDECODE$|CLAUDE_CODE_|CLAUDE_PID$|CLAUDE_EFFORT$|CLAUDE_AGENT_SDK_)/.test(k)))
}

const shq = s => `'${String(s).replace(/'/g, `'\\''`)}'`
const FORWARD_ENV = /^(CLAUDE|ANTHROPIC|MCP_|ENABLE_|DISABLE_|MAX_|BASH_|NODE_OPTIONS$|HTTPS?_PROXY$|NO_PROXY$)/

/** Custom spawner for container / VM execution. The remote side must have the `claude` CLI and a login (CLAUDE_CODE_OAUTH_TOKEN). */
function remoteSpawner(def, cwd, extraDirs = []) {
  const ex = def.execution
  return opts => {
    const env = Object.entries(opts.env ?? {}).filter(([k, v]) => v !== undefined && FORWARD_ENV.test(k))
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN && !env.some(([k]) => k === 'CLAUDE_CODE_OAUTH_TOKEN')) env.push(['CLAUDE_CODE_OAUTH_TOKEN', process.env.CLAUDE_CODE_OAUTH_TOKEN])
    const claudeBin = ex.claudePath ?? 'claude'
    let cmd, args
    if (ex.mode === 'container') {
      const runtime = ex.runtime ?? 'docker'
      cmd = runtime
      args = ['run', '-i', '--rm', '-v', `${cwd}:${cwd}`, '-w', cwd]
      for (const d of extraDirs) args.push('-v', `${d}:${d}`)
      for (const m of ex.mounts ?? []) args.push('-v', m)
      for (const [k] of env) args.push('-e', k)
      if (ex.network === false) args.push('--network', 'none')
      args.push(...(ex.runArgs ?? []), ex.image ?? 'agent-forge-claude:latest', claudeBin, ...opts.args)
      const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...Object.fromEntries(env) }, signal: opts.signal })
      return child
    }
    // vm: prefix command such as ["ssh", "-T", "devbox"] or ["limactl", "shell", "default"]
    const prefix = ex.command ?? ['ssh', '-T', ex.host ?? 'localhost']
    const remoteCwd = ex.remoteCwd ?? cwd
    const line = `cd ${shq(remoteCwd)} && env ${env.map(([k, v]) => `${k}=${shq(v)}`).join(' ')} ${shq(claudeBin)} ${opts.args.map(shq).join(' ')}`
    cmd = prefix[0]
    args = [...prefix.slice(1), line]
    return spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], signal: opts.signal })
  }
}

/**
 * @param {object} p
 * @param {object} p.def            normalized agent definition
 * @param {import('./registry.js').Registry} p.registry
 * @param {string} p.prompt
 * @param {string} [p.cwd]
 * @param {Record<string, object>} [p.extraMcp] extra in-process MCP servers (claude-code backend only), e.g. from toolsMcp()
 * @param {object} [p.schema]       JSON schema for structured output
 * @param {string} [p.team]         team name (for team-scoped memory)
 * @param {string} [p.runId]
 * @param {string} [p.label]
 * @param {(e: object) => void} [p.onEvent]
 * @param {AbortSignal} [p.signal]
 * @param {string} [p.transcriptFile]
 */
export async function runAgent(p) {
  const { def, registry } = p
  const t0 = Date.now()
  // working folder: explicit run/chat folder, else the agent's project folder, else its own home folder
  p.folders = registry.agentFolders(def)
  const cwd = resolveCwd(registry, def, p.cwd)
  fs.mkdirSync(cwd, { recursive: true })
  // the purpose this run serves: said by the caller, or carried by the work it belongs to (memctx)
  const mctx = currentMemory()
  const purpose = p.purpose ?? mctx.purpose ?? null
  const mem = openMemory(registry.home, def, { team: p.team, purpose, fresh: p.fresh ?? mctx.fresh, forkFrom: mctx.forkFrom })
  p.know = openKnowledge(registry.home, def, { prompt: p.prompt, purpose, runId: p.runId, label: p.label, memory: mem.injected })
  const write = line => { if (p.transcriptFile) fs.appendFileSync(p.transcriptFile, line) }
  write(`# ${p.label ?? def.name} (${def.name})\n\n- model: ${def.model}${def.effort ? ` / effort ${def.effort}` : ''}\n- backend: ${def.backend}\n- execution: ${def.execution.mode}\n- memory: ${mem.mode}${purpose ? ` (purpose ${purpose})` : ''}\n- knowledge: ${p.know.ids.length} fact(s) in context\n- cwd: ${cwd}\n\n## Task\n\n${p.prompt}\n\n## Transcript\n\n`)

  // primary model, then each backup model in order (see normalizeFallbacks)
  const backup = f => {
    const d = deepMerge(def, { ...f, fallbacks: [] })
    delete d.fallbackModel
    if (f.backend && f.backend !== def.backend && !f.provider) delete d.provider
    return normalizeAgent(d)
  }
  const plan = [def, ...(def.fallbacks ?? []).map(backup)]
  const attempts = []
  let res
  for (let i = 0; i < plan.length; i++) {
    const d = plan[i]
    // a backup does not resume or overwrite the primary model's saved session
    const m = i === 0 ? mem : { ...mem, sessionId: null, saveSession() {} }
    if (i > 0) {
      const why = attempts.at(-1).reason
      write(`\n## Switching to backup model ${i}: ${d.backend} / ${d.model} (${why})\n\n`)
      p.onEvent?.({ type: 'fallback', backend: d.backend, model: d.model, reason: why, brief: `backup model ${d.backend}/${d.model} after: ${why}` })
    }
    try {
      const q = { ...p, def: d }
      res = d.backend === 'dsh' ? await runDsh(q, m, cwd)
        : CLI_BACKENDS.includes(d.backend) ? await runCli(q, m, cwd, write, systemAppend(d, m, q, cwd))
        : await runClaudeCode(q, m, cwd, write)
    } catch (e) {
      res = { ok: false, error: e?.message ?? String(e) }
    }
    if (res.ok && !res.refused && (res.structured !== undefined || String(res.text ?? '').trim())) { attempts.push({ backend: d.backend, model: d.model, ok: true }); break }
    const reason = res.refused ? 'the model declined the request' : !res.ok ? String(res.error ?? 'failed').replace(/\s+/g, ' ').slice(0, 200) : 'empty reply'
    if (res.ok) res = { ...res, ok: false, error: res.refused ? `${d.model} declined the request${res.text ? `: ${res.text}` : ''}` : `${d.model} returned an empty reply` }
    attempts.push({ backend: d.backend, model: d.model, ok: false, reason })
    if (p.signal?.aborted) break
  }
  if (attempts.length > 1) { res.attempts = attempts; if (res.ok) res.usedModel = `${attempts.at(-1).backend}/${attempts.at(-1).model}` }
  res.durationMs = Date.now() - t0
  write(`\n## Result (${res.ok ? 'ok' : 'failed'}, ${Math.round(res.durationMs / 1000)}s${res.turns ? `, ${res.turns} turns` : ''})\n\n${res.ok ? (res.structured !== undefined ? '```json\n' + JSON.stringify(res.structured, null, 2) + '\n```' : res.text) : res.error}\n`)
  try { mem.afterRun({ task: p.prompt, outcome: res.ok ? (res.text ?? JSON.stringify(res.structured)) : `FAILED: ${res.error}`, label: p.label, runId: p.runId, ok: res.ok }) } catch {}
  return res
}

function systemAppend(def, mem, p, cwd) {
  const parts = []
  if (def.role) parts.push(`# Your role: ${def.name}\n${def.role.trim()}`)
  parts.push(p.contextNote
    ? `# Operating context\n${p.contextNote} Working directory: ${cwd}. Today: ${new Date().toISOString().slice(0, 10)}.`
    : `# Operating context\nYou are agent "${def.name}" in an Agent Forge orchestration${p.runId ? ` (run ${p.runId})` : ''}. You run unattended: there is no human to answer questions, so make reasonable decisions, state assumptions, and finish the task. Working directory: ${cwd}. Today: ${new Date().toISOString().slice(0, 10)}.`)
  if (p.folders) {
    const f = p.folders
    parts.push([
      '# Your folders',
      `- Your own folder: ${f.home} (persistent; yours alone). Its files/ subfolder is your content library: reference docs, notes and data you were given or keep. Read it when relevant and save durable work products there.`,
      f.project ? `- Project folder: ${f.project}${f.project === cwd ? ' (current working directory)' : ''}` : null,
      ...f.extra.map(x => `- Extra folder you may use: ${x}`),
      `\nContent library (${f.files}):\n${filesSummary(f.files)}`,
    ].filter(Boolean).join('\n'))
  }
  if (mem.context) parts.push(mem.context)
  if (mem.toolDefs.length) parts.push('Memory is for what the next run of you cannot see for itself: the state of the work, tested rules, decisions and traps. Read it first and test it; it can be wrong or out of date.')
  if (p.know?.context) parts.push(p.know.context)
  return parts.join('\n\n')
}

/**
 * Company knowledge for one run: the relevant facts in the context (logged, so the owner can see what the agent
 * knew) and the knowledge tools. Judges see measured facts only and cannot add.
 */
function openKnowledge(home, def, { prompt, purpose, runId, label, memory }) {
  const none = { context: '', ids: [], toolDefs: [], handle: null }
  if (def.knowledge === false) return none
  try {
    const kb = getKnowledge(home)
    const kind = agentKind(def)
    const judge = kind === 'judge'
    const areas = areasOf(def)
    const c = kb.context({ query: `${purpose ?? ''} ${String(prompt).slice(0, 6000)}`, purpose, areas, measuredOnly: judge, budget: def.knowledge?.injectChars ?? 2600, runId, label, agent: def.name, memory })
    const t = knowledgeTools(kb, { judge, by: def.name, areas, purpose, area: def.knowledge?.area ?? areas[0] })
    return { context: c.text, ids: c.ids, toolDefs: t.defs, handle: t.handle }
  } catch { return none }
}

async function runClaudeCode(p, mem, cwd, write) {
  const { def, registry } = p
  const abort = new AbortController()
  if (p.signal) p.signal.addEventListener('abort', () => abort.abort(), { once: true })

  const env = { ...cleanEnv(), CLAUDE_AGENT_SDK_CLIENT_APP: 'agent-forge/0.1.0' }
  if (!def.useApiKey) { delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ANTHROPIC_BASE_URL }
  Object.assign(env, def.env ?? {})
  // provider: deepseek (and similar) sends this session's model calls to that provider's Anthropic-compatible API
  Object.assign(env, providerEnv(def))

  const permissionMode = PERMISSION_MODE[def.permission]
  const mcp = new McpLibrary(registry.d.mcp).forAgent(def)
  const options = {
    model: def.model,
    cwd,
    abortController: abort,
    systemPrompt: { type: 'preset', preset: 'claude_code', append: systemAppend(def, mem, p, cwd) },
    tools: def.tools === 'default' ? { type: 'preset', preset: 'claude_code' } : def.tools,
    disallowedTools: def.disallowedTools,
    permissionMode,
    allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions',
    settingSources: def.settingSources,
    mcpServers: mcp.servers,
    allowedTools: mcp.allow,
    env,
    // forge memory replaces Claude Code's per-project auto memory unless the agent opts in
    // only the MCP servers chosen for this agent, unless it opts into Claude Code's own MCP config and claude.ai connectors
    settings: { autoMemoryEnabled: def.memory.claudeAutoMemory === true, ...(def.externalMcp === true ? {} : { disableClaudeAiConnectors: true }) },
    strictMcpConfig: def.externalMcp !== true,
  }
  // permissionRules: { allow: [...], deny: [...] } in Claude Code's rule syntax, e.g. deny: ['Read(//abs/secret/**)']
  if (def.permissionRules && typeof def.permissionRules === 'object') {
    const list = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : [])
    options.settings.permissions = { allow: list(def.permissionRules.allow), deny: list(def.permissionRules.deny) }
  }
  if (def.effort) options.effort = def.effort
  if (def.maxTurns) options.maxTurns = def.maxTurns
  if (def.maxBudgetUsd) options.maxBudgetUsd = Number(def.maxBudgetUsd)
  if (def.fallbackModel) options.fallbackModel = def.fallbackModel
  const extraDirs = [p.folders?.home, p.folders?.project, ...(p.folders?.extra ?? []), ...(def.additionalDirectories ?? [])].filter(d => d && d !== cwd)
  for (const d of extraDirs) fs.mkdirSync(d, { recursive: true })
  if (extraDirs.length) options.additionalDirectories = [...new Set(extraDirs)]
  if (p.schema) options.outputFormat = { type: 'json_schema', schema: p.schema }

  if (mem.toolDefs.length) {
    options.mcpServers.forge_memory = memoryMcp(mem)
    options.allowedTools = [...(options.allowedTools ?? []), 'mcp__forge_memory']
  }
  if (p.know?.toolDefs.length) {
    options.mcpServers.forge_knowledge = toolsMcp('forge_knowledge', p.know.toolDefs, (n, a) => p.know.handle(n, a))
    options.allowedTools = [...(options.allowedTools ?? []), 'mcp__forge_knowledge']
  }
  // extra in-process tool servers from the caller (e.g. the chat supervisor's worker tools)
  for (const [name, server] of Object.entries(p.extraMcp ?? {})) {
    options.mcpServers[name] = server
    options.allowedTools = [...(options.allowedTools ?? []), `mcp__${name}`]
  }
  if (mem.mode === 'session' && mem.sessionId) options.resume = mem.sessionId
  options.persistSession = mem.mode === 'session'

  const plugin = buildSkillPlugin(registry.d.cache, registry.d.skills, def.name, def.skills)
  if (plugin) options.plugins = [{ type: 'local', path: plugin }]
  // Only the agent's selected skills are visible unless it opts into Claude Code's bundled/user skills.
  if (def.builtinSkills !== true) options.skills = def.skills.map(s => `forge-${def.name}:${s}`)

  if (def.subagents.length) {
    options.agents = {}
    for (const name of def.subagents) {
      const sub = registry.getAgent(name)
      options.agents[name] = {
        description: sub.description || `Forge agent ${name}`,
        prompt: sub.role || sub.description,
        model: sub.model,
        ...(sub.tools !== 'default' ? { tools: sub.tools } : {}),
      }
    }
  }

  const ex = def.execution
  if (ex.mode === 'sandbox') {
    options.sandbox = {
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      network: ex.network === false
        ? { allowedDomains: [] }
        : { allowedDomains: [...DEFAULT_DOMAINS, ...(ex.allowedDomains ?? [])], allowLocalBinding: ex.allowLocalBinding ?? false },
      filesystem: { allowWrite: [cwd, os.tmpdir(), ...extraDirs, ...(ex.allowWrite ?? [])], denyRead: ex.denyRead ?? [path.join(os.homedir(), '.ssh'), path.join(os.homedir(), '.aws')] },
      ...(ex.sandbox ?? {}),
    }
  } else if (ex.mode === 'container' || ex.mode === 'vm') {
    options.spawnClaudeCodeProcess = remoteSpawner(def, cwd, extraDirs)
  }

  let text = ''
  let result
  let sessionId
  for await (const m of query({ prompt: p.prompt, options })) {
    if (m.type === 'system' && m.subtype === 'init') {
      sessionId = m.session_id
      p.onEvent?.({ type: 'init', model: m.model, tools: m.tools, skills: m.skills })
    } else if (m.type === 'assistant' && m.parent_tool_use_id == null) {
      for (const b of m.message.content) {
        if (b.type === 'text' && b.text.trim()) { text = b.text; write(`${b.text}\n\n`) }
        else if (b.type === 'tool_use') {
          const brief = summarizeTool(b)
          write(`> tool: ${brief}\n\n`)
          p.onEvent?.({ type: 'tool', name: b.name, brief, input: b.input })
        }
      }
    } else if (m.type === 'result') {
      result = m
    }
  }
  mem.saveSession(sessionId)
  if (!result) return { ok: false, error: 'Claude Code ended without a result', sessionId }
  const ok = result.subtype === 'success' && !result.is_error
  return {
    ok,
    refused: result.stop_reason === 'refusal',
    text: ok ? (result.result || text) : undefined,
    structured: result.structured_output,
    error: ok ? undefined : (result.errors?.join('; ') || result.result || result.subtype),
    costUsd: result.total_cost_usd,
    turns: result.num_turns,
    sessionId,
  }
}

function summarizeTool(b) {
  const i = b.input ?? {}
  const arg = i.command ?? i.file_path ?? i.path ?? i.pattern ?? i.url ?? i.query ?? i.description ?? i.prompt ?? ''
  return `${b.name}${arg ? ` ${String(arg).replace(/\s+/g, ' ').slice(0, 160)}` : ''}`
}

async function runDsh(p, mem, cwd) {
  const { def } = p
  const root = path.resolve(here, '../../..')
  const launcher = path.join(root, 'dsh')
  const patchFile = path.join(p.registry.d.cache, `dsh-model-${def.name}.patch.yml`)
  fs.writeFileSync(patchFile, `- id: agent-default-model\n  name: '@deepseek-ai/dsh-agent-default-model'\n  config:\n    provider: ${def.provider ?? 'claude-code'}\n    model: ${def.model}\n`)
  let prompt = p.prompt
  const pre = systemAppend(def, mem, p, cwd)
  prompt = `${pre}\n\n# Task\n${prompt}`
  if (p.schema) prompt += `\n\nReturn ONLY a JSON object matching this JSON Schema, no prose:\n${JSON.stringify(p.schema)}`
  const out = await new Promise((resolve, reject) => {
    const child = spawn(launcher, ['--profile', 'headless', '--patch', patchFile, '-'], { cwd, stdio: ['pipe', 'pipe', 'pipe'], signal: p.signal })
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`dsh headless exited ${code}: ${stderr.slice(-800)}`)))
    child.stdin.end(prompt)
  })
  const text = out.trim()
  if (p.schema) {
    const j = text.match(/\{[\s\S]*\}/)
    try { return { ok: true, text, structured: JSON.parse(j?.[0] ?? text) } } catch { return { ok: false, error: 'dsh backend returned invalid JSON' } }
  }
  return { ok: true, text }
}
