/**
 * Agent Forge harness plugin.
 *  - Starts the Agent Forge web console on 127.0.0.1 (default port 3091).
 *  - Registers forge_* tools so the harness lead agent can list, build, clone and
 *    run configurable agents, teams and orchestrations.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import YAML from 'yaml'
import { shared } from './lib/shared.js'
import { McpLibrary } from './lib/mcp.js'
import { runAgent } from './lib/runner.js'
import { installSkill, listSkills } from './lib/skills.js'
import { startConsole } from './lib/server.js'

export const name = 'agent-forge'
export const inject = ['tools']

const text = { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] }
const clip = (s, n = 12000) => (s.length > n ? `${s.slice(0, n)}\n… [${s.length - n} more chars]` : s)
const parseJson = (s, what) => {
  if (s === undefined || s === '') return {}
  try { return JSON.parse(s) } catch (e) { throw new Error(`${what} must be a JSON object: ${e.message}`) }
}

export async function apply(ctx, config = {}) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('agent-forge') : null
  const log = m => (logger ? logger.info(m) : console.error(`[agent-forge] ${m}`))
  const { registry, engine, chats } = shared({ maxParallel: config.maxParallel, log })
  let consoleUrl = '(console disabled)'

  if (config.console !== false) {
    await ctx.effect(async () => {
      try {
        const c = await startConsole({ registry, engine, chats, port: config.port ?? 3091, log })
        consoleUrl = c.url
        log(`Agent Forge console: ${c.url}`)
        return () => c.close()
      } catch (e) {
        // another profile (e.g. web while running headless) already serves the console
        consoleUrl = `(console not started here: ${e.code ?? e.message}; use the one on port ${config.port ?? 3091} or ./forge-cli serve)`
        log(consoleUrl)
        return () => {}
      }
    })
  }

  const tools = [
    defineTool({
      name: 'forge_catalog',
      description: 'List Agent Forge agents (configurable Claude Code agents: model, memory, skills, sandbox/VM execution, sub-agents), teams, orchestrations (multi-agent workflows) and installed skills. Call this first when the user asks to run, create, clone or configure agents, teams or orchestrations.',
      parameters: {},
      output: text,
      async execute() {
        const agents = registry.listAgents().map(a => a.invalid ? `- ${a.name}: INVALID ${a.invalid}` : `- ${a.name} [${a.model}${a.effort ? `/${a.effort}` : ''}, ${a.execution.mode}, memory ${a.memory.mode}/${a.memory.scope}${a.skills.length ? `, skills ${a.skills.join('+')}` : ''}${a.subagents.length ? `, subagents ${a.subagents.join('+')}` : ''}]: ${a.description}`)
        const teams = registry.listTeams().map(t => `- ${t.name}: ${t.description} (members: ${t.members.join(', ')})`)
        const orchs = registry.listOrchestrations().map(o => `- ${o.name} [${o.format}]: ${o.description}${o.args && Object.keys(o.args).length ? `\n    args: ${Object.entries(o.args).map(([k, v]) => `${k} (${v})`).join('; ')}` : ''}`)
        const skills = listSkills(registry.d.skills).map(s => `- ${s.name}: ${s.description}`)
        const runs = engine.listRuns(5).map(r => `- ${r.id} ${r.orchestration} ${r.status}`)
        return [
          `Agent Forge home: ${registry.home}`, `Web console: ${consoleUrl}`,
          `\n## Agents\n${agents.join('\n')}`, `\n## Teams\n${teams.join('\n')}`, `\n## Orchestrations\n${orchs.join('\n')}`, `\n## Skills\n${skills.join('\n')}`, `\n## MCP servers (library)\n${new McpLibrary(registry.d.mcp).list().map(m => `- ${m.name} [${m.type ?? 'invalid'}]: ${m.description ?? m.invalid}`).join('\n') || '-'}`, `\n## Recent runs\n${runs.join('\n') || '-'}`,
          '\nAgent YAML fields: name, description, role, model (opus|sonnet|haiku|id), effort, backend (claude-code|claude-cli|codex|opencode|dsh), permission (allow|acceptEdits|auto|plan|deny), tools ("default" or list), skills [..], subagents [..], memory {mode: none|markdown|journal|hybrid|session, scope: agent|team|global, namespace}, execution {mode: host|sandbox|container|vm, allowedDomains, image, command}, maxTurns, maxBudgetUsd, fallbackModel, disallowedTools [..], mcp [names from the MCP library], mcpServers {private servers, Claude Code format}, settingSources [project|local|user], env {..}, builtinSkills, project (default working folder), folders [extra folder paths]. Every agent also has its own folder forge/agent-homes/<name>/ whose files/ subfolder is its content library (listed in its instructions each run); write reference files there to give an agent material.',
          'Orchestration JS: `export const meta = {name, description, team, args}` + `export default async function ({ agent, parallel, pipeline, phase, log, save, args, run }) {...}`; agent(name, prompt, {schema, label, cwd, model, effort}) returns text (or object with schema), null on failure. YAML: stages with agent/prompt or parallel: [...], templates {{args.x}} {{stages.id}} {{date}}.',
        ].join('\n')
      },
    }),
    defineTool({
      name: 'forge_run',
      description: 'Start an Agent Forge orchestration in the background. Returns a run id; poll forge_run_status for progress and the result. Runs can take many minutes.',
      parameters: {
        orchestration: { type: 'string', required: true, description: 'Orchestration name from forge_catalog' },
        args_json: { type: 'string', description: 'JSON object of orchestration args, e.g. {"task":"...","repo":"/abs/path"}' },
        cwd: { type: 'string', description: 'Default working directory for agents (absolute path)' },
      },
      output: text,
      async execute(args) {
        const r = engine.start(args.orchestration, parseJson(args.args_json, 'args_json'), { cwd: args.cwd })
        return `Started run ${r.id} (${args.orchestration}). Artifacts: ${r.dir}. Live view: ${consoleUrl.replace(/\/\?token=.*/, '')} (Runs tab). Check progress with forge_run_status.`
      },
    }),
    defineTool({
      name: 'forge_run_status',
      description: 'Get status, current phase, per-agent progress, log and (when finished) the result of an Agent Forge run.',
      parameters: { run_id: { type: 'string', required: true } },
      output: text,
      async execute(args) {
        const r = engine.getRun(args.run_id)
        const agents = r.agents.map(a => `  ${a.n}. ${a.label} (${a.agent}/${a.model}) ${a.status}${a.error ? ` - ${a.error}` : ''}${a.status === 'running' && a.lastTool ? ` - ${a.lastTool.slice(0, 100)}` : ''}`).join('\n')
        const res = r.result == null ? '' : `\nResult:\n${clip(typeof r.result === 'string' ? r.result : JSON.stringify(r.result, null, 2))}`
        return `Run ${r.id} ${r.orchestration}: ${r.status}; phase ${r.phase ?? '-'}\nAgents:\n${agents || '  -'}\nLog:\n${r.log.slice(-15).map(l => `  ${l.msg}`).join('\n') || '  -'}${r.error ? `\nError: ${clip(r.error, 3000)}` : ''}${res}`
      },
    }),
    defineTool({
      name: 'forge_agent_run',
      description: 'Run one Agent Forge agent on a task and wait for its final answer (uses that agent\'s model, memory, skills, sub-agents and execution environment).',
      parameters: {
        agent: { type: 'string', required: true },
        task: { type: 'string', required: true },
        cwd: { type: 'string', description: 'Working directory (absolute path)' },
      },
      output: text,
      async execute(args, exec) {
        const res = await runAgent({ def: registry.getAgent(args.agent), registry, prompt: args.task, cwd: args.cwd, signal: exec?.signal })
        return res.ok ? clip(res.text ?? JSON.stringify(res.structured, null, 2)) : `Agent failed: ${res.error}`
      },
    }),
    defineTool({
      name: 'forge_agent_save',
      description: 'Create or replace an Agent Forge agent from a YAML definition (see forge_catalog for fields).',
      parameters: { yaml: { type: 'string', required: true, description: 'Complete agent YAML including name' } },
      output: text,
      async execute(args) {
        const def = YAML.parse(args.yaml)
        const a = registry.saveAgent(def)
        return `Saved agent ${a.name} (model ${a.model}, execution ${a.execution.mode}, memory ${a.memory.mode}).`
      },
    }),
    defineTool({
      name: 'forge_agent_clone',
      description: 'Clone an existing Agent Forge agent under a new name, optionally overriding fields (deep-merged), e.g. {"model":"haiku","memory":{"mode":"none"},"execution":{"mode":"sandbox"}}.',
      parameters: {
        source: { type: 'string', required: true },
        name: { type: 'string', required: true },
        changes_json: { type: 'string', description: 'JSON object of field overrides' },
      },
      output: text,
      async execute(args) {
        const a = registry.cloneAgent(args.source, args.name, parseJson(args.changes_json, 'changes_json'))
        return `Cloned ${args.source} → ${a.name} (model ${a.model}, execution ${a.execution.mode}, memory ${a.memory.mode}).`
      },
    }),
    defineTool({
      name: 'forge_orchestration_save',
      description: 'Create or replace an Agent Forge orchestration. format "yaml" (declarative stages) or "js" (code with agent/parallel/pipeline hooks; see forge_catalog).',
      parameters: {
        name: { type: 'string', required: true },
        format: { type: 'string', required: true, enum: ['yaml', 'js'] },
        source: { type: 'string', required: true },
      },
      output: text,
      async execute(args) {
        registry.saveOrchestration(args.name, args.format, args.source)
        return `Saved orchestration ${args.name} (${args.format}). Run it with forge_run.`
      },
    }),
    defineTool({
      name: 'forge_team_save',
      description: 'Create or update an Agent Forge team (a named group of agents used to scope orchestrations and shared team memory).',
      parameters: {
        name: { type: 'string', required: true },
        description: { type: 'string' },
        members: { type: 'array', items: { type: 'string' }, required: true },
      },
      output: text,
      async execute(args) {
        const t = registry.saveTeam({ name: args.name, description: args.description ?? '', members: args.members })
        return `Saved team ${t.name}: ${t.members.join(', ')}`
      },
    }),
    defineTool({
      name: 'forge_skill_install',
      description: 'Install a skill (folder with SKILL.md) into the Agent Forge skill library from github:owner/repo/path[@ref], a GitHub tree URL, or a local directory. Then add it to agents\' skills lists.',
      parameters: {
        source: { type: 'string', required: true },
        name: { type: 'string' },
        overwrite: { type: 'boolean' },
      },
      output: text,
      async execute(args) {
        const r = await installSkill(registry.d.skills, args.source, { name: args.name, overwrite: args.overwrite })
        return `Installed skill ${r.name}: ${r.description}`
      },
    }),
    defineTool({
      name: 'forge_mcp_save',
      description: 'Add or replace an MCP server in the Agent Forge MCP library (shared by all agents; agents select servers by name in their mcp list). Provide YAML with name, description, type (stdio|http|sse), and command/args/env for stdio or url/headers for http/sse. Reference secrets as ${VAR} environment variables, never literal tokens.',
      parameters: { yaml: { type: 'string', required: true } },
      output: text,
      async execute(args) {
        const lib = new McpLibrary(registry.d.mcp)
        const s = lib.save(YAML.parse(args.yaml))
        const t = await lib.test(s.name, 20000)
        return `Saved MCP server ${s.name} (${s.type}). Connection test: ${t.ok ? `ok, ${t.tools.length} tools: ${t.tools.map(x => x.name).slice(0, 30).join(', ')}` : `failed: ${t.error}`}. Add "${s.name}" to an agent's mcp list to use it.`
      },
    }),
    defineTool({
      name: 'forge_chat_start',
      description: 'Open a multi-agent group chat room with Agent Forge agents (or a whole team) and post the first message. Agents reply in order (sequential), all at once (parallel), or only when @mentioned (mention), and can @mention each other. Returns the chat id; read replies with forge_chat_read. The user can follow the room in the Web UI under "Agent chat".',
      parameters: {
        agents: { type: 'array', items: { type: 'string' }, description: 'Agent names (omit when team is given)' },
        team: { type: 'string', description: 'Team name; all members join' },
        message: { type: 'string', required: true },
        mode: { type: 'string', enum: ['sequential', 'parallel', 'mention'] },
        title: { type: 'string' },
        cwd: { type: 'string', description: 'Working directory for the agents (absolute path)' },
      },
      output: text,
      async execute(args) {
        const room = chats.create({ title: args.title, agents: args.agents, team: args.team, mode: args.mode ?? 'sequential', cwd: args.cwd })
        chats.post(room.id, args.message)
        return `Started chat ${room.id} "${room.title}" with ${room.agents.join(', ')} (${room.mode}). Agents are replying now; call forge_chat_read with this id.`
      },
    }),
    defineTool({
      name: 'forge_chat_post',
      description: 'Post a follow-up message to an Agent Forge group chat. Use @name to address specific agents.',
      parameters: { chat_id: { type: 'string', required: true }, message: { type: 'string', required: true } },
      output: text,
      async execute(args) { chats.post(args.chat_id, args.message); return `Posted to ${args.chat_id}. Read replies with forge_chat_read.` },
    }),
    defineTool({
      name: 'forge_chat_read',
      description: 'Read an Agent Forge group chat transcript and whether agents are still replying.',
      parameters: { chat_id: { type: 'string', required: true }, last: { type: 'number', description: 'Only the last N messages (default 12)' } },
      output: text,
      async execute(args) {
        const r = chats.get(args.chat_id)
        const msgs = r.messages.slice(-(args.last ?? 12)).map(m => `[${m.from === 'user' ? 'user' : `@${m.from}`}${m.status && m.status !== 'done' ? ` · ${m.status}` : ''}]\n${m.text || (m.tools?.length ? `(working: ${m.tools.at(-1)})` : '(thinking)')}`)
        return clip(`Chat ${r.id} "${r.title}" (${r.mode}) agents: ${r.agents.join(', ')}; ${r.busy ? 'agents are still replying' : 'idle'}\n\n${msgs.join('\n\n')}`)
      },
    }),
  ]
  for (const t of tools) ctx.effect(() => ctx.tools.register(t))
}
