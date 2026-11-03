#!/usr/bin/env node
/**
 * Agent Forge CLI (works without the harness running).
 *
 *   forge list                                   agents, teams, orchestrations, skills
 *   forge run <orchestration> [k=v ...] [--cwd D] [--json '{...}']   run and wait
 *   forge agent run <agent> "<task>" [--cwd D]   run one agent
 *   forge agent clone <src> <new> [k=v ...]      clone with overrides (model=opus, memory.mode=none, ...)
 *   forge agent show <agent>
 *   forge skill install <source> [--name N] [--overwrite]
 *   forge skill list
 *   forge runs | forge status <runId>
 *   forge serve [--port 3091]                    web console
 */
import { shared } from '../lib/shared.js'
import { runAgent } from '../lib/runner.js'
import { installSkill, listSkills } from '../lib/skills.js'
import { startConsole } from '../lib/server.js'

const argv = process.argv.slice(2)
const flags = {}
const pos = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const k = argv[i].slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) { flags[k] = next; i++ } else flags[k] = true
  } else pos.push(argv[i])
}

function kvArgs(list) {
  const out = {}
  for (const kv of list) {
    const i = kv.indexOf('=')
    if (i < 0) throw new Error(`expected key=value, got "${kv}"`)
    const keys = kv.slice(0, i).split('.')
    let raw = kv.slice(i + 1)
    let v = raw
    try { v = JSON.parse(raw) } catch {}
    let o = out
    keys.slice(0, -1).forEach(k => { o = o[k] ??= {} })
    o[keys.at(-1)] = v
  }
  return out
}

const { registry: reg, engine, chats } = shared({ log: m => console.error(`[forge] ${m}`) })
const [cmd, sub, ...rest] = pos

try {
  if (!cmd || cmd === 'help') {
    console.log((await import('node:fs')).readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*/, '').replace(/^ \* ?/gm, ''))
  } else if (cmd === 'list') {
    console.log('AGENTS');
    for (const a of reg.listAgents()) console.log(`  ${a.name.padEnd(22)} ${(a.model ?? '').padEnd(7)} ${(a.execution?.mode ?? '').padEnd(8)} mem=${(a.memory?.mode ?? '').padEnd(8)} ${a.invalid ? `INVALID: ${a.invalid}` : a.description}`)
    console.log('TEAMS'); for (const t of reg.listTeams()) console.log(`  ${t.name.padEnd(22)} ${t.members.join(', ')}`)
    console.log('ORCHESTRATIONS'); for (const o of reg.listOrchestrations()) console.log(`  ${o.name.padEnd(22)} [${o.format}] ${o.description}`)
    console.log('SKILLS'); for (const s of listSkills(reg.d.skills)) console.log(`  ${s.name.padEnd(22)} ${s.description.slice(0, 90)}`)
  } else if (cmd === 'run') {
    if (!sub || sub.includes('=')) throw new Error('usage: forge run <orchestration> [k=v ...]')
    const args = { ...(flags.json ? JSON.parse(flags.json) : {}), ...kvArgs(rest) }
    const { id, dir, done } = engine.start(sub, args, { cwd: flags.cwd })
    console.error(`[forge] run ${id} started → ${dir}`)
    let last = ''
    const tick = setInterval(() => {
      const s = engine.getRun(id)
      const running = s.agents.filter(a => a.status === 'running').map(a => `${a.label}${a.lastTool ? ` (${a.lastTool.slice(0, 50)})` : ''}`)
      const line = `[${s.phase ?? '-'}] running: ${running.join(' | ') || '-'}`
      if (line !== last) { console.error(line); last = line }
    }, 5000)
    const state = await done
    clearInterval(tick)
    console.error(`[forge] ${state.status} in ${Math.round((Date.parse(state.endedAt) - Date.parse(state.startedAt)) / 1000)}s`)
    if (state.error) console.error(state.error)
    console.log(typeof state.result === 'string' ? state.result : JSON.stringify(state.result, null, 2))
    process.exitCode = state.status === 'completed' ? 0 : 1
  } else if (cmd === 'agent' && sub === 'run') {
    const [name, ...task] = rest
    const def = reg.getAgent(name)
    const res = await runAgent({ def, registry: reg, prompt: task.join(' '), cwd: flags.cwd, onEvent: e => { if (e.type === 'tool') console.error(`  > ${e.brief}`); else if (e.type === 'init' && flags.verbose) console.error(`  init model=${e.model} skills=${JSON.stringify(e.skills)} tools=${e.tools?.length}`) } })
    console.log(res.ok ? (res.structured ? JSON.stringify(res.structured, null, 2) : res.text) : `FAILED: ${res.error}`)
    console.error(`[forge] ${res.ok ? 'ok' : 'failed'} ${Math.round(res.durationMs / 1000)}s turns=${res.turns ?? '-'}`)
    process.exitCode = res.ok ? 0 : 1
  } else if (cmd === 'agent' && sub === 'clone') {
    const [src, dst, ...kv] = rest
    const a = reg.cloneAgent(src, dst, kvArgs(kv))
    console.log(`cloned ${src} → ${a.name} (model ${a.model}, memory ${a.memory.mode}, execution ${a.execution.mode})`)
  } else if (cmd === 'agent' && sub === 'show') {
    console.log(reg.getAgentSource(rest[0]))
  } else if (cmd === 'skill' && sub === 'install') {
    const r = await installSkill(reg.d.skills, rest[0], { name: flags.name, overwrite: !!flags.overwrite })
    console.log(`installed skill ${r.name} → ${r.path}`)
  } else if (cmd === 'skill' && sub === 'list') {
    for (const s of listSkills(reg.d.skills)) console.log(`${s.name.padEnd(24)} ${s.source.padEnd(40)} ${s.description.slice(0, 80)}`)
  } else if (cmd === 'runs') {
    for (const r of engine.listRuns()) console.log(`${r.id}  ${r.status.padEnd(10)} ${r.orchestration.padEnd(22)} agents=${r.agents}`)
  } else if (cmd === 'status') {
    const s = engine.getRun(sub)
    console.log(JSON.stringify({ ...s, log: s.log.slice(-20) }, null, 2))
  } else if (cmd === 'serve') {
    const c = await startConsole({ registry: reg, engine, chats, port: Number(flags.port ?? 3091) })
    console.log(`Agent Forge console: ${c.url}`)
  } else {
    throw new Error(`unknown command: ${pos.join(' ')} (try: forge help)`)
  }
} catch (e) {
  console.error(`forge: ${e.message}`)
  process.exitCode = 1
}
