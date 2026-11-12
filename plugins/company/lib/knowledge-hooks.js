/**
 * Where the company's structured outputs become recorded facts (code writes them; no model call):
 *   department reports   evidence lines, as stated (agent tier: claims until checked)
 *   gate results         gate tier, measured
 *   engine facts         code tier, measured, one key per measurement (a new value supersedes the old)
 *   kills                constraint facts derived from the initiative's evidence: when that evidence is found
 *                        wrong, the kill is quarantined and the super agent is asked to reconsider it
 *   owner answers        owner tier
 * Also: which agents are judges (stateless, measured facts only), and the one-time backfill.
 */
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { getKnowledge } from '../../agent-forge/lib/knowledge.js'
import { FORGE_HOME, now, str } from './paths.js'
import { profile as P } from './profile.js'

export const kb = () => getKnowledge(FORGE_HOME)
export const AREA = P.tags?.[0] ?? P.id ?? 'company'
const slug = (s, n = 28) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, n).replace(/-+$/, '')
const safe = (what, fn) => { try { return fn() } catch (e) { console.error(`[knowledge] ${what}: ${e.message}`); return null } }

/** The purpose key of an initiative: its subject in words, plus a short id so two similar titles do not collide. */
export const purposeOf = i => (i ? `ini-${slug(i.title)}-${String(i.id).slice(-4)}` : null)

/** Department report evidence: each line a fact, as strong as the report says (capped at the agent tier). */
export function recordReports(co, reports, tag) {
  return safe('reports', () => {
    const c = co.read()
    let n = 0
    for (const r of reports) {
      const i = c.initiatives.find(x => x.id === r.initiativeId)
      const dep = c.departments.find(d => d.id === r.department)
      const purpose = purposeOf(i)
      for (const [k, e] of (r.report?.evidence ?? []).entries()) {
        if (!e?.claim) continue
        kb().add({ claim: `${e.claim}${e.source ? ` (source: ${str(e.source, 200)})` : ''}`, strength: e.strength, tier: 'agent', kind: 'fact', area: AREA, purpose, by: dep?.lead ?? r.department, sourceKind: 'department-report', sourceRef: `report:${r.department}:${tag}:${k}`, entities: [i?.title, r.department].filter(Boolean) })
        n++
      }
      if (r.report?.summary) { kb().add({ claim: `${dep?.name ?? r.department} on "${i?.title ?? r.initiativeId}": ${str(r.report.summary, 1200)}`, strength: 'argued', tier: 'agent', kind: 'result', area: AREA, purpose, by: dep?.lead, sourceKind: 'department-report', sourceRef: `report:${r.department}:${tag}:summary` }); n++ }
    }
    return n
  })
}

/** A worker's report on a ticket: what it says it built and found, as an agent claim that cites its folder. */
export function recordTicketReport(co, t, rep, runId) {
  return safe('ticket', () => {
    if (!rep?.summary || rep.status === 'progress') return null
    const ini = t.lane?.startsWith('ini:') ? co.read().initiatives.find(i => i.id === t.lane.slice(4)) : null
    return kb().add({ claim: `Ticket "${t.title}" (${rep.status}): ${str(rep.summary, 1400)}`, strength: /\bmeasured\b/i.test(rep.summary) ? 'measured' : /\bsimulat/i.test(rep.summary) ? 'simulated' : 'argued', tier: 'agent', kind: 'result', area: AREA, purpose: purposeOf(ini), by: t.worker, sourceKind: 'ticket', sourceRef: `${t.dir}`, runId, entities: [t.workstream, t.title].filter(Boolean) })
  })
}

/** The critique panel's verdict on a ticket (judges' opinions: argued, but from independent readers). */
export function recordCritique(t, summary, got) {
  return safe('critique', () => kb().add({ claim: `Critique of "${t.title}": ${got.length} critic(s), lowest score ${summary.min ?? '-'}, ${summary.mustFix} must-fix item(s). ${got.map(x => `${x.critic}: ${str(x.verdict, 300)}`).join(' | ')}`, strength: 'argued', tier: 'agent', kind: 'result', area: AREA, by: 'critique-panel', sourceKind: 'critique', sourceRef: `critique:${t.id}:${summary.ts}` }))
}

