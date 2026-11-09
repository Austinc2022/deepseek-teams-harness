// Venture studio learning loop - run weekly.
// Ledger statistics (lens yield, curator-vs-committee calibration, duplicate rate, verdict mix)
// + optional metrics and feedback analysis -> retro-curator rewrites the scouts' playbook and the
// lens weights; the next idea-scout runs use them.
//
//   forge run weekly-retro
//   forge run weekly-retro metrics=/abs/path/metrics.csv feedback=/abs/path/reviews.json

export const meta = {
  name: 'weekly-retro',
  description: 'Learning loop: analyzes scouting yield, score calibration and outcomes, then rewrites the scouts playbook and lens weights.',
  team: 'learning-loop',
  args: {
    days: 'Look-back window in days (default 7)',
    metrics: 'Optional path to product metrics export (CSV/JSON) for a launched product',
    feedback: 'Optional path to customer feedback (reviews, tickets) for a launched product',
  },
}

import fs from 'node:fs'
import path from 'node:path'
import { loadLedger, updateLedger, paths, today, clamp, LENSES } from '../lib/venture.mjs'

const RETRO = {
  type: 'object',
  properties: {
    playbook: { type: 'string', description: 'complete new playbook in Markdown, at most ~60 lines' },
    lensWeights: { type: 'array', items: { type: 'object', properties: { lens: { type: 'string' }, weight: { type: 'number' }, why: { type: 'string' } }, required: ['lens', 'weight', 'why'], additionalProperties: false } },
    calibration: { type: 'string', description: 'one or two sentences telling the curator how to adjust its quick scores' },
    highlights: { type: 'array', items: { type: 'string' } },
  },
  required: ['playbook', 'lensWeights', 'calibration', 'highlights'],
  additionalProperties: false,
}

