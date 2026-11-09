// Shared library for the venture-studio orchestrations (idea-scout, idea-evaluate,
// venture-pipeline, weekly-retro). Lives outside orchestrations/ so it is not listed as one.
//
// State (all plain files, safe to inspect and edit by hand):
//   reports/ideas/ledger.json        every idea ever seen, per-lens statistics, learned weights
//   reports/ideas/playbook.md        the scouts' playbook, rewritten by weekly-retro
//   reports/ideas/<date>.md          daily scouting reports
//   reports/ideas/evaluations/<id>.md   investment-committee reports
//   memory/ns/venture-lessons/       markdown lessons saved by idea-curator and retro-curator
import fs from 'node:fs'
import path from 'node:path'

// One lens per target platform/store. Each platform scout covers charts, bad reviews, platform
// communities, new platform APIs ("why now") and revenue data for its own store only.
export const LENSES = {
  'ios': { agent: 'ios-scout', platform: 'iOS', brief: 'iPhone and iPad apps on the Apple App Store: top-grossing and rising categories with poorly rated leaders, iOS community demand, and new iOS/Apple Intelligence APIs.' },
  'android': { agent: 'android-scout', platform: 'Android', brief: 'Android apps on Google Play (and Galaxy Store): top-grossing and rising categories with poorly rated leaders, Android-first markets, and new Android/Gemini Nano APIs.' },
  'macos': { agent: 'mac-scout', platform: 'macOS', brief: 'Mac desktop apps on the Mac App Store, Setapp and direct download: pro and productivity categories with stale or overpriced leaders, and new macOS/Apple Silicon capabilities.' },
  'windows': { agent: 'windows-scout', platform: 'Windows', brief: 'Windows desktop apps on the Microsoft Store, winget and direct download: categories with poor or abandoned tools, IT/enterprise pain, and Copilot+ PC / on-device AI APIs.' },
  'web': { agent: 'web-saas-scout', platform: 'Web', brief: 'Browser web apps and SaaS: G2/Capterra low-star categories, professional and B2B pain, public revenue data, and new model/API capabilities.' },
  'extensions': { agent: 'extension-scout', platform: 'Browser extension', brief: 'Chrome Web Store, Edge Add-ons and Firefox Add-ons: popular extensions with bad reviews or broken by Manifest V3, and new built-in browser AI APIs.' },
  'wearables-xr': { agent: 'wearables-xr-scout', platform: 'Wearables and XR', brief: 'Apple Watch, Wear OS, Vision Pro, Meta Quest and smart glasses: thin app catalogs, health/fitness demand, and new sensor, passthrough and on-device AI SDKs.' },
}

export const WEIGHTS = { demand: 20, size: 15, ceiling: 15, moat: 10, feasibility: 15, timeToRevenue: 10, gap: 10, risk: 5 }
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0))
export const weighted = s => Math.round(Object.entries(WEIGHTS).reduce((t, [k, w]) => t + clamp(s?.[k], 0, 10) * w / 10, 0))