/** A gate verdict is measured by code: the strongest kind of fact after the owner. */
export function recordGate(co, g) {
  return safe('gate', () => {
    if (!g?.name) return null
    const i = co.read().initiatives.find(x => x.id === g.initiativeId)
    const verdict = g.passed ? `PASSED (${P.text.scoreLabel ?? 'score'} ${g.order?.pImprove ?? '?'}, required ${g.order?.required ?? '?'})` : `FAILED: ${(g.reasons ?? []).join('; ')}`
    return kb().add({ key: `gate:${g.name}`, claim: `Gate verdict for proposal "${g.name}"${g.hypothesis ? ` (${str(g.hypothesis, 300)})` : ''}: ${verdict}`, strength: 'measured', tier: 'gate', kind: 'result', area: AREA, purpose: purposeOf(i), by: 'gate', sourceKind: 'gate', sourceRef: `gate:${g.name}:${now().slice(0, 16)}` })
  })
}

/** Deterministic facts from the profile: every short scalar becomes a keyed, code-measured fact. */
export function recordFacts(facts) {
  return safe('facts', () => {
    const out = []
    const skip = new Set(['at', 'checks', 'live', 'reports', 'proposals', 'note'])
    const walk = (o, p, d) => {
      if (out.length >= 120 || d > 5 || o == null) return
      if (typeof o === 'object' && !Array.isArray(o)) { for (const [k, v] of Object.entries(o)) if (!skip.has(k)) walk(v, p ? `${p}.${k}` : k, d + 1); return }
      if (typeof o === 'number' || typeof o === 'boolean' || (typeof o === 'string' && o.length <= 60 && !o.includes('\n'))) out.push([p, o])
    }
    walk(facts, '', 0)
    const label = P.text.factsTitle ?? 'Measured now'
    for (const [p, v] of out) kb().add({ key: `facts:${p}`, claim: `${label}: ${p} = ${v}`, strength: 'measured', tier: 'code', kind: 'fact', area: AREA, volatility: 'engine', by: 'code', sourceKind: 'facts', sourceRef: `facts:${p}:${now().slice(0, 13)}`, entities: p.split('.').slice(0, 3) })
    return out.length
  })
}

/** Kills and owner answers, from any path that produced them (batch cycle, leaders, the dashboard). Idempotent. */
export function syncState(co) {
  return safe('sync', () => {
    const K = kb()
    const c = co.read()
    let n = 0
    for (const i of c.initiatives) {
      if (i.stage !== 'killed' || K.kv(`kill:${i.id}`)) continue
      const purpose = purposeOf(i)
      const evidence = K.list({ purpose, limit: 40 }).filter(f => f.status !== 'invalid' && f.kind !== 'constraint').map(f => f.id)
      const when = i.history?.filter(h => h.stage === 'killed').at(-1)?.ts ?? now()
      const r = K.add({ claim: `Killed: "${i.title}". Reason given: ${str(i.note, 900) || '(none recorded)'}. This holds for what was tested up to ${String(when).slice(0, 10)}; recheck before relying on it if the data, the engine or the market regime changed.`, kind: 'constraint', strength: 'argued', tier: 'agent', area: AREA, purpose, by: c.ceo, sourceKind: 'kill', sourceRef: `initiative:${i.id}`, derivedFrom: evidence, entities: [i.title, i.department].filter(Boolean), validFrom: when, reviewDays: evidence.length ? 21 : 3 })
      K.link(`initiative:${i.id}`, r.id)
      K.kv(`kill:${i.id}`, r.id)
      n++
    }
    for (const d of c.decisions) {
      if ((d.status !== 'answered' && d.status !== 'auto') || K.kv(`dec:${d.id}:${d.status}`)) continue
      const owner = d.status === 'answered'
      K.add({ claim: `${owner ? 'The owner decided' : 'The company decided (the owner may overrule)'}: "${str(d.question, 500)}" -> ${str(d.choice, 300)}${d.note ? ` (${str(d.note, 300)})` : ''}`, kind: 'decision', strength: owner ? 'measured' : 'argued', tier: owner ? 'owner' : 'agent', area: AREA, by: owner ? 'owner' : d.from, sourceKind: 'decision', sourceRef: `decision:${d.id}:${d.status}`, volatility: 'permanent' })
      K.kv(`dec:${d.id}:${d.status}`, '1')
      n++
    }
    return n
  })
}

/**
 * Judges must be stateless and see measured facts only: the auditor, the HR reviewer, the gate verifier and the
 * critique panel. Applied to the agent files at start (a refresh from the profile would otherwise undo it).
 */
