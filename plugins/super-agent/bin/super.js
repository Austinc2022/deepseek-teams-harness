#!/usr/bin/env node
/**
 * Super agent CLI (works without the harness running).
 *   super setup [--force]          create the CEO super agent and the worker (safe to repeat)
 *   super status                   super agents, tickets, what waits for you, last messages
 *   super say "text" [--to id]     write to the CEO super agent (or another one)
 *   super answer <ticket> "text"   write to a ticket's worker (answers its question, resumes it)
 *   super stop|retry <ticket>
 *   super on|off                   proactive mode: react to company and engine events and a daily review
 *   super run                      run the loop here until Ctrl-C (when neither ./dsh web nor company-cli serve runs)
 */
import { boot } from '../lib/boot.js'

const [cmd, ...rest] = process.argv.slice(2)
const sa = boot({ log: m => console.error(`[super-agent] ${m}`) })
const queued = r => console.log(r.loop ? `queued for the loop (pid ${r.loop.pid})` : 'queued. No loop is running: start ./dsh web, ./company-cli serve or ./super-cli run')

function status() {
  const o = sa.overview()
  const out = [
    `Proactive mode ${o.enabled ? 'on' : 'off'}; loop ${o.loop ? `running (pid ${o.loop.pid})` : 'not running'}${o.hold ? `; on hold: ${o.hold}` : ''}`,
    `Today: ${o.today.tickets} tickets, ${o.today.evals} evaluations, ${o.today.agents} new agents, ${o.today.skills} new skills, ${o.today.gates} gate runs`,
    '', 'Super agents:', ...o.agents.map(a => `  ${a.id} (${a.agent}) under ${a.parent ?? 'you'}${a.busy ? ' — thinking' : ''}${a.pending ? ` — ${a.pending} waiting` : ''}`),
    '', 'Needs you:', ...(o.needsYou.length ? o.needsYou.map(t => `  ${t.id} [${t.stage}] ${t.title}${t.attention ? `\n      ${t.attention.question}` : ''}`) : ['  (nothing)']),
    '', 'Tickets:', ...(o.tickets.slice(0, 15).map(t => `  ${t.id} [${t.stage}] ${t.title} (${t.turns} turns)`)),
    '', 'Last messages:', ...o.feed.slice(0, 8).map(m => `  ${m.ts.slice(5, 16)} ${m.from}: ${m.text.replace(/\s+/g, ' ').slice(0, 220)}`),
  ]
  console.log(out.join('\n'))
}

async function main() {
  if (cmd === 'setup') return console.log(JSON.stringify(sa.setup({ force: rest.includes('--force') }), null, 2))
  if (cmd === 'status' || !cmd) return status()
  if (cmd === 'say') { const i = rest.indexOf('--to'); const to = i >= 0 ? rest.splice(i, 2)[1] : undefined; return queued(sa.store.command({ type: 'say', text: rest.join(' '), to })) }
  if (cmd === 'answer') return queued(sa.store.command({ type: 'ticket-say', ticket: rest[0], text: rest.slice(1).join(' ') }))
  if (cmd === 'stop' || cmd === 'retry') return queued(sa.store.command({ type: cmd, ticket: rest[0] }))
  if (cmd === 'engine' && ['on', 'off'].includes(rest[0])) return queued(sa.store.command({ type: 'engine', action: rest[0] === 'on' ? 'start' : 'stop' }))
  if (cmd === 'plan') {
    const o = sa.overview(), g = o.progress
    const out = [`Goal: ${g.mission}`, `Progress: ${g.percent}% (${g.done} of ${g.total} steps)`, ...g.steps.map(x => `  [${x.done ? 'x' : ' '}] ${x.title}: ${x.detail}`), `Paper profit per day: $${g.money.paperProfitPerDayUsd} of $${g.money.targetDailyUsd} (${g.money.basis})`, '']
    for (const a of o.agents) {
      out.push(`Plan of ${a.title} (${a.id})${a.plan ? `, updated ${a.plan.updatedAt.slice(0, 16)}` : ': none yet'}`)
      if (!a.plan) continue
      out.push(`  Focus: ${a.plan.focus}`, ...a.plan.priorities.map((p, i) => `  ${i + 1}. ${p.text} (${p.why})`), ...a.plan.todo.map(t => `  - [${t.status}] ${t.text} (${t.owner})${t.note ? `: ${t.note}` : ''}`), ...a.plan.blockers.map(b => `  Blocked: ${b}`), ...a.plan.waitingOnOwner.map(b => `  Needs you: ${b}`), '')
    }
    out.push('Right now:', ...(o.now.items.length ? o.now.items.map(i => `  ${i.who}: ${i.what}`) : [`  ${o.now.idle}`]))
    return console.log(out.join('\n'))
  }
  if (cmd === 'on' || cmd === 'off') return queued(sa.store.command({ type: 'enabled', on: cmd === 'on' }))
  if (cmd === 'run') {
    if (!sa.store.claim()) { console.error(`the loop already runs in pid ${sa.store.holder().pid}`); process.exit(1) }
    const stop = sa.start()
    process.on('SIGINT', () => { stop(); process.exit(0) })
    console.error('super agent loop running; Ctrl-C to stop')
    let seen = sa.store.read().feed.length
    setInterval(() => { const f = sa.store.read().feed; for (const m of f.slice(seen)) console.log(`${m.ts.slice(11, 19)} ${m.from}: ${m.text}`); seen = f.length }, 3000)
    return new Promise(() => {})
  }
  console.error('usage: super-cli setup|status|say "text" [--to id]|answer <ticket> "text"|stop <ticket>|retry <ticket>|on|off|plan|engine on|off|run')
  process.exit(2)
}
main().then(() => process.exit(0), e => { console.error(`error: ${e.message}`); process.exit(1) })