export const today = () => new Date().toLocaleDateString('en-CA')
export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'idea'
export const money = n => (n == null || Number.isNaN(Number(n))) ? '?' : Number(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Number(n) >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`
export const tierOf = perDay => perDay >= 1e7 ? 'T4' : perDay >= 1e6 ? 'T3' : perDay >= 1e5 ? 'T2' : perDay >= 1e4 ? 'T1' : 'T0'

export function paths(home) {
  const dir = path.join(home, 'reports', 'ideas')
  fs.mkdirSync(path.join(dir, 'evaluations'), { recursive: true })
  return {
    dir,
    ledger: path.join(dir, 'ledger.json'),
    playbook: path.join(dir, 'playbook.md'),
    evaluations: path.join(dir, 'evaluations'),
    lessons: path.join(home, 'memory', 'ns', 'venture-lessons'),
    ventures: path.join(home, 'workspaces', 'ventures'),
  }
}

// ---------------------------------------------------------------- ledger

const emptyLedger = () => ({ version: 1, created: new Date().toISOString(), ideas: {}, lenses: {}, lensWeights: {}, calibration: '', runs: [] })

export function loadLedger(home) {
  const f = paths(home).ledger
  if (!fs.existsSync(f)) return emptyLedger()
  return { ...emptyLedger(), ...JSON.parse(fs.readFileSync(f, 'utf8')) }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

/** Read-modify-write the ledger under a lock so overlapping runs never lose updates. */
export async function updateLedger(home, fn) {
  const p = paths(home)
  const lock = `${p.ledger}.lock`
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(lock); break } catch (e) {
      if (e.code !== 'EEXIST') throw e
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10 * 60_000) { fs.rmSync(lock, { recursive: true, force: true }); continue } } catch {}
      if (i > 600) throw new Error('ledger lock timeout')
      await sleep(100)
    }
  }
  try {
    const ledger = loadLedger(home)
    const out = await fn(ledger)
    const tmp = `${p.ledger}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2))
    fs.renameSync(tmp, p.ledger)
    return out
  } finally {
    fs.rmSync(lock, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------- dedup

const STOP = new Set('the and for with app apps tool tools that this from your you are into all new using use based platform software service powered builder manager assistant smart simple best'.split(' '))
export function tokenSet(idea) {
  const text = [idea.title, ...(idea.keywords ?? [])].join(' ').toLowerCase()
  return new Set((text.match(/[a-z0-9]{3,}/g) ?? []).filter(w => !STOP.has(w)).map(w => w.replace(/(ies)$/, 'y').replace(/s$/, '')))
}
export function similarity(a, b) {
  const A = tokenSet(a), B = tokenSet(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter)
}
/** Deterministic duplicate check against the ledger; returns { id, score } or null. */
export function findDuplicate(ledger, idea, threshold = 0.5) {
  let best = null
  const s = slug(idea.title)
  for (const [id, ex] of Object.entries(ledger.ideas)) {
    const score = slug(ex.title) === s ? 1 : similarity(idea, ex)
    if (score >= threshold && (!best || score > best.score)) best = { id, score }
  }
  return best
}

// ---------------------------------------------------------------- learning context

export function readPlaybook(home) {
  const f = paths(home).playbook
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').slice(0, 5000) : ''
}

export function readLessons(home, maxChars = 4000) {
  const dir = path.join(paths(home).lessons, 'notes')
  if (!fs.existsSync(dir)) return ''
  const notes = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
    const t = fs.readFileSync(path.join(dir, f), 'utf8')
    return `- ${t.split('\n---\n')[1]?.trim().replace(/\s+/g, ' ').slice(0, 300) ?? f}`
  })
  return notes.join('\n').slice(0, maxChars)
}

/** Base scout per lens plus `extra` scouts given to the lenses that historically yield strong ideas. */
export function allocateScouts(ledger, lensKeys, extra) {
  const rate = k => {
    const s = ledger.lenses[k] ?? { ideas: 0, strong: 0 }
    return (ledger.lensWeights[k] ?? 1) * ((s.strong + 1) / (s.ideas + 2))
  }
  const slots = lensKeys.map(k => ({ lens: k, instance: 1 }))
  const ranked = [...lensKeys].sort((a, b) => rate(b) - rate(a))
  for (let i = 0; i < extra; i++) {
    // last extra slot explores the least-run lens; the others exploit the best yields
    const lens = i === extra - 1 && extra > 1
      ? [...lensKeys].sort((a, b) => (ledger.lenses[a]?.runs ?? 0) - (ledger.lenses[b]?.runs ?? 0))[0]
      : ranked[i % ranked.length]
    slots.push({ lens, instance: slots.filter(s => s.lens === lens).length + 1 })
  }
  return { slots, rates: Object.fromEntries(lensKeys.map(k => [k, Math.round(rate(k) * 100) / 100])) }
}

export function knownTitles(ledger, limit = 250) {
  return Object.entries(ledger.ideas)
    .sort((a, b) => String(b[1].lastSeen).localeCompare(String(a[1].lastSeen)))
    .slice(0, limit)
    .map(([id, i]) => `${id} | ${i.title} | ${String(i.oneLiner ?? '').slice(0, 90)}`)
}

// ---------------------------------------------------------------- schemas

const EVIDENCE = { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, shows: { type: 'string' } }, required: ['url', 'shows'], additionalProperties: false } }
const SCORES = { type: 'object', properties: Object.fromEntries(Object.keys(WEIGHTS).map(k => [k, { type: 'integer' }])), required: Object.keys(WEIGHTS), additionalProperties: false }
const REVENUE = { y1PerDay: { type: 'number' }, y3PerDay: { type: 'number' }, ceilingPerDay: { type: 'number' }, revenueMethod: { type: 'string' } }

export const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    subAngles: { type: 'array', items: { type: 'string' }, description: 'the specific search angles/queries you explored' },
    ideas: { type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' }, oneLiner: { type: 'string' }, targetUser: { type: 'string' }, problem: { type: 'string' },
      solution: { type: 'string' }, platform: { type: 'string' }, businessModel: { type: 'string' }, evidence: EVIDENCE,
      competitors: { type: 'array', items: { type: 'string' } }, whyNow: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } },
      ...REVENUE,
    }, required: ['title', 'oneLiner', 'targetUser', 'problem', 'solution', 'platform', 'businessModel', 'evidence', 'keywords', 'whyNow', 'y1PerDay', 'y3PerDay', 'ceilingPerDay', 'revenueMethod'], additionalProperties: false } },
  },
  required: ['subAngles', 'ideas'],
  additionalProperties: false,
}

