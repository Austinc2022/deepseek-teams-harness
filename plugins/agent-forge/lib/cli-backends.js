/**
 * Local CLI backends: run an agent through a locally installed, logged-in
 * coding CLI in non-interactive JSON mode.
 *
 *   claude-cli  `claude -p --output-format stream-json`   (your Claude Code login)
 *   codex       `codex exec --json`                       (your Codex / ChatGPT login)
 *   opencode    `opencode run --format json`              (your OpenCode providers)
 *
 * Every call spawns its own process, so any number of chats, parallel chat
 * replies and workflow stages can run these CLIs at the same time.
 *
 * Binary lookup: agent `cliPath`, then FORGE_CLAUDE_BIN / FORGE_CODEX_BIN /
 * FORGE_OPENCODE_BIN, then the command name on PATH (plus ~/.local/node/bin).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { cleanEnv } from './runner.js'
import { McpLibrary } from './mcp.js'

export const CLI_BACKENDS = ['claude-cli', 'codex', 'opencode']

const BIN = { 'claude-cli': ['FORGE_CLAUDE_BIN', 'claude'], codex: ['FORGE_CODEX_BIN', 'codex'], opencode: ['FORGE_OPENCODE_BIN', 'opencode'] }
const CLAUDE_ALIASES = new Set(['opus', 'sonnet', 'haiku'])
const CLAUDE_PERMISSION = { acceptEdits: 'acceptEdits', auto: 'auto', plan: 'plan', deny: 'dontAsk' }

/** Is this binary available? Used by the console to show install/login hints. */
export function cliStatus() {
  const out = {}
  for (const [backend, [envVar, name]] of Object.entries(BIN)) {
    const bin = resolveBin(process.env[envVar] ?? name)
    out[backend] = { bin, installed: !!bin }
  }
  return out
}

function resolveBin(cmd) {
  if (cmd.includes('/')) return fs.existsSync(cmd) ? cmd : null
  const dirs = [...(process.env.PATH ?? '').split(':'), path.join(os.homedir(), '.local/node/bin'), '/opt/homebrew/bin', '/usr/local/bin']
  for (const d of dirs) {
    const f = path.join(d, cmd)
    try { fs.accessSync(f, fs.constants.X_OK); return f } catch {}
  }
  return null
}

/** Claude model aliases mean "use the CLI's own default" on non-Claude backends. */
function foreignModel(model) {
  return !model || model === 'default' || CLAUDE_ALIASES.has(model) ? undefined : model
}

