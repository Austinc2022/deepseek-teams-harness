// Venture studio autopilot: takes the best approved idea all the way to live, with no human.
// Run daily by the "Venture: autopilot" Automation task (plugins/venture-automation).
//
//   1. skip if paused (forge/reports/ideas/AUTOPILOT-PAUSED exists), if another autopilot run is
//      active, or if the weekly launch limit is reached
//   2. pick the highest-scoring idea the committee marked "pursue" (overall >= minOverall);
//      if there is none, evaluate the best shortlisted ideas first
//   3. venture-pipeline with build=true publish=true: plan, launch kit, build, review, QA,
//      audit, automatic quality gate, then go live (preview -> health check -> production)
//
//   forge run venture-autopilot                       defaults
//   forge run venture-autopilot maxPerWeek=2 minOverall=65
//   forge run venture-autopilot dryRun=true           only report what it would pick
//   touch forge/reports/ideas/AUTOPILOT-PAUSED        pause autopilot (rm to resume)

export const meta = {
  name: 'venture-autopilot',
  description: 'Autonomous: picks the best approved idea and runs it through build, quality gate and go-live without a human.',
  team: 'product-planning',
  args: {
    maxPerWeek: 'Max ventures started per 7 days (default 1)',
    minOverall: 'Minimum committee score to build (default 70)',
    evaluateCandidates: 'Shortlisted ideas to evaluate when no approved idea is waiting (default 2)',
    dryRun: 'true = only report the pick',
  },
}

import fs from 'node:fs'
import path from 'node:path'
import { loadLedger, updateLedger, evaluateIdea, paths, money } from '../lib/venture.mjs'

export default async function (api) {
  const { phase, log, args, run } = api
  const home = run.home
  const P = paths(home)
  const maxPerWeek = Number(args.maxPerWeek ?? 1)
  const minOverall = Number(args.minOverall ?? 70)
  const evalN = Number(args.evaluateCandidates ?? 2)

  phase('Checks')
  if (fs.existsSync(path.join(P.dir, 'AUTOPILOT-PAUSED'))) return 'Autopilot is paused (forge/reports/ideas/AUTOPILOT-PAUSED exists). Delete that file to resume.'

  // single-flight lock (stale after 36h: a crashed run must not block forever)
  const lock = path.join(home, '.cache', 'venture-autopilot.lock')
  fs.mkdirSync(path.dirname(lock), { recursive: true })
  try {
    fs.writeFileSync(lock, JSON.stringify({ runId: run.id, startedAt: new Date().toISOString() }), { flag: 'wx' })
  } catch {
    const held = JSON.parse(fs.readFileSync(lock, 'utf8'))
    if (Date.now() - Date.parse(held.startedAt) < 36 * 3600e3) return `Skipped: autopilot run ${held.runId} is still active (since ${held.startedAt}).`
    fs.writeFileSync(lock, JSON.stringify({ runId: run.id, startedAt: new Date().toISOString() }))
  }

  try {
    const ledger = loadLedger(home)
    const ideas = Object.entries(ledger.ideas).map(([id, i]) => ({ id, ...i }))
    const weekAgo = Date.now() - 7 * 864e5
    const startedThisWeek = ideas.filter(i => i.autopilot?.startedAt && Date.parse(i.autopilot.startedAt) >= weekAgo)
    if (startedThisWeek.length >= maxPerWeek) return `Skipped: weekly limit reached (${startedThisWeek.length}/${maxPerWeek}: ${startedThisWeek.map(i => i.id).join(', ')}).`

    phase('Pick')
    const approved = () => Object.entries(loadLedger(home).ideas).map(([id, i]) => ({ id, ...i }))
      .filter(i => i.status === 'pursue' && (i.evaluation?.overall ?? 0) >= minOverall && !i.autopilot)
      .sort((a, b) => b.evaluation.overall - a.evaluation.overall)
    let pick = approved()[0]
    if (!pick) {
      const shortlist = ideas.filter(i => i.status === 'shortlisted' && !i.evaluation).sort((a, b) => (b.quickScore ?? 0) - (a.quickScore ?? 0)).slice(0, evalN)
      if (!shortlist.length) return `Nothing to build: no idea with a "pursue" verdict >= ${minOverall} and no unevaluated shortlisted ideas. Let idea-scout find more.`
      phase('Evaluate shortlist')
      log(`no approved idea waiting; evaluating ${shortlist.map(s => s.id).join(', ')}`)
      for (const s of shortlist) await evaluateIdea(api, home, s.id, { labelPrefix: `${s.id.slice(11, 31)}:` })
      pick = approved()[0]
      if (!pick) return `Evaluated ${shortlist.length} shortlisted idea(s); none reached "pursue" >= ${minOverall}.`
    }
    log(`picked ${pick.id} (${pick.evaluation.overall}/100, ceiling ${money(pick.evaluation.ceilingPerDay)}/day)`)
    if (String(args.dryRun) === 'true') return `Dry run: would build ${pick.id} - ${pick.title} (${pick.evaluation.overall}/100).`

    await updateLedger(home, l => { l.ideas[pick.id].autopilot = { runId: run.id, startedAt: new Date().toISOString() } })

    phase('Venture pipeline')
    const vp = await import(new URL('./venture-pipeline.js', import.meta.url).href)
    const result = await vp.default({ ...api, args: { idea: pick.id, build: 'true', publish: 'true' } })

    await updateLedger(home, l => { Object.assign(l.ideas[pick.id].autopilot, { endedAt: new Date().toISOString(), live: !!result?.live, urls: result?.urls ?? [] }) })
    const md = [
      `# Autopilot - ${pick.title}`,
      `Idea \`${pick.id}\` · committee ${pick.evaluation.overall}/100 · repo ${result?.repo ?? '?'}`,
      result?.live ? `**LIVE:** ${result.urls.join(' · ')}` : `**Not live.** Quality gate ${result?.shipOk ? 'passed' : 'failed'} ${JSON.stringify(result?.gate ?? {})}${result?.blockedBy ? `; blocked by: ${result.blockedBy}` : ''}`,
      `\n${result?.deploy ?? ''}`,
    ].join('\n')
    fs.writeFileSync(path.join(P.dir, `autopilot-${new Date().toLocaleDateString('en-CA')}-${pick.id.slice(11, 40)}.md`), md)
    return md
  } finally {
    try { if (JSON.parse(fs.readFileSync(lock, 'utf8')).runId === run.id) fs.rmSync(lock) } catch {}
  }
}
