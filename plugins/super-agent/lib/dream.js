/**
 * Memory upkeep ("dreaming"): the scheduled pass that keeps memory and knowledge true and small.
 *
 * Every tick (cheap, code only)    mark judges stateless; one-time backfill; sync kills and owner answers into facts;
 *                                  index new transcripts; expire facts past their review date; turn "a fact was
 *                                  found wrong" into a decision for the CEO when a killed initiative rested on it
 * Every few hours (model, capped)  1 verify  the facts due for a check, limits and kills first, against the
 *                                            transcripts (ground truth) and the files
 *                                  2 distill the purpose memories that changed: rewrite their state (summary.md),
 *                                            promote general lessons to the role memory, record checkable facts,
 *                                            retire notes that are wrong or superseded
 *                                  3 retire  purpose memories unused for 14 days (archived, never deleted)
 *                                  4 page    rewrite the area page from the live facts
 *                                  5 learn   per-source reliability from what checks found wrong
 * Rules the code enforces on the dreamer: it can never raise a fact's tier or strength; a "wrong" verdict needs a
 * checkable source (a transcript, a file, another fact) or it only disputes; hedges are kept; one dreamer at a time.
 */
import fs from 'node:fs'
import path from 'node:path'
import { toolsMcp } from '../../agent-forge/lib/runner.js'
import { Knowledge, knowledgeTools, STRENGTHS } from '../../agent-forge/lib/knowledge.js'
import { listInstances, instanceFiles, updateInstanceMeta, memoryDir, saveNote, writeAtomic, archiveNote } from '../../agent-forge/lib/memory.js'
import { profile as P } from '../../company/lib/profile.js'
import { kb, AREA, markJudges, backfill, syncState, applyTitles } from '../../company/lib/knowledge-hooks.js'
import { agentNameProblem } from '../../company/lib/naming.js'
import { now, today, str, clip } from './store.js'

export const DREAMER = `${P.prefix}memory-dreamer`
const DAY = 86400_000
const S = { type: 'string' }
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
const VERIFY = obj({ verdicts: { type: 'array', items: obj({ id: S, verdict: { type: 'string', enum: ['confirmed', 'outdated', 'wrong', 'unclear'] }, evidence: { type: 'string', description: 'what you checked and what it showed, with numbers' }, ref: { type: 'string', description: 'the transcript path or run id, file path or fact id that shows it; empty if none' } }) } })
const DISTILL = obj({
  summary: { type: 'string', description: 'the current state of this purpose in at most 1500 characters: goal, what was tried, results with numbers and their strength, current hypothesis, open questions, next step. Keep every hedge.' },
  lessons: { type: 'array', items: obj({ title: S, content: S }), description: 'at most 3 lessons about doing this kind of job well that hold beyond this purpose; empty if none' },
  facts: { type: 'array', items: obj({ claim: S, strength: { type: 'string', enum: ['measured', 'simulated', 'argued', 'hearsay'] }, source: { type: 'string', description: 'run id, transcript path or file path where it is shown' } }), description: 'at most 5 facts the whole company should know, exactly as strong as the source' },
  retireNotes: { type: 'array', items: obj({ id: S, why: S }), description: 'notes that are wrong, superseded or duplicated' },
})
const PAGE = obj({ title: S, body: { type: 'string', description: 'Markdown, at most 7000 characters. Sections: what is established (with fact ids), what was ruled out and under which conditions, what is open. Cite fact ids in brackets.' } })

export const dreamerDef = () => P.baseAgent({
  name: DREAMER, ...P.modelFields(P.models.lead), tools: ['Read', 'Grep', 'Glob'], memory: { mode: 'none' }, knowledge: false, maxTurns: 40,
  tags: [...P.tags, 'dreamer'],
  description: 'Memory dreamer: checks recorded facts and notes against the original transcripts, keeps memory small and true.',
  role: `You maintain the memory of ${P.companyName}: recorded facts, and the working memory of agents on each purpose. Transcripts of every run are the ground truth; search them with transcript_search and read files with Read.\n- Check a claim against its source. Say confirmed only when the source shows it; outdated when it was true but newer data or a change replaced it; wrong when the source contradicts it or never showed it; unclear when you cannot tell.\n- Keep the claim's strength as it is. Never turn "reportedly", "about", "on N days" or "simulated" into a flat fact.\n- Prefer fewer, truer notes. Store what a future run cannot see for itself: state, tested rules, decisions, traps.\n- Your output is data for code; you change nothing yourself.\n\n${P.hardRules}`,
})

