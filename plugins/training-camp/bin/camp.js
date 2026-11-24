#!/usr/bin/env node
/**
 * Training camp CLI (works without the harness running).
 *
 *   camp new "goal" [--name x] [--idea "your own idea of the stages"] [--no-propose]
 *                                  open a camp and let the architect propose the workflow
 *   camp list
 *   camp status <id>               scoreboard, what is running, what passed
 *   camp workflow <id> [--json]    show the current workflow
 *   camp workflow <id> --set file.json     replace it with your own edit
 *   camp workflow <id> --history           every version and what changed
 *   camp workflow <id> --restore <n>       go back to version n
 *   camp change <id> "what to change"      ask the architect to change the workflow
 *   camp approve <id>              approve the current workflow version
 *   camp train <id> [--roles a,b]  start or resume training, and wait for it
 *   camp stop <id>
 *   camp trials <id> <role>        every scored trial of a role ("_team" for the team)
 *   camp skills <id>               skills found on GitHub; camp skill <id> <n> approve|reject
 *   camp set <id> key=value ...    change settings, e.g. budgetUsd=40 rounds=3 trainee.model=haiku
 *   camp settings <id>             show the settings
 *   camp redo <id> scout|sets|base|rounds|verify|team   run one training stage again (later stages go with it)
 *   camp fresh <id>                start the camp fresh: keeps goal, settings and workflow; clears tasks and scores
 *   camp reset <id> [role|_team|all] [--datasets]
 *   camp publish <id> [--force]    write the trained agents, teams and workflow into Agent Forge
 *   camp rollback <id>             undo the last publish
 *   camp delete <id>
 */
import fs from 'node:fs'
import { shared } from '../../agent-forge/lib/shared.js'
import { camps } from '../lib/camp.js'
import { workflowText } from '../lib/workflow.js'

const [cmd, ...rest] = process.argv.slice(2)
const flag = n => { const i = rest.indexOf(`--${n}`); return i >= 0 ? (rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : true) : undefined }
const flags = new Set(['name', 'idea', 'set', 'restore', 'roles'])
const pos = rest.filter((a, i) => !a.startsWith('--') && !(rest[i - 1]?.startsWith('--') && flags.has(rest[i - 1].slice(2))))
const cs = camps(shared({ log: m => console.error(`[forge] ${m}`) }), { log: m => console.error(`[camp] ${m}`) })

const need = (v, what) => { if (!v) { console.error(`missing ${what}; see: camp help`); process.exit(2) } return v }

/** Follow a run: print the camp's log lines as they appear, then the run's result. */
async function follow(id, { runId, done }) {
  console.error(`run ${runId} started`)
  let seen = cs.store.read(id).log.length
  const t = setInterval(() => {
    const log = cs.store.read(id).log
    for (const l of log.slice(seen)) console.error(`  ${l.ts.slice(11, 19)} ${l.msg}`)
    seen = log.length
  }, 3000)
  process.on('SIGINT', () => { console.error('\nstopping (training resumes later with: camp train)'); cs.cancel(id) })
  const st = await done
  clearInterval(t)
  if (st.status === 'failed') { console.error(`failed: ${String(st.error).split('\n')[0]}`); process.exitCode = 1 } else console.log(typeof st.result === 'string' ? st.result : JSON.stringify(st.result, null, 2))
}

