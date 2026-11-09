// Venture studio, step 1: find new app business ideas - built to run daily. One scout per target
// platform/store (iOS, Android, macOS, Windows, web, browser extensions, wearables/XR).
//
//   lenses (stateless scouts, in parallel) -> code dedup against the ledger -> idea-curator
//   (semantic dedup, merge, quick score, lessons) -> ledger update -> committee on the top ideas
//   -> report forge/reports/ideas/<date>.md
//
// Never repeats: every idea goes into reports/ideas/ledger.json, and scouts are told what is already known.
// Learns: per-lens yield decides where extra scouts go; weekly-retro rewrites the playbook and
// lens weights; curator lessons (memory namespace venture-lessons) are fed back into every scout.
//
//   forge run idea-scout
//   forge run idea-scout 'lenses=["ios","android"]' extraScouts=0 ideasPerScout=3 evaluateTop=0
//   forge run idea-scout focus="tools for video creators"

export const meta = {
  name: 'idea-scout',
  description: 'Parallel platform scouts (iOS, Android, macOS, Windows, web, extensions, wearables/XR) find new app business ideas; the ledger and curator dedupe them, quick-score them and learn; the committee evaluates the best.',
  team: 'idea-scouts',
  args: {
    lenses: 'Optional list of platform lenses: ios, android, macos, windows, web, extensions, wearables-xr (default: all)',
    extraScouts: 'Extra scouts sent to the historically best platforms (default 2)',
    ideasPerScout: 'Ideas each scout returns (default 5)',
    evaluateTop: 'How many top new ideas get a full committee evaluation (default 1)',
    minQuick: 'Quick score needed to count as strong / be evaluated (default 60)',
    focus: 'Optional theme to focus this run on',
  },
}

import fs from 'node:fs'
import path from 'node:path'
import {
  LENSES, SCOUT_SCHEMA, CURATOR_SCHEMA, paths, loadLedger, updateLedger, findDuplicate, allocateScouts,
  knownTitles, readPlaybook, readLessons, evaluateIdea, slug, today, money, tierOf, clamp,
} from '../lib/venture.mjs'