export class MemoryKeeper {
  constructor(sa) {
    this.sa = sa
    this.booted = false
    this.at = { sync: 0, index: 0, dream: 0 }
    this.running = false
  }
  get settings() { return { enabled: true, everyHours: 6, maxUsdPerDay: 6, maxFacts: 20, maxInstances: 4, retireDays: 14, ...(this.sa.store.read().settings?.dream ?? {}) } }
  log(m) { this.sa.log(`memory: ${m}`) }

  /** Called from the super agent's tick (one process runs it). Never throws. */
  async tick({ hold } = {}) {
    try {
      const K = kb()
      const { registry } = this.sa.forge
      if (!this.booted) {
        this.booted = true
        const judges = markJudges(registry)
        if (judges?.length) this.log(`judges made stateless: ${judges.join(', ')}`)
        try { registry.getAgent(DREAMER) } catch { registry.saveAgent(dreamerDef()) }
        const titles = applyTitles(registry, agentNameProblem)
        if (titles?.length) this.log(`titles: ${titles.join('; ')}`)
        const b = backfill(this.sa.co)
        if (b && !b.skipped) { this.log(`backfill: ${JSON.stringify(b)}`); this.sa.say({ from: 'system', kind: 'system', text: `Knowledge store started: ${b.evidence} evidence lines and ${b.kills} killed ideas recorded as facts, ${b.notes} old notes imported for checking${b.archived ? '; the shared "default" memory is retired (archived)' : ''}.` }) }
      }
      if (Date.now() - this.at.sync > 60_000) {
        this.at.sync = Date.now()
        syncState(this.sa.co)
        this.#affected(K)
      }
      if (Date.now() - this.at.index > 10 * 60_000) {
        this.at.index = Date.now()
        const n = K.indexTranscripts(path.join(this.sa.forge.registry.home, 'runs'), { max: 400 })
        const stale = K.expire()
        if (n || stale) this.log(`indexed ${n} transcript(s); ${stale} fact(s) past review`)
      }
      const st = this.settings
      if (st.enabled && !hold && !this.running && (this.forceNext || Date.now() - this.at.dream > 30 * 60_000)) {
        const last = Number(K.kv('dream:last') ?? 0)
        // the owner's "dream now" skips the schedule, never the daily cap
        if ((this.forceNext || Date.now() - last >= st.everyHours * 3600_000) && this.#spentToday(K) < st.maxUsdPerDay) { this.at.dream = Date.now(); this.forceNext = false; this.dream().catch(e => this.log(`dream: ${e.message}`)) }
      }
    } catch (e) { this.log(`tick: ${e.message}`) }
  }

  #spentToday(K) { return Number(K.kv(`dream:usd:${today()}`) ?? 0) }

  /** A fact found wrong took a killed initiative's reason with it: the CEO decides whether to reopen it. */
  #affected(K) {
    const after = Number(K.kv('poll:affected') ?? 0)
    const evs = K.events(after, ['affected'])
    if (!evs.length) return
    K.kv('poll:affected', evs.at(-1).seq)
    const c = this.sa.co.read()
    const root = this.sa.store.read().agents.find(a => !a.parent)?.id ?? 'ceo'
    for (const e of evs) {
      const src = e.ref?.startsWith('fact:') ? K.get(e.ref.slice(5)) : null
      const inis = (e.data?.affected ?? []).filter(r => r.startsWith('initiative:')).map(r => c.initiatives.find(i => i.id === r.slice(11))).filter(Boolean)
      const n = e.data?.affected?.length ?? 0
      this.sa.say({ from: 'system', kind: 'system', text: `Knowledge: fact ${src?.id ?? e.ref} was ${e.data?.wrong ? 'found wrong' : 'superseded'} ("${clip(src?.claim, 160)}"); ${n} item(s) built on it are flagged${inis.length ? `, including the kill of ${inis.map(i => `"${i.title}"`).join(', ')}` : ''}.` })
      for (const i of inis) {
        this.sa.trigger({ key: `reopen:${i.id}:${e.seq}`, source: 'knowledge', kind: 'evidence-changed', to: root, text: `The initiative "${i.title}" (${i.id}) was killed on evidence that is now ${e.data?.wrong ? 'found wrong' : 'superseded'}:\n- ${src?.claim}\n- why: ${src?.invalid_reason}\nIts kill is quarantined (it no longer counts as a settled limit). Decide: reopen it with a directive (fresh eyes if the earlier work is suspect), or confirm the kill on other evidence and say which. This is yours to decide.` })
      }
    }
  }