export const CURATOR_SCHEMA = {
  type: 'object',
  properties: {
    decisions: { type: 'array', items: { type: 'object', properties: {
      candidates: { type: 'array', items: { type: 'integer' }, description: 'indexes of the candidate ideas merged into this decision' },
      duplicateOf: { type: 'string', description: 'ledger id this duplicates, or empty string if new' },
      title: { type: 'string' }, oneLiner: { type: 'string' },
      quickScore: { type: 'integer', description: '0-100' },
      y1PerDay: { type: 'number' }, y3PerDay: { type: 'number' }, ceilingPerDay: { type: 'number' },
      rationale: { type: 'string' },
    }, required: ['candidates', 'duplicateOf', 'title', 'oneLiner', 'quickScore', 'y1PerDay', 'y3PerDay', 'ceilingPerDay', 'rationale'], additionalProperties: false } },
    lessons: { type: 'array', items: { type: 'string' } },
  },
  required: ['decisions', 'lessons'],
  additionalProperties: false,
}

export const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    scores: SCORES, ...REVENUE,
    keyFindings: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    evidence: EVIDENCE,
    verdict: { type: 'string', enum: ['pursue', 'watch', 'reject'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['scores', 'y1PerDay', 'y3PerDay', 'ceilingPerDay', 'revenueMethod', 'keyFindings', 'risks', 'evidence', 'verdict', 'confidence'],
  additionalProperties: false,
}

export const CHAIR_SCHEMA = {
  type: 'object',
  properties: {
    scores: SCORES, ...REVENUE,
    decision: { type: 'string', enum: ['pursue', 'watch', 'reject'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    summary: { type: 'string' },
    rationale: { type: 'string' },
    disagreements: { type: 'array', items: { type: 'string' } },
    killCriteria: { type: 'array', items: { type: 'string' } },
    nextSteps: { type: 'array', items: { type: 'string' } },
  },
  required: ['scores', 'y1PerDay', 'y3PerDay', 'ceilingPerDay', 'revenueMethod', 'decision', 'confidence', 'summary', 'rationale', 'disagreements', 'killCriteria', 'nextSteps'],
  additionalProperties: false,
}

// ---------------------------------------------------------------- evaluation committee

export function ideaCard(idea) {
  const ev = (idea.evidence ?? []).map(e => `  - ${e.url} - ${e.shows}`).join('\n')
  return [
    `Title: ${idea.title}`, `One-liner: ${idea.oneLiner ?? ''}`, `Target user: ${idea.targetUser ?? ''}`,
    `Problem: ${idea.problem ?? ''}`, `Solution: ${idea.solution ?? ''}`, `Platform: ${idea.platform ?? ''}`,
    `Business model: ${idea.businessModel ?? ''}`, `Why now: ${idea.whyNow ?? ''}`,
    `Competitors: ${(idea.competitors ?? []).join(', ')}`,
    `Scout revenue estimate: y1 ${money(idea.y1PerDay)}/day, y3 ${money(idea.y3PerDay)}/day, ceiling ${money(idea.ceilingPerDay)}/day (${idea.revenueMethod ?? 'method not given'})`,
    ev ? `Evidence:\n${ev}` : 'Evidence: none given',
  ].join('\n')
}

const JUDGES = [
  { agent: 'market-analyst', ask: 'Verify the demand evidence, size TAM/SAM/SOM (bottom-up and top-down) and map the closest competitors with pricing and traction.' },
  { agent: 'unit-economist', ask: 'Model pricing, conversion, ARPU, CAC, gross margin (including inference costs), churn and LTV. Give y1/y3/ceiling revenue per day with formulas and what must be true for $1M/day and $10M/day.' },
  { agent: 'feasibility-engineer', ask: 'Assess whether a small AI-assisted team can ship a credible MVP in 8 weeks: stack, the 3 hardest problems, dependencies and their costs, platform risks, minimal feature set.' },
  { agent: 'devils-advocate', ask: 'Attack the idea: riskiest assumptions, failed predecessors, incumbents who could copy it fast, legal or platform risks, and the kill criteria. Be fair if it survives.' },
]

/** Run the investment committee on one ledger idea; records the result in the ledger and writes a report. */
export async function evaluateIdea(api, home, id, { labelPrefix = '' } = {}) {
  const { agent, parallel, log, save } = api
  const idea = loadLedger(home).ideas[id]
  if (!idea) throw new Error(`unknown idea ${id}`)
  const card = ideaCard(idea)
  const date = today()

  const reports = await parallel(JUDGES.map(j => () => agent(j.agent,
    `Today is ${date}. You are one of four independent judges on the venture studio's investment committee. Use the venture-scoring rubric.\n\nYour task: ${j.ask}\n\nIdea card:\n${card}`,
    { schema: JUDGE_SCHEMA, label: `${labelPrefix}judge:${j.agent}` })))
  const named = JUDGES.map((j, i) => ({ judge: j.agent, report: reports[i] })).filter(r => r.report)
  if (!named.length) { log(`evaluation of ${id}: every judge failed`); return null }

  const chair = await agent('ic-chair',
    `Today is ${date}. Aggregate these independent judge reports into the committee verdict for the idea below, applying the venture-scoring weights and decision rules.\n\nIdea card:\n${card}\n\nJudge reports (JSON):\n${JSON.stringify(named, null, 1)}`,
    { schema: CHAIR_SCHEMA, label: `${labelPrefix}ic-chair` })
  if (!chair) { log(`evaluation of ${id}: chair failed`); return null }

  const overall = weighted(chair.scores)
  const result = {
    date, overall, decision: chair.decision, confidence: chair.confidence, tier: tierOf(chair.ceilingPerDay),
    y1PerDay: chair.y1PerDay, y3PerDay: chair.y3PerDay, ceilingPerDay: chair.ceilingPerDay,
    summary: chair.summary, killCriteria: chair.killCriteria, nextSteps: chair.nextSteps,
    judgeVerdicts: Object.fromEntries(named.map(r => [r.judge, r.report.verdict])),
  }
  const md = [
    `# ${idea.title} - investment committee ${date}`,
    `**Decision: ${chair.decision.toUpperCase()}** (confidence ${chair.confidence}) · overall **${overall}/100** · ceiling tier **${result.tier}**`,
    `Revenue/day: y1 ${money(chair.y1PerDay)} · y3 ${money(chair.y3PerDay)} · ceiling ${money(chair.ceilingPerDay)}. ${chair.revenueMethod}`,
    `\n## Summary\n${chair.summary}`, `\n## Rationale\n${chair.rationale}`,
    `\n## Scores\n${Object.entries(chair.scores).map(([k, v]) => `- ${k}: ${v}/10`).join('\n')}`,
    `\n## Judge verdicts\n${named.map(r => `- ${r.judge}: ${r.report.verdict} (${r.report.confidence})`).join('\n')}`,
    chair.disagreements.length ? `\n## Disagreements\n${chair.disagreements.map(x => `- ${x}`).join('\n')}` : '',
    `\n## Kill criteria\n${chair.killCriteria.map(x => `- ${x}`).join('\n')}`,
    `\n## Next validation steps\n${chair.nextSteps.map(x => `- ${x}`).join('\n')}`,
    `\n## Idea card\n\`\`\`\n${card}\n\`\`\``,
    `\n## Judge reports\n${named.map(r => `### ${r.judge}\n${r.report.keyFindings.map(x => `- ${x}`).join('\n')}\n\nRisks:\n${r.report.risks.map(x => `- ${x}`).join('\n')}\n\nEvidence:\n${r.report.evidence.map(e => `- ${e.url} - ${e.shows}`).join('\n')}`).join('\n\n')}`,
  ].join('\n')
  const file = path.join(paths(home).evaluations, `${id}.md`)
  fs.writeFileSync(file, md)
  save(`evaluation-${id}.md`, md)
  await updateLedger(home, l => {
    const i = l.ideas[id]
    if (!i) return
    i.evaluation = { ...result, report: path.relative(home, file) }
    i.status = chair.decision === 'pursue' ? 'pursue' : chair.decision === 'watch' ? 'watch' : 'rejected'
  })
  log(`evaluated ${id}: ${chair.decision} ${overall}/100`)
  return { id, ...result, file }
}

/** Resolve an idea argument (ledger id, or a free-text description added as a manual idea). */
export async function resolveIdea(home, arg) {
  if (!arg) throw new Error('idea=... is required (a ledger id or a description)')
  const ledger = loadLedger(home)
  if (ledger.ideas[arg]) return arg
  const text = String(arg)
  const idea = { title: text.split(/[.\n:]/)[0].slice(0, 60), oneLiner: text.slice(0, 300), problem: text, keywords: [], evidence: [] }
  const dup = findDuplicate(ledger, idea, 0.6)
  if (dup) return dup.id
  const id = `${today()}-${slug(idea.title)}`
  await updateLedger(home, l => { l.ideas[id] = { ...idea, lens: 'manual', status: 'new', firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), timesSeen: 1 } })
  return id
}