export default async function (api) {
  const { agent, parallel, phase, log, save, args, run } = api
  const home = run.home
  const P = paths(home)
  const date = today()
  const lensKeys = (Array.isArray(args.lenses) && args.lenses.length ? args.lenses : Object.keys(LENSES)).filter(k => LENSES[k])
  if (!lensKeys.length) throw new Error(`no valid lenses; choose from ${Object.keys(LENSES).join(', ')}`)
  const extra = Number(args.extraScouts ?? 2)
  const perScout = Number(args.ideasPerScout ?? 5)
  const evaluateTop = Number(args.evaluateTop ?? 1)
  const minQuick = Number(args.minQuick ?? 60)

  // ---- learning context
  const ledger0 = loadLedger(home)
  const { slots, rates } = allocateScouts(ledger0, lensKeys, extra)
  log(`scouts: ${slots.map(s => `${s.lens}#${s.instance}`).join(', ')} (lens yield ${JSON.stringify(rates)})`)
  const playbook = readPlaybook(home)
  const lessons = readLessons(home)
  const known = knownTitles(ledger0, 200)

  // ---- scout
  phase('Scout')
  const scoutPrompt = s => {
    const lens = LENSES[s.lens]
    const recentAngles = (ledger0.lenses[s.lens]?.subAngles ?? []).slice(-15)
    return [
      `Today is ${date}. You are scout #${s.instance} for the ${lens.platform} platform of a venture studio looking for app business ideas whose ceiling could approach $10M/day of gross revenue (be honest: most will not).`,
      `Platform: ${lens.brief} Every idea must ship on ${lens.platform} first; set "platform" to "${lens.platform}" plus the store, and only mention other platforms as later expansion.`,
      args.focus ? `Focus for this run: ${args.focus}` : '',
      s.instance > 1 ? `Another scout covers the obvious angles of this lens; take deliberately different, less-explored sub-angles.` : '',
      recentAngles.length ? `Sub-angles explored on recent runs (rotate away from these unless they are still producing new ideas):\n- ${recentAngles.join('\n- ')}` : '',
      playbook ? `Studio playbook (learned from past runs, follow it):\n${playbook}` : '',
      lessons ? `Lessons from past runs:\n${lessons}` : '',
      known.length ? `Ideas ALREADY in the studio ledger. Do NOT resubmit these or close variants (same user and the same job):\n${known.join('\n')}` : '',
      `Return the ${perScout} best NEW ideas, each with real evidence URLs you opened, 5-8 lowercase dedup keywords, and revenue estimates per day (y1, y3, ceiling) with the method. Follow the venture-scoring rubric.`,
    ].filter(Boolean).join('\n\n')
  }
  const results = await parallel(slots.map(s => () => agent(LENSES[s.lens].agent, scoutPrompt(s), { schema: SCOUT_SCHEMA, label: `scout:${s.lens}#${s.instance}` })))
  const raw = []
  slots.forEach((s, i) => { for (const idea of results[i]?.ideas ?? []) raw.push({ ...idea, lens: s.lens, platform: idea.platform || LENSES[s.lens].platform }) })
  log(`${raw.length} raw ideas from ${results.filter(Boolean).length}/${slots.length} scouts`)
  save('raw-ideas.json', raw)
  if (!raw.length) throw new Error('no scout returned ideas')

  // ---- deterministic dedup against the ledger
  phase('Dedup')
  const seenAgain = []
  const candidates = []
  for (const idea of raw) {
    const dup = findDuplicate(ledger0, idea)
    if (dup) seenAgain.push({ id: dup.id, lens: idea.lens, score: dup.score })
    else candidates.push(idea)
  }
  log(`code dedup: ${seenAgain.length} already in ledger, ${candidates.length} candidates`)

  // ---- curator: semantic dedup, merge, quick score
  phase('Curate')
  let decisions = []
  if (candidates.length) {
    const listing = candidates.map((c, i) => `[${i}] (${c.platform}) ${c.title} - ${c.oneLiner}\n    user: ${c.targetUser}; model: ${c.businessModel}; scout est y1 ${money(c.y1PerDay)}/d, y3 ${money(c.y3PerDay)}/d, ceiling ${money(c.ceilingPerDay)}/d; evidence: ${(c.evidence ?? []).map(e => e.url).join(' ')}`).join('\n')
    const cur = await agent('idea-curator', [
      `Today is ${date}. Curate this batch of scouted ideas.`,
      ledger0.calibration ? `Calibration note from the last retrospective (your quick scores vs the committee): ${ledger0.calibration}` : '',
      `Existing ledger ideas (id | title | one-liner):\n${known.join('\n') || '(empty ledger)'}`,
      `Candidates:\n${listing}`,
      `For every candidate, make exactly one decision: list its index in "candidates" (several indexes if you merge near-identical candidates), set duplicateOf to the ledger id if it is really an idea already in the ledger (otherwise ""; the same product on a different platform is a duplicate unless that platform changes the user, the distribution or the business model), and for new ideas give a sharpened title/one-liner, a conservative quickScore 0-100 per the venture-scoring weights, and revenue/day estimates. Add 0-3 short lessons about what made good or bad ideas in this batch.`,
    ].filter(Boolean).join('\n\n'), { schema: CURATOR_SCHEMA, label: 'curator' })
    decisions = cur?.decisions ?? candidates.map((c, i) => ({ candidates: [i], duplicateOf: '', title: c.title, oneLiner: c.oneLiner, quickScore: 0, y1PerDay: c.y1PerDay, y3PerDay: c.y3PerDay, ceilingPerDay: c.ceilingPerDay, rationale: 'curator failed; unscored' }))
    if (cur?.lessons?.length) save('curator-lessons.json', cur.lessons)
  }

  // ---- ledger update + lens statistics
  phase('Record')
  const now = new Date().toISOString()
  const added = []
  const covered = new Set()
  await updateLedger(home, l => {
    for (const s of seenAgain) if (l.ideas[s.id]) { l.ideas[s.id].timesSeen = (l.ideas[s.id].timesSeen ?? 1) + 1; l.ideas[s.id].lastSeen = now }
    for (const d of decisions) {
      const members = d.candidates.filter(i => candidates[i] && !covered.has(i))
      if (!members.length) continue
      members.forEach(i => covered.add(i))
      if (d.duplicateOf && l.ideas[d.duplicateOf]) {
        l.ideas[d.duplicateOf].timesSeen = (l.ideas[d.duplicateOf].timesSeen ?? 1) + 1
        l.ideas[d.duplicateOf].lastSeen = now
        seenAgain.push({ id: d.duplicateOf, lens: candidates[members[0]].lens, score: 'curator' })
        continue
      }
      const base = candidates[members[0]]
      const merged = members.map(i => candidates[i])
      const card = {
        ...base,
        title: d.title || base.title, oneLiner: d.oneLiner || base.oneLiner,
        evidence: merged.flatMap(m => m.evidence ?? []).filter((e, k, a) => a.findIndex(x => x.url === e.url) === k).slice(0, 12),
        keywords: [...new Set(merged.flatMap(m => m.keywords ?? []).map(k => String(k).toLowerCase()))].slice(0, 12),
        competitors: [...new Set(merged.flatMap(m => m.competitors ?? []))].slice(0, 12),
        lenses: [...new Set(merged.map(m => m.lens))],
        quickScore: clamp(d.quickScore, 0, 100), quickRationale: d.rationale,
        y1PerDay: d.y1PerDay, y3PerDay: d.y3PerDay, ceilingPerDay: d.ceilingPerDay, tier: tierOf(d.ceilingPerDay),
        status: clamp(d.quickScore, 0, 100) >= minQuick ? 'shortlisted' : 'new',
        firstSeen: now, lastSeen: now, timesSeen: members.length, runId: run.id,
      }
      // final deterministic guard: never add something the ledger already holds
      if (findDuplicate(l, card)) continue
      let id = `${date}-${slug(card.title)}`
      for (let n = 2; l.ideas[id]; n++) id = `${date}-${slug(card.title)}-${n}`
      l.ideas[id] = card
      added.push({ id, ...card })
    }
    for (const k of new Set(slots.map(s => s.lens))) {
      const st = l.lenses[k] ??= { runs: 0, ideas: 0, strong: 0, dups: 0, subAngles: [] }
      st.runs++
      st.ideas += added.filter(a => a.lens === k).length
      st.strong += added.filter(a => a.lens === k && a.quickScore >= minQuick).length
      st.dups += seenAgain.filter(s => s.lens === k).length
      const angles = slots.map((s, i) => s.lens === k ? results[i]?.subAngles ?? [] : []).flat()
      st.subAngles = [...st.subAngles, ...angles].slice(-30)
    }
    l.runs = [...l.runs, { date, runId: run.id, scouts: slots.length, raw: raw.length, added: added.length, duplicates: seenAgain.length }].slice(-200)
  })
  log(`ledger: +${added.length} new ideas, ${seenAgain.length} duplicates`)

  // ---- committee on the best new ideas
  const evaluations = []
  const top = [...added].sort((a, b) => b.quickScore - a.quickScore).filter(a => a.quickScore >= minQuick).slice(0, evaluateTop)
  if (top.length) {
    phase('Evaluate')
    const evs = await parallel(top.map(t => () => evaluateIdea(api, home, t.id, { labelPrefix: `${t.id.slice(11, 31)}:` })))
    evaluations.push(...evs.filter(Boolean))
  }

  // ---- report
  phase('Report')
  const totalIdeas = Object.keys(loadLedger(home).ideas).length
  const rows = [...added].sort((a, b) => b.quickScore - a.quickScore)
    .map(a => `| ${a.quickScore} | **${a.title}**<br>${a.oneLiner} | ${a.lenses.join(', ')} | ${money(a.y1PerDay)} / ${money(a.y3PerDay)} / ${money(a.ceilingPerDay)} (${a.tier}) | \`${a.id}\` |`)
  const md = [
    `# Idea scouting - ${date}`,
    `${added.length} new ideas · ${seenAgain.length} duplicates skipped · ${totalIdeas} ideas in the ledger · run \`${run.id}\``,
    args.focus ? `Focus: ${args.focus}` : '',
    `\n## New ideas (quick score, revenue/day y1 / y3 / ceiling)\n| Score | Idea | Lens | Revenue/day | Id |\n|---|---|---|---|---|\n${rows.join('\n') || '| - | none | | | |'}`,
    evaluations.length ? `\n## Committee verdicts\n${evaluations.map(e => `- **${e.decision.toUpperCase()}** ${e.overall}/100 (${e.tier}) - \`${e.id}\`: ${e.summary} → \`${path.relative(home, e.file)}\``).join('\n')}` : '',
    `\n## Details\n${[...added].sort((a, b) => b.quickScore - a.quickScore).map(a => `### ${a.title} (\`${a.id}\`)\n${a.oneLiner}\n\n- User: ${a.targetUser}\n- Problem: ${a.problem}\n- Solution: ${a.solution}\n- Platform / model: ${a.platform} / ${a.businessModel}\n- Why now: ${a.whyNow}\n- Curator: ${a.quickRationale}\n- Evidence: ${a.evidence.map(e => `[${e.shows.slice(0, 60)}](${e.url})`).join(' · ')}`).join('\n\n')}`,
    `\n## Scouting allocation\n${slots.map(s => `${s.lens}#${s.instance}`).join(', ')} · lens yield ${JSON.stringify(rates)}`,
    `\nNext: \`./forge-cli run idea-evaluate idea=<id>\` for a full committee review, or \`./forge-cli run venture-pipeline idea=<id>\` to plan it.`,
  ].filter(Boolean).join('\n')
  let file = path.join(P.dir, `${date}.md`)
  if (fs.existsSync(file)) file = path.join(P.dir, `${date}-${run.id.slice(-4)}.md`)
  fs.writeFileSync(file, md)
  save('report.md', md)
  log(`report: ${file}`)
  return md
}
