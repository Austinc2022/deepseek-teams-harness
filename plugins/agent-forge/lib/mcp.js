/**
 * MCP server library: forge/mcp/<name>.yaml, shared by all agents.
 * Agents select servers by name (`mcp: [github, postgres]`) and may also
 * define private ones inline (`mcpServers: {...}` in Claude Code format).
 *
 * Server fields: name, description, type (stdio | http | sse), command, args,
 * env, cwd (stdio), url, headers (http/sse). To hide single tools from one
 * agent, add mcp__<server>__<tool> to that agent's disallowedTools.
 *
 * Secret values: env and header values can reference host environment
 * variables as ${VAR}, resolved only when an agent runs. Values are masked when
 * the API returns a server, and a masked value sent back keeps the stored one.
 */
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { assertName } from './registry.js'

export const MCP_TYPES = ['stdio', 'http', 'sse']
export const MASK = '••••••'

const expand = v => typeof v === 'string' ? v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k) => process.env[k] ?? '') : v
const expandMap = m => Object.fromEntries(Object.entries(m ?? {}).map(([k, v]) => [k, expand(v)]))
// only literal values are secret; ${VAR} references are safe to show
const maskMap = m => Object.fromEntries(Object.entries(m ?? {}).map(([k, v]) => [k, /\$\{[A-Za-z_]\w*\}/.test(String(v)) || v === '' ? v : MASK]))

export function normalizeServer(s) {
  const d = structuredClone(s ?? {})
  assertName(d.name, 'MCP server name')
  d.description ??= ''
  d.type ??= d.url ? 'http' : 'stdio'
  if (!MCP_TYPES.includes(d.type)) throw new Error(`MCP server ${d.name}: type must be one of ${MCP_TYPES.join(', ')}`)
  if (d.type === 'stdio') {
    if (!d.command) throw new Error(`MCP server ${d.name}: command is required for stdio servers`)
    d.args = (d.args ?? []).map(String)
    d.env ??= {}
  } else {
    if (!d.url) throw new Error(`MCP server ${d.name}: url is required for ${d.type} servers`)
    new URL(d.url)
    d.headers ??= {}
  }
  delete d.tools
  return d
}

/** Claude Code / Agent SDK config for one server, with ${VAR} references resolved. */
export function toSdkConfig(s) {
  if (s.type === 'stdio') return { type: 'stdio', command: expand(s.command), args: s.args.map(expand), env: expandMap(s.env), ...(s.cwd ? { cwd: s.cwd } : {}) }
  return { type: s.type, url: expand(s.url), headers: expandMap(s.headers) }
}

export class McpLibrary {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true }) }
  #file(name) { return path.join(this.dir, `${assertName(name, 'MCP server name')}.yaml`) }

  list() {
    return fs.readdirSync(this.dir).filter(f => f.endsWith('.yaml')).sort().map(f => {
      try { return this.masked(normalizeServer(YAML.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')))) }
      catch (e) { return { name: f.replace(/\.yaml$/, ''), invalid: e.message } }
    })
  }
  get(name) {
    const f = this.#file(name)
    if (!fs.existsSync(f)) throw new Error(`unknown MCP server "${name}"`)
    return normalizeServer(YAML.parse(fs.readFileSync(f, 'utf8')))
  }
  masked(s) { return { ...s, ...(s.env ? { env: maskMap(s.env) } : {}), ...(s.headers ? { headers: maskMap(s.headers) } : {}) } }

  /** Save; a value equal to MASK keeps the stored value for that key. */
  save(input) {
    const next = normalizeServer(input)
    let prev = null
    try { prev = this.get(next.name) } catch {}
    for (const key of ['env', 'headers']) {
      if (!next[key]) continue
      for (const [k, v] of Object.entries(next[key])) {
        if (v === MASK) { if (prev?.[key]?.[k] !== undefined) next[key][k] = prev[key][k]; else delete next[key][k] }
      }
    }
    fs.writeFileSync(this.#file(next.name), YAML.stringify(next, { lineWidth: 0 }), { mode: 0o600 })
    return this.masked(next)
  }
  delete(name) { fs.rmSync(this.#file(name), { force: true }) }

  /** mcpServers + allowedTools entries for an agent's library selection plus its inline servers. */
  forAgent(def) {
    const servers = {}, allow = []
    for (const name of def.mcp ?? []) {
      const s = this.get(name)
      servers[name] = toSdkConfig(s)
      allow.push(`mcp__${name}`)
    }
    for (const [name, cfg] of Object.entries(def.mcpServers ?? {})) {
      servers[name] = cfg.type === 'stdio' || cfg.command ? { ...cfg, env: expandMap(cfg.env) } : { ...cfg, headers: expandMap(cfg.headers) }
      allow.push(`mcp__${name}`)
    }
    return { servers, allow }
  }

  /** Connect, list tools, disconnect. */
  async test(name, timeoutMs = 30000) {
    const s = this.get(name)
    const cfg = toSdkConfig(s)
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const client = new Client({ name: 'agent-forge-test', version: '0.1.0' })
    let transport
    if (cfg.type === 'stdio') {
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
      transport = new StdioClientTransport({ command: cfg.command, args: cfg.args, env: { ...process.env, ...cfg.env }, cwd: cfg.cwd, stderr: 'pipe' })
    } else if (cfg.type === 'http') {
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
      transport = new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.headers } })
    } else {
      const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js')
      transport = new SSEClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.headers } })
    }
    let timer
    try {
      const work = (async () => {
        await client.connect(transport)
        const { tools } = await client.listTools()
        return { ok: true, server: client.getServerVersion?.() ?? null, tools: tools.map(t => ({ name: t.name, description: (t.description ?? '').split('\n')[0].slice(0, 200) })) }
      })()
      return await Promise.race([work, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`no answer within ${timeoutMs / 1000}s`)), timeoutMs) })])
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) }
    } finally {
      clearTimeout(timer)
      try { await client.close() } catch {}
    }
  }
}