export default async function ({ agent, parallel, phase, log, save, args, run }) {
  const home = run.home
  const P = paths(home)
  const date = today()
  const days = Number(args.days ?? 7)
  const since = Date.now() - days * 864e5
  const ledger = loadLedger(home)
  const ideas = Object.entries(ledger.ideas).map(([id, i]) => ({ id, ...i }))
  const recent = ideas.filter(i => Date.parse(i.firstSeen) >= since)

  phase('Statistics')
  const evaluated = ideas.filter(i => i.evaluation && typeof i.quickScore === 'number')
  const deltas = evaluated.map(i => i.evaluation.overall - i.quickScore)
  const mean = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null
  const stats = {
    window: `${days} days`, totalIdeas: ideas.length, newInWindow: recent.length,
    runsInWindow: ledger.runs.filter(r => Date.parse(r.date) >= since - 864e5).length,
    duplicateRate: (() => { const r = ledger.runs.filter(x => Date.parse(x.date) >= since - 864e5); const raw = r.reduce((t, x) => t + x.raw, 0); return raw ? Math.round(r.reduce((t, x) => t + x.duplicates, 0) / raw * 100) + '%' : null })(),
    lenses: Object.fromEntries(Object.keys(LENSES).map(k => {
      const s = ledger.lenses[k] ?? { runs: 0, ideas: 0, strong: 0, dups: 0 }
      const mine = ideas.filter(i => i.lens === k)
      return [k, { runs: s.runs, ideas: s.ideas, strong: s.strong, dups: s.dups, strongRate: s.ideas ? Math.round(s.strong / s.ideas * 100) + '%' : null, avgQuick: mean(mine.map(i => i.quickScore ?? 0)), pursued: mine.filter(i => i.evaluation?.decision === 'pursue').length, weight: ledger.lensWeights[k] ?? 1, recentSubAngles: (s.subAngles ?? []).slice(-8) }]
    })),
    calibration: { evaluated: evaluated.length, meanCommitteeMinusQuick: mean(deltas), meanAbsError: mean(deltas.map(Math.abs)) },
    verdicts: ['pursue', 'watch', 'reject'].map(v => `${v}: ${ideas.filter(i => i.evaluation?.decision === v).length}`).join(', '),
    topIdeas: [...ideas].sort((a, b) => (b.evaluation?.overall ?? b.quickScore ?? 0) - (a.evaluation?.overall ?? a.quickScore ?? 0)).slice(0, 10).map(i => ({ id: i.id, title: i.title, lens: i.lens, quick: i.quickScore, committee: i.evaluation?.overall, decision: i.evaluation?.decision, status: i.status, killCriteria: i.evaluation?.killCriteria?.slice(0, 2) })),
    statuses: ideas.reduce((m, i) => ({ ...m, [i.status]: (m[i.status] ?? 0) + 1 }), {}),
  }
  save('stats.json', stats)

  phase('Outcomes')
  const [metrics, feedback] = await parallel([
    () => args.metrics ? agent('metrics-analyst', `Analyze the product metrics at ${args.metrics}. Report the north-star trend, funnel, retention cohorts, revenue vs plan, and the top 3 actions.`, { label: 'metrics' }) : null,
    () => args.feedback ? agent('feedback-analyst', `Synthesize the customer feedback at ${args.feedback} into themes with counts, sentiment, quotes and prioritized requests.`, { label: 'feedback' }) : null,
  ])

  phase('Retro')
  const oldPlaybook = fs.existsSync(P.playbook) ? fs.readFileSync(P.playbook, 'utf8') : '(none yet)'
  const retro = await agent('retro-curator', [
    `Today is ${date}. Weekly retrospective of the venture studio's idea pipeline.`,
    `Ledger statistics (JSON):\n${JSON.stringify(stats, null, 1)}`,
    metrics ? `Metrics analysis of launched product:\n${metrics}` : '',
    feedback ? `Customer feedback analysis:\n${feedback}` : '',
    `Current playbook:\n${oldPlaybook}`,
    `Produce: (1) a complete rewritten scouting playbook (concise, imperative: which sub-angles and sources to favor or avoid, what evidence separated strong ideas from weak ones, which saturated themes to stop resubmitting); (2) a weight between 0.5 and 2 for each lens (${Object.keys(LENSES).join(', ')}) based on yield, explaining briefly; (3) a calibration note for the curator (e.g. "your quick scores run 8 points high on consumer ideas"); (4) 3-5 highlights for the human. Save at most 2 durable lessons with memory_save and delete outdated ones. With little data, say so and change little.`,
  ].filter(Boolean).join('\n\n'), { schema: RETRO, label: 'retro' })
  if (!retro) throw new Error('retro-curator failed')

  phase('Apply')
  const hist = path.join(P.dir, 'playbook-history')
  fs.mkdirSync(hist, { recursive: true })
  if (fs.existsSync(P.playbook)) fs.copyFileSync(P.playbook, path.join(hist, `${date}-${run.id.slice(-4)}.md`))
  fs.writeFileSync(P.playbook, `${retro.playbook.trim()}\n\n_Updated ${date} by weekly-retro (${run.id})._\n`)
  await updateLedger(home, l => {
    for (const w of retro.lensWeights) if (LENSES[w.lens]) l.lensWeights[w.lens] = Math.round(clamp(w.weight, 0.5, 2) * 100) / 100
    l.calibration = retro.calibration
  })
  const md = [
    `# Venture studio retro - ${date}`,
    `## Highlights\n${retro.highlights.map(h => `- ${h}`).join('\n')}`,
    `## Lens weights\n${retro.lensWeights.map(w => `- ${w.lens}: ${clamp(w.weight, 0.5, 2)} - ${w.why}`).join('\n')}`,
    `## Curator calibration\n${retro.calibration}`,
    `## Statistics\n\`\`\`json\n${JSON.stringify({ ...stats, topIdeas: undefined }, null, 2)}\n\`\`\``,
    `## New playbook\n${retro.playbook}`,
  ].join('\n\n')
  fs.writeFileSync(path.join(P.dir, `retro-${date}.md`), md)
  save('retro.md', md)
  log('playbook and lens weights updated')
  return md
}
