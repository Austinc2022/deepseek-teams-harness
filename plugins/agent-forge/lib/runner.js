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
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { openMemory } from './memory.js'
import { buildSkillPlugin } from './skills.js'
import { filesSummary } from './agent-files.js'
import { McpLibrary } from './mcp.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const PERMISSION_MODE = { allow: 'bypassPermissions', acceptEdits: 'acceptEdits', auto: 'auto', plan: 'plan', deny: 'dontAsk' }

/** Default sandbox network allowlist; agents extend it with execution.allowedDomains. */
const DEFAULT_DOMAINS = ['github.com', '*.github.com', '*.githubusercontent.com', 'codeload.github.com', 'registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org', 'crates.io', 'static.crates.io', 'proxy.golang.org']

function memoryMcp(mem) {
  const mcp = new McpServer({ name: 'forge-memory', version: '1.0.0' }, { capabilities: { tools: {} } })
  mcp.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mem.toolDefs }))
  mcp.server.setRequestHandler(CallToolRequestSchema, async req => {
    try {
      return { content: [{ type: 'text', text: String(mem.handle(req.params.name, req.params.arguments ?? {})) }] }
    } catch (e) {
      return { content: [{ type: 'text', text: `memory error: ${e.message}` }], isError: true }
    }
  })
  return { type: 'sdk', name: 'forge_memory', instance: mcp }
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
  const folders = registry.agentFolders(def)
  p.folders = folders
  const cwd = path.resolve(p.cwd ?? folders.project ?? (def.cwd ? registry.resolveFolder(def.cwd) : folders.home))
  fs.mkdirSync(cwd, { recursive: true })
  const mem = openMemory(registry.home, def, { team: p.team })
  const write = line => { if (p.transcriptFile) fs.appendFileSync(p.transcriptFile, line) }
  write(`# ${p.label ?? def.name} (${def.name})\n\n- model: ${def.model}${def.effort ? ` / effort ${def.effort}` : ''}\n- backend: ${def.backend}\n- execution: ${def.execution.mode}\n- memory: ${def.memory.mode}\n- cwd: ${cwd}\n\n## Task\n\n${p.prompt}\n\n## Transcript\n\n`)

  let res
  try {
    res = def.backend === 'dsh' ? await runDsh(p, mem, cwd) : await runClaudeCode(p, mem, cwd, write)
  } catch (e) {
    res = { ok: false, error: e?.message ?? String(e) }
  }
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
  if (mem.toolDefs.length) parts.push('Use the memory_* tools to record durable lessons, decisions and facts worth remembering next time.')
  return parts.join('\n\n')
}

async function runClaudeCode(p, mem, cwd, write) {
  const { def, registry } = p
  const abort = new AbortController()
  if (p.signal) p.signal.addEventListener('abort', () => abort.abort(), { once: true })

  const env = { ...cleanEnv(), CLAUDE_AGENT_SDK_CLIENT_APP: 'agent-forge/0.1.0' }
  if (!def.useApiKey) { delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ANTHROPIC_BASE_URL }
  Object.assign(env, def.env ?? {})

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
          p.onEvent?.({ type: 'tool', name: b.name, brief })
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