export function markJudges(registry) {
  return safe('judges', () => {
    const names = [...new Set([P.auditorName, P.reviewerName, P.verifierName, ...(P.critics ?? []).map(c => c.agent)].filter(Boolean))]
    const changed = []
    for (const name of names) {
      let src
      try { src = registry.getAgentSource(name) } catch { continue }
      const doc = YAML.parse(src) ?? {}
      const tags = Array.isArray(doc.tags) ? doc.tags : []
      if (tags.includes('judge') && doc.memory?.mode === 'none') continue
      const dir = path.join(FORGE_HOME, 'company', 'backup', 'agents-pre-judge')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${name}.${Date.now()}.yaml`), src)
      doc.tags = [...new Set([...tags, 'judge'])]
      doc.memory = { mode: 'none' }
      registry.saveAgentSource(name, YAML.stringify(doc))
      changed.push(name)
    }
    return changed
  })
}

/**
 * Titles for agents whose ids do not say what they do (ids stay: chats, orchestrations and teams refer to them).
 * The title comes from the agent's own description ("Trading desk analyst: ..." -> "Trading desk analyst").
 */
export function applyTitles(registry, problem) {
  return safe('titles', () => {
    // re-applied at every start (cheap; a refresh of the agents from the profile drops titles)
    const fixed = { [P.name?.('ceo') ?? 'quant-ceo']: 'COO' }
    const done = []
    for (const a of registry.listAgents().filter(x => !x.invalid && P.isOurs(x.name))) {
      let src
      try { src = registry.getAgentSource(a.name) } catch { continue }
      const doc = YAML.parse(src) ?? {}
      if (doc.title) continue
      const t = fixed[a.name] ?? (problem(a.name, P.prefix) ? String(doc.description ?? '').split(/[:(]/)[0].trim() : '')
      if (!t || t.length > 48) continue
      doc.title = t
      registry.saveAgentSource(a.name, YAML.stringify(doc))
      done.push(`${a.name} = "${t}"`)
    }
    return done
  })
}

/**
 * One-time import of what was learned before the store existed. Everything comes in at the agent tier and due for
 * a check, so the dreamer verifies it against the transcripts before it counts as more than a claim.
 */
export function backfill(co) {
  return safe('backfill', () => {
    const K = kb()
    if (K.kv('backfill:v1')) return { skipped: true }
    const c = co.read()
    const out = { evidence: 0, kills: 0, notes: 0, archived: null }
    for (const i of c.initiatives) {
      for (const [k, e] of (i.evidence ?? []).entries()) {
        if (!e?.claim) continue
        K.add({ claim: `${e.claim}${e.source ? ` (source: ${str(e.source, 200)})` : ''}`, strength: e.strength, tier: 'agent', area: AREA, purpose: purposeOf(i), by: i.department, sourceKind: 'backfill', sourceRef: `initiative:${i.id}:evidence:${k}`, validFrom: i.createdAt, reviewDays: 0 })
        out.evidence++
      }
    }
    out.kills = syncState(co) ?? 0
    const importNotes = (dir, who) => {
      const notes = path.join(dir, 'notes')
      let files = []
      try { files = fs.readdirSync(notes).filter(f => f.endsWith('.md')) } catch { return 0 }
      let n = 0
      for (const f of files) {
        const text = fs.readFileSync(path.join(notes, f), 'utf8')
        const title = text.match(/^title: (.*)$/m)?.[1]?.replace(/^"|"$/g, '') ?? f.slice(0, -3)
        const body = text.split('\n---\n')[1]?.trim().replace(/\s+/g, ' ') ?? ''
        if (body.length < 20) continue
        K.add({ claim: `Imported note "${title}" (unverified, written by ${who}): ${body.slice(0, 900)}`, strength: 'argued', tier: 'agent', area: AREA, by: who, sourceKind: 'note', sourceRef: `note:${path.relative(path.join(FORGE_HOME, 'memory'), path.join(notes, f))}`, tags: ['imported'], reviewDays: 0 })
        n++
      }
      return n
    }
    const def = path.join(FORGE_HOME, 'memory', 'teams', 'default')
    out.notes += importNotes(def, 'several agents (the old shared "default" memory)')
    out.notes += importNotes(path.join(FORGE_HOME, 'memory', 'agents', P.rootSuperName ?? 'quant-super-ceo'), 'the CEO super agent')
    // the shared bucket is retired: archived, not deleted
    if (fs.existsSync(def)) {
      const to = path.join(FORGE_HOME, 'memory', '.archive', `teams-default-${now().slice(0, 10)}`)
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.renameSync(def, to)
      out.archived = to
    }
    K.kv('backfill:v1', now())
    return out
  })
}