function summarize(name, input) {
  const i = input ?? {}
  const arg = typeof i === 'string' ? i : (i.command ?? i.cmd ?? i.file_path ?? i.filePath ?? i.path ?? i.pattern ?? i.url ?? i.query ?? i.description ?? i.prompt ?? '')
  const a = Array.isArray(arg) ? arg.join(' ') : String(arg)
  return `${name}${a ? ` ${a.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`
}

function parseStructured(text) {
  const j = text.match(/\{[\s\S]*\}/)
  return JSON.parse(j?.[0] ?? text)
}

/**
 * @param {object} p        runAgent params (def, registry, prompt, schema, signal, onEvent, folders)
 * @param {object} mem      open memory handle
 * @param {string} cwd
 * @param {(s: string) => void} write   transcript writer
 * @param {string} system   system/context text built by the runner
 */
export async function runCli(p, mem, cwd, write, system) {
  const { def } = p
  const [envVar, name] = BIN[def.backend]
  const bin = resolveBin(def.cliPath ?? process.env[envVar] ?? name)
  if (!bin) throw new Error(`${name} CLI not found. Install it (see README) or set ${envVar} / the agent's cliPath.`)

  const extraDirs = [...new Set([p.folders?.home, p.folders?.project, ...(p.folders?.extra ?? []), ...(def.additionalDirectories ?? [])].filter(d => d && d !== cwd))]
  for (const d of extraDirs) fs.mkdirSync(d, { recursive: true })
  const resume = mem.mode === 'session' ? mem.sessionId : undefined
  const env = { ...cleanEnv(), ...(def.env ?? {}) }
  const tmp = []

  let args, stdin, parse
  if (def.backend === 'claude-cli') {
    if (!def.useApiKey) { delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ANTHROPIC_BASE_URL }
    args = ['-p', '--output-format', 'stream-json', '--verbose', '--append-system-prompt', system]
    if (def.model && def.model !== 'default') args.push('--model', def.model)
    if (def.effort) args.push('--effort', def.effort)
    if (def.fallbackModel) args.push('--fallback-model', def.fallbackModel)
    if (def.permission === 'allow') args.push('--dangerously-skip-permissions')
    else args.push('--permission-mode', CLAUDE_PERMISSION[def.permission])
    if (def.tools !== 'default') args.push('--tools', def.tools.join(','))
    if (def.disallowedTools.length) args.push('--disallowedTools', ...def.disallowedTools)
    for (const d of extraDirs) args.push('--add-dir', d)
    const mcp = new McpLibrary(p.registry.d.mcp).forAgent(def)
    if (Object.keys(mcp.servers ?? {}).length) {
      // a private file, not an argument: expanded secrets would otherwise show up in `ps`
      const f = path.join(os.tmpdir(), `forge-mcp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
      fs.writeFileSync(f, JSON.stringify({ mcpServers: mcp.servers }), { mode: 0o600 }); tmp.push(f)
      args.push('--mcp-config', f)
    }
    if (def.externalMcp !== true) args.push('--strict-mcp-config')
    if (def.settingSources?.length) args.push('--setting-sources', def.settingSources.join(','))
    if (resume) args.push('--resume', resume)
    if (mem.mode !== 'session') args.push('--no-session-persistence')
    stdin = p.schema ? `${p.prompt}\n\nReturn ONLY a JSON object matching this JSON Schema, no prose:\n${JSON.stringify(p.schema)}` : p.prompt
    parse = parseClaude
  } else if (def.backend === 'codex') {
    const opts = ['--json', '--skip-git-repo-check', '-C', cwd]
    const model = foreignModel(def.model)
    if (model) opts.push('-m', model)
    if (def.effort) opts.push('-c', `model_reasoning_effort="${def.effort === 'max' ? 'xhigh' : def.effort}"`)
    if (def.permission === 'allow' && def.execution.mode !== 'sandbox') opts.push('--dangerously-bypass-approvals-and-sandbox')
    else opts.push('-s', ['plan', 'deny'].includes(def.permission) ? 'read-only' : 'workspace-write')
    for (const d of extraDirs) opts.push('--add-dir', d)
    if (p.schema) {
      const f = path.join(os.tmpdir(), `forge-codex-schema-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
      fs.writeFileSync(f, JSON.stringify(p.schema)); tmp.push(f)
      opts.push('--output-schema', f)
    }
    // resume takes a narrower option set than a fresh exec
    args = resume ? ['exec', 'resume', '--json', '--skip-git-repo-check', ...(model ? ['-m', model] : []), resume, '-'] : ['exec', ...opts, '-']
    stdin = `${system}\n\n# Task\n${p.prompt}`
    parse = parseCodex
  } else {
    args = ['run', '--format', 'json', '--dir', cwd]
    const model = foreignModel(def.model)
    if (model) args.push('-m', model)
    if (def.effort) args.push('--variant', def.effort)
    if (['plan', 'deny'].includes(def.permission)) args.push('--agent', 'plan')
    else args.push('--auto')
    if (resume) args.push('--session', resume)
    let msg = `${system}\n\n# Task\n${p.prompt}`
    if (p.schema) msg += `\n\nReturn ONLY a JSON object matching this JSON Schema, no prose:\n${JSON.stringify(p.schema)}`
    args.push(msg)
    stdin = ''
    parse = parseOpencode
  }

  const state = { text: '', texts: [], sessionId: undefined, error: undefined, done: false, costUsd: undefined, turns: undefined, isError: false }
  const emit = line => {
    let ev
    try { ev = JSON.parse(line) } catch { return }
    parse(ev, state, p, write)
  }

  const { code, stderr } = await new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], signal: p.signal })
    let buf = '', err = ''
    child.stdout.on('data', d => {
      buf += d
      let i
      while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) emit(l) }
    })
    child.stderr.on('data', d => { err = (err + d).slice(-4000) })
    child.on('error', e => reject(e.name === 'AbortError' ? new Error('stopped') : e))
    child.on('close', code => { if (buf.trim()) emit(buf.trim()); resolve({ code, stderr: err }) })
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
  }).finally(() => { for (const f of tmp) fs.rmSync(f, { force: true }) })

  if (state.sessionId) mem.saveSession(state.sessionId)
  const text = (state.text || state.texts.join('\n\n')).trim()
  if (code !== 0 || state.isError || state.error || (!text && !state.done)) {
    return { ok: false, error: state.error || text || `${name} exited ${code}: ${stderr.trim().slice(-800) || 'no output'}`, sessionId: state.sessionId }
  }
  const res = { ok: true, text, costUsd: state.costUsd, turns: state.turns, sessionId: state.sessionId }
  if (p.schema) {
    try { res.structured = parseStructured(text) } catch { return { ok: false, error: `${name} returned invalid JSON`, sessionId: state.sessionId } }
  }
  return res
}