  /** One dreaming pass, as its own engine run (visible in Runs, cost charged to the company). */
  async dream() {
    if (this.running) return null
    this.running = true
    const K = kb()
    const st = this.settings
    const { engine, registry } = this.sa.forge
    const log = { ts: now(), verified: 0, outdated: 0, wrong: 0, disputed: 0, unclear: 0, distilled: 0, lessons: 0, facts: 0, retiredNotes: 0, retired: 0, page: null }
    try {
      try { registry.getAgent(DREAMER) } catch { registry.saveAgent(dreamerDef()) }
      const tools = knowledgeTools(K, { judge: false, by: DREAMER, areas: [AREA] })
      const readOnly = { defs: tools.defs.filter(d => !['knowledge_add', 'knowledge_flag'].includes(d.name)), handle: tools.handle }
      const mcp = () => ({ forge_knowledge: toolsMcp('forge_knowledge', readOnly.defs, readOnly.handle) })
      const { done } = engine.startCustom('memory: dreaming', async api => {
        api.phase('Verify')
        await this.#verify(api, K, st, mcp, log)
        api.phase('Distill')
        await this.#distill(api, K, st, mcp, log)
        api.phase('Retire')
        this.#retire(st, log)
        api.phase('Page')
        await this.#page(api, K, mcp, log)
        this.#learn(K)
        return log
      }, { kind: 'dream' }, { cwd: P.projectDir, meta: { dream: true } })
      const r = await done
      const usd = Number(r.costUsd ?? 0)
      this.sa.co.charge(usd, 'memory dreaming')
      K.kv(`dream:usd:${today()}`, Math.round((this.#spentToday(K) + usd) * 10000) / 10000)
      K.kv('dream:last', Date.now())
      const out = { ...log, status: r.status, costUsd: usd, runId: r.id }
      fs.mkdirSync(path.dirname(K.file), { recursive: true })
      fs.appendFileSync(path.join(path.dirname(K.file), 'dream-log.jsonl'), `${JSON.stringify(out)}\n`)
      this.log(`dream ${r.status}: ${JSON.stringify(log)}`)
      return out
    } finally { this.running = false }
  }

  /** Is this a source a person or code can check? */
  #checkable(K, ref) {
    const r = String(ref ?? '').trim()
    if (!r) return false
    if (K.transcriptExists(r) || K.transcriptExists(r.split('/')[0])) return true
    if (/^f[0-9a-f]{10}$/.test(r) && K.get(r)) return true
    try { return path.isAbsolute(r) && fs.existsSync(r) } catch { return false }
  }

  async #verify(api, K, st, mcp, log) {
    const due = K.due(st.maxFacts, { areas: [AREA] })
    if (!due.length) return
    const r = await api.agent(DREAMER, [
      `Check these ${due.length} recorded facts. Limits and kills come first: a wrong limit blocks good work, so look hardest at those.`,
      due.map(f => `## ${f.id} [${f.kind}, status ${f.status}, ${f.strength} from ${f.tier}${f.by ? ` ${f.by}` : ''}, recorded ${String(f.recorded_at).slice(0, 10)}]\n${f.claim}\nSource: ${f.source_ref ?? '-'}${f.check_note ? `\nEarlier check or dispute: ${f.check_note}` : ''}`).join('\n\n'),
      'For each, search the transcripts (transcript_search) and read the files it names. Return one verdict per fact with the evidence and the ref (transcript path, run id, file path or fact id) that shows it.',
    ].join('\n\n'), { schema: VERIFY, label: 'dream:verify', extraMcp: mcp(), signal: AbortSignal.timeout(25 * 60_000) })
    for (const v of r?.verdicts ?? []) {
      const f = due.find(x => x.id === v.id)
      if (!f) continue
      const note = `${str(v.evidence, 500)}${v.ref ? ` [${str(v.ref, 200)}]` : ''}`
      try {
        if (v.verdict === 'confirmed') { K.verify(f.id, { by: DREAMER, note }); log.verified++ }
        else if ((v.verdict === 'wrong' || v.verdict === 'outdated') && this.#checkable(K, v.ref)) { K.invalidate(f.id, { reason: `${v.verdict} (dreamer): ${note}`, by: DREAMER, wrong: v.verdict === 'wrong' }); log[v.verdict]++ }
        else if (v.verdict === 'wrong' || v.verdict === 'outdated') { K.flag(f.id, { by: DREAMER, note: `${v.verdict}, but no checkable source was cited: ${note}` }); K.defer(f.id, { by: DREAMER, note: 'disputed without a checkable source', days: 3 }); log.disputed++ }
        else { K.defer(f.id, { by: DREAMER, note: `unclear: ${note}`, days: f.checks >= 2 ? 14 : 3 }); log.unclear++ }
      } catch (e) { api.log(`verdict ${f.id}: ${e.message}`) }
    }
  }

  async #distill(api, K, st, mcp, log) {
    const { registry } = this.sa.forge
    const home = registry.home
    const todo = listInstances(home).filter(i => i.dirty && i.status !== 'archived').slice(0, st.maxInstances)
    for (const inst of todo) {
      let def
      try { def = registry.getAgent(inst.agent) } catch { updateInstanceMeta(inst.dir, { dirty: false }); continue }
      const f = instanceFiles(inst.dir)
      const r = await api.agent(DREAMER, [
        `Distill the working memory of ${inst.owner} for the purpose "${inst.purpose}"${inst.fresh ? ' (a fresh-eyes purpose: keep it free of earlier opinions)' : ''}.`,
        f.summary ? `# Current state (summary.md)\n${clip(f.summary, 2500)}` : `# Starting pack\n${clip(f.genesis, 2500)}`,
        `# Runs since (journal, oldest first)\n${f.journal.slice(-8).map(j => `## ${String(j.ts).slice(0, 16)} ${j.label ?? ''} (run ${j.runId ?? '?'}, ${j.ok ? 'ok' : 'failed'})\nTask: ${clip(j.task, 500)}\nOutcome: ${clip(j.outcome, 1500)}`).join('\n\n') || '(none)'}`,
        `# Notes\n${f.notes.map(n => `- ${n.id}: ${n.title ?? n.id} (${String(n.updated ?? '').slice(0, 10)}): ${clip(n.body, 300)}`).join('\n') || '(none)'}`,
        'Check anything important against the transcripts (transcript_search, run ids are above). Return the new state, lessons that hold beyond this purpose, facts the company should know (with a checkable source), and notes to retire.',
      ].join('\n\n'), { schema: DISTILL, label: `dream:distill:${inst.slug}`, extraMcp: mcp(), signal: AbortSignal.timeout(20 * 60_000) })
      if (!r?.summary) continue
      if (f.summary) writeAtomic(path.join(inst.dir, 'summary.prev.md'), f.summary)
      writeAtomic(path.join(inst.dir, 'summary.md'), `${str(r.summary, 2000)}\n\n<!-- written by ${DREAMER} ${now()} from ${f.journal.length} run(s) -->\n`)
      const base = memoryDir(home, def, inst.team ?? undefined)
      for (const l of (r.lessons ?? []).slice(0, 3)) { if (str(l.content, 2000).trim().length > 20) { saveNote(base, { title: str(l.title, 120), content: `${str(l.content, 2000)}\n\n(Lesson from purpose "${inst.purpose}", distilled ${now().slice(0, 10)}.)`, tags: ['lesson', 'dreamed'] }); log.lessons++ } }
      for (const x of (r.facts ?? []).slice(0, 5)) {
        try {
          const ok = this.#checkable(K, x.source) || f.journal.some(j => j.runId && String(x.source).includes(j.runId))
          K.add({ claim: x.claim, strength: ok ? x.strength : 'hearsay', tier: 'agent', area: AREA, purpose: String(inst.purpose).startsWith('ini-') ? inst.purpose : null, by: inst.agent, sourceKind: 'dream', sourceRef: str(x.source, 300) || `instance:${inst.owner}/${inst.slug}`, reviewDays: ok ? undefined : 2 })
          log.facts++
        } catch {}
      }
      for (const n of (r.retireNotes ?? []).slice(0, 10)) { if (f.notes.some(y => y.id === n.id)) { archiveNote(inst.dir, n.id, `dreamer: ${str(n.why, 200)}`); log.retiredNotes++ } }
      updateInstanceMeta(inst.dir, { dirty: false, lastDreamAt: now() })
      log.distilled++
    }
  }

  #retire(st, log) {
    const home = this.sa.forge.registry.home
    for (const i of listInstances(home)) {
      if (i.status === 'archived' || i.dirty) continue
      const last = new Date(i.lastUsedAt ?? i.createdAt).getTime()
      if (Date.now() - last < st.retireDays * DAY) continue
      updateInstanceMeta(i.dir, { status: 'archived', archivedAt: now(), archivedWhy: `unused for ${st.retireDays} days; its lessons were distilled into the role memory` })
      log.retired++
    }
  }