function parseValue(v) {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v)
  if (/^[[{]/.test(v)) { try { return JSON.parse(v) } catch {} }
  return v.includes(',') ? v.split(',').map(s => s.trim()).filter(Boolean) : v
}

async function main() {
  const id = pos[0]
  switch (cmd) {
    case 'new': {
      const c = cs.create({ goal: need(pos[0], 'the goal'), name: flag('name'), hint: flag('idea') })
      console.log(`camp ${c.id} "${c.name}"`)
      if (!flag('no-propose')) await follow(c.id, cs.propose(c.id))
      console.log(`\nNext: ask for changes with  camp change ${c.id} "..."  or approve with  camp approve ${c.id}`)
      break
    }
    case 'list': console.log(cs.list().map(c => `${c.id}  ${c.status.padEnd(10)} v${c.workflowVersion}  $${c.spend.usd}  ${c.name}`).join('\n') || 'no camps'); break
    case 'status': {
      const c = cs.get(need(id, 'the camp id'))
      console.log(c.report)
      if (c.run) console.log(`\nLast run ${c.run.id} (${c.run.what}): ${c.run.status}${c.run.phase ? `, phase ${c.run.phase}` : ''}${c.run.error ? `\n  ${c.run.error}` : ''}${c.run.running.length ? `\n  running: ${c.run.running.map(x => x.label).join(', ')}` : ''}`)
      console.log(`\nLog:\n${c.log.slice(-12).map(l => `  ${l.ts.slice(0, 16)} ${l.msg}`).join('\n')}`)
      break
    }
    case 'propose': await follow(need(id, 'the camp id'), cs.propose(id)); break
    case 'workflow': {
      need(id, 'the camp id')
      if (flag('set')) { cs.setWorkflow(id, JSON.parse(fs.readFileSync(String(flag('set')), 'utf8'))); console.log('saved as a new version; approve it with: camp approve') }
      else if (flag('restore')) { cs.restoreWorkflow(id, flag('restore')); console.log('restored as a new version; approve it with: camp approve') }
      else if (flag('history')) console.log(cs.workflowVersions(id).map(h => `v${h.version}  ${h.ts.slice(0, 16)}  ${h.by}: ${h.note}${h.changes ? `\n${h.changes.map(x => `      - ${x}`).join('\n')}` : ''}`).join('\n'))
      else {
        const c = cs.store.read(id)
        if (!c.workflow) console.log('no workflow yet; run: camp propose')
        else console.log(flag('json') ? JSON.stringify(c.workflow, null, 2) : `Workflow v${c.workflowVersion}${c.approvedVersion === c.workflowVersion ? ' (approved)' : ' (waits for your approval)'}\n\n${workflowText(c.workflow)}`)
      }
      break
    }
    case 'change': await follow(need(id, 'the camp id'), cs.revise(id, need(pos[1], 'what to change'))); break
    case 'approve': { const r = cs.approve(need(id, 'the camp id')); console.log(`approved workflow v${r.camp.workflowVersion}${r.kept.length ? `; kept the training of ${r.kept.join(', ')}` : ''}${r.reset.length ? `; to train: ${r.reset.join(', ')}` : ''}`); break }
    case 'train': await follow(need(id, 'the camp id'), cs.train(id, flag('roles') ? { roles: String(flag('roles')).split(',') } : {})); break
    case 'drain': console.log(JSON.stringify(cs.drain(need(id, 'the camp id')))); break
    case 'stop': console.log(JSON.stringify(cs.cancel(need(id, 'the camp id')))); break
    case 'trials': console.log(cs.trials(need(id, 'the camp id'), need(pos[1], 'the role')).map(t => `${t.split.padEnd(7)} ${t.cand.padEnd(12)} ${String(t.score).padEnd(5)} ${t.costUsd != null ? `$${t.costUsd.toFixed(3)}` : '     '} ${t.title}${t.error ? `  [${t.error}]` : ''}${t.problems[0] ? `\n        ${t.problems[0]}` : ''}`).join('\n') || 'no trials yet'); break
    case 'skills': console.log((cs.store.read(need(id, 'the camp id')).scout?.skills ?? []).map((s, i) => `${i}  ${s.status.padEnd(9)} ${s.source}\n     ${s.why}`).join('\n') || 'the scout has not run or found nothing'); break
    case 'skill': { const r = await cs.decideSkill(need(id, 'the camp id'), need(pos[1], 'the skill number'), need(pos[2], 'approve or reject') === 'approve'); console.log(`${r.source}: ${r.status}${r.error ? ` (${r.error})` : ''}`); break }
    case 'set': {
      const patch = {}
      for (const kv of pos.slice(1)) {
        const i = kv.indexOf('=')
        if (i < 1) throw new Error(`expected key=value, got "${kv}"`)
        const keys = kv.slice(0, i).split('.')
        let o = patch
        for (const k of keys.slice(0, -1)) o = (o[k] ??= {})
        o[keys.at(-1)] = parseValue(kv.slice(i + 1))
      }
      console.log(JSON.stringify(cs.updateSettings(need(id, 'the camp id'), patch), null, 2))
      break
    }
    case 'settings': console.log(JSON.stringify(cs.store.read(need(id, 'the camp id')).settings, null, 2)); break
    case 'redo': cs.redo(need(id, 'the camp id'), need(pos[1], 'the stage')); console.log(`stage ${pos[1]} will run again; continue with: camp train ${id}`); break
    case 'fresh': cs.fresh(need(id, 'the camp id')); console.log(`started fresh; begin with: camp train ${id}`); break
    case 'reset': cs.reset(need(id, 'the camp id'), pos[1] ?? 'all', { datasets: flag('datasets') === true }); console.log('reset'); break
    case 'publish': { const p = cs.publish(need(id, 'the camp id'), { force: flag('force') === true }); console.log(`published\n  agents: ${p.agents.join(', ') || '-'}\n  teams: ${p.teams.join(', ') || '-'}\n  workflow: ${p.orchestration}  (run it with: ./forge-cli run ${p.orchestration} goal="...")${p.skipped.length ? `\n  left as they were: ${p.skipped.join(', ')}` : ''}`); break }
    case 'rollback': console.log(JSON.stringify(cs.rollback(need(id, 'the camp id')), null, 2)); break
    case 'delete': cs.remove(need(id, 'the camp id')); console.log('deleted'); break
    default:
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, '').trim())
      if (cmd && cmd !== 'help') process.exitCode = 2
  }
}

main().catch(e => { console.error(`error: ${e?.message ?? e}`); process.exitCode = 1 })