function parseClaude(m, s, p, write) {
  if (m.type === 'system' && m.subtype === 'init') {
    s.sessionId = m.session_id
    p.onEvent?.({ type: 'init', model: m.model, tools: m.tools })
  } else if (m.type === 'assistant' && m.parent_tool_use_id == null) {
    for (const b of m.message?.content ?? []) {
      if (b.type === 'text' && b.text.trim()) { s.texts = [b.text]; write(`${b.text}\n\n`) }
      else if (b.type === 'tool_use') { const brief = summarize(b.name, b.input); write(`> tool: ${brief}\n\n`); p.onEvent?.({ type: 'tool', name: b.name, brief }) }
    }
  } else if (m.type === 'result') {
    s.done = true
    s.sessionId ??= m.session_id
    s.costUsd = m.total_cost_usd
    s.turns = m.num_turns
    if (m.subtype === 'success' && !m.is_error) s.text = m.result || s.texts.join('')
    else { s.isError = true; s.error = m.errors?.join('; ') || m.result || m.subtype }
  }
}

function parseCodex(ev, s, p, write) {
  if (ev.type === 'thread.started') s.sessionId = ev.thread_id
  else if (ev.type === 'turn.completed') { s.done = true; s.turns = (s.turns ?? 0) + 1 }
  else if (ev.type === 'turn.failed') { s.isError = true; s.error = ev.error?.message ?? 'codex turn failed' }
  else if (ev.type === 'error') { s.error = ev.message ?? 'codex error' }
  else if (ev.type === 'item.completed' || ev.type === 'item.started') {
    const it = ev.item ?? {}
    if (it.type === 'agent_message' && ev.type === 'item.completed' && it.text) { s.texts.push(it.text); s.text = it.text; write(`${it.text}\n\n`) }
    else if (ev.type === 'item.started' && it.type === 'command_execution') { const brief = summarize('Bash', { command: it.command }); write(`> tool: ${brief}\n\n`); p.onEvent?.({ type: 'tool', name: 'Bash', brief }) }
    else if (ev.type === 'item.completed' && it.type === 'file_change') { const brief = summarize('Edit', (it.changes ?? []).map(c => c.path).join(' ')); write(`> tool: ${brief}\n\n`); p.onEvent?.({ type: 'tool', name: 'Edit', brief }) }
    else if (ev.type === 'item.started' && it.type === 'mcp_tool_call') { const brief = summarize(`${it.server}.${it.tool}`, it.arguments); write(`> tool: ${brief}\n\n`); p.onEvent?.({ type: 'tool', name: it.tool, brief }) }
    else if (ev.type === 'item.started' && it.type === 'web_search') { const brief = summarize('WebSearch', it.query); write(`> tool: ${brief}\n\n`); p.onEvent?.({ type: 'tool', name: 'WebSearch', brief }) }
    else if (it.type === 'error' && it.message) s.error = it.message
  }
}

function parseOpencode(ev, s, p, write) {
  s.sessionId ??= ev.sessionID ?? ev.part?.sessionID
  const part = ev.part ?? {}
  if (ev.type === 'text' && part.text) {
    s.texts.push(part.text); write(`${part.text}\n\n`)
  } else if (ev.type === 'tool_use' || part.type === 'tool') {
    if (part.state?.status && part.state.status !== 'completed' && part.state.status !== 'running') return
    const brief = summarize(part.tool ?? 'tool', part.state?.input)
    write(`> tool: ${brief}\n\n`); p.onEvent?.({ type: 'tool', name: part.tool, brief })
  } else if (ev.type === 'step_finish') {
    s.done = true
    s.turns = (s.turns ?? 0) + 1
    if (typeof part.cost === 'number') s.costUsd = (s.costUsd ?? 0) + part.cost
  } else if (ev.type === 'error') {
    s.isError = true
    s.error = ev.error?.data?.message ?? ev.error?.message ?? ev.message ?? 'opencode error'
  }
}