  async #page(api, K, mcp, log) {
    const lastSeq = Number(K.kv(`page:${AREA}:seq`) ?? 0)
    const evs = K.events(lastSeq)
    const page = K.page(AREA)
    if (!evs.length || (page && Date.now() - new Date(page.updated_at).getTime() < DAY && evs.length < 40)) return
    const facts = K.list({ area: AREA, limit: 400 }).filter(f => ['active', 'stale', 'conflict'].includes(f.status)).sort((a, b) => (b.trust + b.uses / 50) - (a.trust + a.uses / 50)).slice(0, 70)
    if (facts.length < 5) return
    const killed = K.list({ area: AREA, kind: 'constraint', limit: 40 })
    const r = await api.agent(DREAMER, [
      `Write the area page "What ${P.companyName} knows" from these recorded facts. One page, read by every agent that starts new work. Keep each claim as strong as recorded; cite fact ids in brackets.`,
      page ? `# The current page (rewrite it; keep what still holds)\n${clip(page.body, 5000)}` : '',
      `# Live facts (strongest and most used first)\n${facts.map(Knowledge.line).join('\n')}`,
      `# Limits and kills, including ones now quarantined or invalid\n${killed.map(Knowledge.line).join('\n') || '(none)'}`,
    ].filter(Boolean).join('\n\n'), { schema: PAGE, label: 'dream:page', extraMcp: mcp(), signal: AbortSignal.timeout(15 * 60_000) })
    if (!r?.body) return
    K.savePage(AREA, { title: str(r.title, 160) || `What ${P.companyName} knows`, body: `${str(r.body, 8000)}\n\n_Written by ${DREAMER} ${now().slice(0, 16)} from ${facts.length} live facts. The facts are the source; this page is a summary._`, writer: DREAMER, sources: facts.map(f => f.id) })
    K.kv(`page:${AREA}:seq`, evs.at(-1).seq)
    log.page = AREA
  }

  /** Per-source reliability: how often an author's checked claims were found wrong. Lowers the trust of its new claims. */
  #learn(K) {
    const rows = K.db.prepare(`SELECT by, SUM(CASE WHEN status = 'invalid' AND invalid_reason LIKE 'wrong%' THEN 1 ELSE 0 END) AS wrong, SUM(CASE WHEN checks > 0 OR (status = 'invalid' AND invalid_reason LIKE 'wrong%') THEN 1 ELSE 0 END) AS checked FROM facts WHERE tier = 'agent' AND by IS NOT NULL GROUP BY by`).all()
    for (const r of rows) {
      if (!r.checked) continue
      const factor = Math.max(0.5, 1 - 0.5 * (r.wrong / Math.max(5, r.checked)))
      K.kv(`reliability:${r.by}`, Math.round(factor * 1000) / 1000)
      K.kv(`reliability-stats:${r.by}`, JSON.stringify({ wrong: r.wrong, checked: r.checked }))
    }
  }
}

export { STRENGTHS }
