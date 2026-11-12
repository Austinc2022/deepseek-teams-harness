/**
 * Company knowledge (L1) and the transcript index (L0), in one SQLite file: forge/knowledge/kb.sqlite.
 *
 * L0 transcripts   every agent transcript in forge/runs, keyword-indexed (FTS5). Ground truth: never edited.
 * L1 facts         claims with provenance, kept forever and never silently rewritten:
 *   claim          as stated, hedge included ("reportedly", "on 44 active days")
 *   tier           where it came from: owner > code > gate > tool > agent > external
 *   strength       what the claim itself says it is: measured > simulated > argued > hearsay
 *   trust          min(tier ceiling, strength). Content can lower trust, never raise it above its source.
 *   bi-temporal    valid_from / valid_until (world time) and recorded_at / invalidated_at (system time)
 *   status         active | stale (past its review date) | conflict | suspect (a source was superseded)
 *                  | quarantined (a source was wrong) | invalid (superseded or wrong; kept for audit)
 *   links          "src derived_from dst": invalidating dst flags everything built on it (rollback repair)
 *   sources        every independent report of the same claim (corroboration)
 * L3 pages         one curated page per area, written by one dreamer at a time
 *
 * Design follows: Zep/Graphiti (bi-temporal invalidation), provenance-capped belief updating (arXiv 2606.22030),
 * hedge preservation (arXiv 2606.29279), constraint-first verification (arXiv 2608.25553), dependency-guided
 * rollback repair (arXiv 2608.10502), Anthropic's memory hierarchy with transcripts as ground truth.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

export const TIERS = { owner: 1, code: 0.95, gate: 0.9, tool: 0.8, agent: 0.6, external: 0.3 }
export const STRENGTHS = { measured: 1, simulated: 0.7, argued: 0.4, hearsay: 0.25 }
/** Days until a fact must be checked again. null: no review date. */
export const VOLATILITY = { market: 7, engine: 14, constraint: 21, decision: 30, org: 60, method: 90, permanent: null }
export const KINDS = ['fact', 'constraint', 'result', 'lesson', 'decision']
export const STATUSES = ['active', 'stale', 'conflict', 'suspect', 'quarantined', 'invalid']
const LIVE = ['active', 'stale', 'conflict', 'suspect']
const DAY = 86400_000

const now = () => new Date().toISOString()
const plusDays = (d, from = Date.now()) => (d == null ? null : new Date(from + d * DAY).toISOString())
const newId = () => `f${crypto.randomBytes(5).toString('hex')}`
const str = (v, n) => String(v ?? '').slice(0, n)
const STOP = new Set('the and for with that this from have has had are was were will would should could into onto than then them they their there what when which while who whom why how not but all any can may might must our your you its it is be been being on in at of to a an as by or if so do does did done per via about over under more most less least very just also only other such each same new last next one two'.split(' '))

/** An FTS5 query from free text: the most frequent meaningful words, OR-ed. null when there are none. */
export function ftsQuery(text, max = 14) {
  const freq = new Map()
  for (const w of String(text ?? '').toLowerCase().match(/[a-z0-9][a-z0-9_]{2,}/g) ?? []) if (!STOP.has(w) && !/^\d+$/.test(w)) freq.set(w, (freq.get(w) ?? 0) + 1)
  const words = [...freq].sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => `"${w.replace(/"/g, '')}"`)
  return words.length ? words.join(' OR ') : null
}

export class Knowledge {
  constructor(home, { file } = {}) {
    this.home = home
    this.file = file ?? path.join(home, 'knowledge', 'kb.sqlite')
    this._db = null
  }

  get db() {
    if (this._db) return this._db
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const db = new DatabaseSync(this.file)
    db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=8000; PRAGMA foreign_keys=OFF;')
    db.exec(`
      CREATE TABLE IF NOT EXISTS facts(
        id TEXT PRIMARY KEY, key TEXT, claim TEXT NOT NULL, kind TEXT, tier TEXT, strength TEXT, trust REAL,
        area TEXT, purpose TEXT, entities TEXT, tags TEXT,
        source_kind TEXT, source_ref TEXT, run_id TEXT, by TEXT,
        volatility TEXT, valid_from TEXT, valid_until TEXT, review_at TEXT,
        recorded_at TEXT, invalidated_at TEXT, invalid_reason TEXT, superseded_by TEXT,
        status TEXT, last_checked_at TEXT, check_note TEXT, checks INTEGER DEFAULT 0,
        uses INTEGER DEFAULT 0, last_used_at TEXT, hash TEXT UNIQUE);
      CREATE INDEX IF NOT EXISTS facts_key ON facts(key, area, status);
      CREATE INDEX IF NOT EXISTS facts_status ON facts(status, review_at);
      CREATE INDEX IF NOT EXISTS facts_purpose ON facts(purpose);
      CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(id UNINDEXED, claim, entities, tags, purpose, tokenize='porter unicode61');
      CREATE TABLE IF NOT EXISTS sources(fact_id TEXT, source_kind TEXT, source_ref TEXT, run_id TEXT, by TEXT, tier TEXT, ts TEXT, PRIMARY KEY(fact_id, source_ref));
      CREATE TABLE IF NOT EXISTS links(src TEXT, dst TEXT, rel TEXT, ts TEXT, PRIMARY KEY(src, dst, rel));
      CREATE INDEX IF NOT EXISTS links_dst ON links(dst);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, ref TEXT, by TEXT, note TEXT, data TEXT);
      CREATE TABLE IF NOT EXISTS context_log(run_id TEXT, label TEXT, agent TEXT, purpose TEXT, ts TEXT, facts TEXT, memory TEXT);
      CREATE INDEX IF NOT EXISTS context_run ON context_log(run_id);
      CREATE TABLE IF NOT EXISTS pages(area TEXT PRIMARY KEY, title TEXT, body TEXT, updated_at TEXT, writer TEXT, sources TEXT);
      CREATE TABLE IF NOT EXISTS transcripts(path TEXT PRIMARY KEY, run_id TEXT, label TEXT, mtime REAL, bytes INTEGER);
      CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts5(path UNINDEXED, run_id UNINDEXED, label, body, tokenize='porter unicode61');
      CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
    `)
    this._db = db
    return db
  }

  close() { try { this._db?.close() } catch {} this._db = null }

  #event(kind, ref, by, note, data) {
    this.db.prepare('INSERT INTO events(ts, kind, ref, by, note, data) VALUES (?,?,?,?,?,?)').run(now(), kind, ref ?? null, by ?? null, str(note, 2000) || null, data ? JSON.stringify(data) : null)
  }

  #tx(fn) {
    const db = this.db
    db.exec('BEGIN IMMEDIATE')
    try { const r = fn(); db.exec('COMMIT'); return r } catch (e) { try { db.exec('ROLLBACK') } catch {} throw e }
  }

  // ---------------------------------------------------------------- facts
  /**
   * Record a fact. Returns { id, status, duplicate?, superseded?, conflictWith? }.
   * Same claim again from a new source: a corroboration (no new row). Same key with a different claim: the newer
   * one supersedes the older when its tier is at least as high; otherwise it is recorded as a conflict.
   */
  add(f) {
    const claim = str(f.claim, 2400).replace(/\s+/g, ' ').trim()
    if (claim.length < 12) throw new Error('a fact needs a claim of 12+ characters')
    const tier = TIERS[f.tier] !== undefined ? f.tier : 'agent'
    const strength = STRENGTHS[f.strength] !== undefined ? f.strength : 'argued'
    const kind = KINDS.includes(f.kind) ? f.kind : 'fact'
    const volatility = VOLATILITY[f.volatility] !== undefined ? f.volatility : kind === 'constraint' ? 'constraint' : 'decision'
    // an author whose checked claims were often wrong gets less trust for new ones (set by the dreamer's learn step)
    let rel = 1
    if (tier === 'agent' && f.by) { try { rel = Number(this.kv(`reliability:${f.by}`) ?? 1) || 1 } catch {} }
    const trust = Math.round(Math.min(TIERS[tier], STRENGTHS[strength]) * rel * 1000) / 1000
    const area = str(f.area, 40) || null
    const purpose = str(f.purpose, 80) || null
    const hash = crypto.createHash('sha1').update(`${claim.toLowerCase()}|${purpose ?? ''}|${area ?? ''}`).digest('hex')
    const sourceRef = str(f.sourceRef, 300) || `${f.sourceKind ?? 'unknown'}:${f.runId ?? ''}`
    const ts = now()
    return this.#tx(() => {
      const db = this.db
      const dup = db.prepare('SELECT id, status, tier FROM facts WHERE hash = ?').get(hash)
      if (dup) {
        db.prepare('INSERT OR IGNORE INTO sources VALUES (?,?,?,?,?,?,?)').run(dup.id, f.sourceKind ?? null, sourceRef, f.runId ?? null, f.by ?? null, tier, ts)
        // the same measurement again is a re-check; a higher tier repeating a claim confirms it
        if (TIERS[tier] >= TIERS[dup.tier] && LIVE.includes(dup.status)) db.prepare('UPDATE facts SET status = \'active\', last_checked_at = ?, checks = checks + 1, review_at = ? WHERE id = ?').run(ts, plusDays(VOLATILITY[volatility]), dup.id)
        return { id: dup.id, status: dup.status, duplicate: true }
      }
      const id = newId()
      let status = 'active'
      let superseded = null
      let conflictWith = null
      const key = str(f.key, 200) || null
      if (key) {
        const old = db.prepare(`SELECT id, tier FROM facts WHERE key = ? AND COALESCE(area,'') = ? AND status IN ('active','stale','conflict','suspect') ORDER BY recorded_at DESC LIMIT 1`).get(key, area ?? '')
        if (old) {
          if (TIERS[tier] >= TIERS[old.tier]) superseded = old.id
          else { status = 'conflict'; conflictWith = old.id }
        }
      }
      db.prepare(`INSERT INTO facts(id, key, claim, kind, tier, strength, trust, area, purpose, entities, tags, source_kind, source_ref, run_id, by,
        volatility, valid_from, valid_until, review_at, recorded_at, status, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, key, claim, kind, tier, strength, trust, area, purpose, JSON.stringify((f.entities ?? []).map(e => str(e, 60)).slice(0, 12)), JSON.stringify((f.tags ?? []).map(t => str(t, 40)).slice(0, 12)),
        str(f.sourceKind, 60) || null, sourceRef, str(f.runId, 60) || null, str(f.by, 80) || null,
        volatility, str(f.validFrom, 40) || ts, str(f.validUntil, 40) || null, plusDays(f.reviewDays ?? VOLATILITY[volatility]), ts, status, hash)
      db.prepare('INSERT INTO facts_fts(id, claim, entities, tags, purpose) VALUES (?,?,?,?,?)').run(id, claim, (f.entities ?? []).join(' '), (f.tags ?? []).join(' '), purpose ?? '')
      db.prepare('INSERT OR IGNORE INTO sources VALUES (?,?,?,?,?,?,?)').run(id, f.sourceKind ?? null, sourceRef, f.runId ?? null, f.by ?? null, tier, ts)
      for (const d of f.derivedFrom ?? []) db.prepare('INSERT OR IGNORE INTO links VALUES (?,?,?,?)').run(`fact:${id}`, String(d).includes(':') ? String(d) : `fact:${d}`, 'derived_from', ts)
      this.#event('add', `fact:${id}`, f.by, claim.slice(0, 300), { tier, strength, status, key })
      if (superseded) this.#invalidate(superseded, { reason: `superseded by ${id}`, by: f.by ?? 'code', wrong: false, supersededBy: id })
      if (conflictWith) this.#event('conflict', `fact:${id}`, f.by, `conflicts with ${conflictWith} (lower source tier)`, { with: conflictWith })
      return { id, status, ...(superseded ? { superseded } : {}), ...(conflictWith ? { conflictWith } : {}) }
    })
  }

  link(src, dst, rel = 'derived_from') {
    const ref = v => (String(v).includes(':') ? String(v) : `fact:${v}`)
    this.db.prepare('INSERT OR IGNORE INTO links VALUES (?,?,?,?)').run(ref(src), ref(dst), rel, now())
  }

  get(id) {
    const f = this.db.prepare('SELECT * FROM facts WHERE id = ?').get(id)
    if (!f) return null
    const out = this.#row(f)
    out.sources = this.db.prepare('SELECT * FROM sources WHERE fact_id = ? ORDER BY ts').all(id)
    out.derivedFrom = this.db.prepare('SELECT dst FROM links WHERE src = ?').all(`fact:${id}`).map(r => r.dst)
    out.dependents = this.db.prepare('SELECT src FROM links WHERE dst = ?').all(`fact:${id}`).map(r => r.src)
    out.history = this.db.prepare('SELECT ts, kind, by, note FROM events WHERE ref = ? ORDER BY seq').all(`fact:${id}`)
    return out
  }

  #row(f) {
    const parse = v => { try { return JSON.parse(v ?? '[]') } catch { return [] } }
    return { ...f, entities: parse(f.entities), tags: parse(f.tags), corroborations: this.db.prepare('SELECT COUNT(DISTINCT source_ref) AS n FROM sources WHERE fact_id = ?').get(f.id).n }
  }

  /** Whether a decision may rest on this fact: a high-trust source, or two independent sources, or a recent check. */
  loadBearing(id) {
    const f = this.db.prepare('SELECT * FROM facts WHERE id = ?').get(id)
    if (!f || f.status !== 'active') return false
    if (TIERS[f.tier] >= TIERS.gate) return true
    const n = this.db.prepare('SELECT COUNT(DISTINCT source_ref) AS n FROM sources WHERE fact_id = ?').get(id).n
    return n >= 2 || (f.last_checked_at && f.checks > 0)
  }

  /**
   * Search. Ranking: keyword relevance x (0.4 + trust) x recency x purpose match x status. Default: live facts only.
   * opts: { purpose, areas, limit, statuses, minTrust, measuredOnly, kinds }
   */
  search(q, opts = {}) {
    const statuses = opts.statuses ?? LIVE
    const where = [`f.status IN (${statuses.map(() => '?').join(',')})`]
    const args = [...statuses]
    if (opts.areas?.length) { where.push(`(f.area IS NULL OR f.area IN (${opts.areas.map(() => '?').join(',')}))`); args.push(...opts.areas) }
    if (opts.measuredOnly) { where.push(`f.strength = 'measured' AND f.tier IN ('owner','code','gate','tool')`) }
    if (opts.minTrust) { where.push('f.trust >= ?'); args.push(opts.minTrust) }
    if (opts.kinds?.length) { where.push(`f.kind IN (${opts.kinds.map(() => '?').join(',')})`); args.push(...opts.kinds) }
    const fq = ftsQuery(q)
    let rows
    if (fq) {
      try {
        rows = this.db.prepare(`SELECT f.*, bm25(facts_fts) AS r FROM facts_fts JOIN facts f ON f.id = facts_fts.id WHERE facts_fts MATCH ? AND ${where.join(' AND ')} ORDER BY r LIMIT 300`).all(fq, ...args)
      } catch { rows = [] }
    }
    // a purpose's own facts count even when the words do not match
    if (opts.purpose) {
      const own = this.db.prepare(`SELECT f.*, 0 AS r FROM facts f WHERE f.purpose = ? AND ${where.join(' AND ')} ORDER BY recorded_at DESC LIMIT 60`).all(opts.purpose, ...args)
      const seen = new Set((rows ?? []).map(r => r.id))
      rows = [...(rows ?? []), ...own.filter(r => !seen.has(r.id))]
    }
    if (!rows) rows = this.db.prepare(`SELECT f.*, 0 AS r FROM facts f WHERE ${where.join(' AND ')} ORDER BY recorded_at DESC LIMIT 60`).all(...args)
    const t = Date.now()
    const score = r => {
      const rel = r.r ? -r.r : 0.5
      const age = (t - new Date(r.recorded_at).getTime()) / DAY
      return (rel + 0.2) * (0.4 + r.trust) * (0.5 + 0.5 * Math.exp(-age / 45)) * (opts.purpose && r.purpose === opts.purpose ? 2 : 1) * (r.kind === 'constraint' ? 1.3 : 1) * (r.status === 'active' ? 1 : 0.6)
    }
    return rows.map(r => ({ ...r, score: score(r) })).sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 10).map(r => this.#row(r))
  }

  /** A line for a prompt: what the fact says, how strong it is, where from, and any warning. */
  static line(f) {
    const flag = { stale: ' [STALE: past its review date, check before relying on it]', conflict: ' [DISPUTED]', suspect: ' [SUSPECT: a source it rests on was superseded]', quarantined: ' [QUARANTINED: rests on a fact found wrong]', invalid: ' [INVALID]' }[f.status] ?? ''
    const single = f.tier === 'agent' || f.tier === 'external' ? (f.corroborations > 1 ? `; ${f.corroborations} sources` : '; single source') : ''
    return `- [${f.id}] ${f.claim} (${f.strength}, from ${f.tier}${f.by ? ` ${f.by}` : ''}, ${String(f.recorded_at).slice(0, 10)}${single})${flag}`
  }

  /**
   * The facts for one run's context, within a character budget, and a record of what was shown.
   * opts: { query, purpose, areas, measuredOnly, budget, runId, label, agent, memory }
   */
  context(opts = {}) {
    const budget = opts.budget ?? 2600
    const found = this.search(opts.query ?? '', { purpose: opts.purpose, areas: opts.areas, measuredOnly: opts.measuredOnly, limit: 30 })
    const lines = []
    let used = 0
    const ids = []
    for (const f of found) {
      const l = Knowledge.line(f)
      if (used + l.length > budget) break
      lines.push(l); ids.push(f.id); used += l.length + 1
    }
    try {
      if (ids.length) this.db.prepare(`UPDATE facts SET uses = uses + 1, last_used_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`).run(now(), ...ids)
      if (opts.runId || opts.label) this.db.prepare('INSERT INTO context_log VALUES (?,?,?,?,?,?,?)').run(opts.runId ?? null, opts.label ?? null, opts.agent ?? null, opts.purpose ?? null, now(), JSON.stringify(ids), JSON.stringify(opts.memory ?? null))
    } catch {}
    if (!lines.length) return { text: '', ids }
    const more = found.length > ids.length ? `\n(${found.length - ids.length} more relevant facts: knowledge_search.)` : ''
    return {
      ids,
      text: `## Company knowledge relevant to this task\nRecorded facts with their source and strength. "measured from code/gate" is strongest; "argued from agent, single source" is an opinion until checked. Facts marked STALE, DISPUTED or SUSPECT may be out of date. If you find a fact wrong or outdated, say so with knowledge_flag and the evidence.\n${lines.join('\n')}${more}`,
    }
  }

  // ---------------------------------------------------------------- correctness
  #invalidate(id, { reason, by, wrong, supersededBy }) {
    const db = this.db
    const ts = now()
    db.prepare('UPDATE facts SET status = \'invalid\', invalidated_at = ?, invalid_reason = ?, superseded_by = COALESCE(?, superseded_by), valid_until = COALESCE(valid_until, ?) WHERE id = ?').run(ts, str(reason, 600), supersededBy ?? null, ts, id)
    this.#event(wrong ? 'invalidate' : 'supersede', `fact:${id}`, by, reason)
    // follow "derived from" backwards: everything built on this fact is flagged, nothing is deleted
    const affected = []
    const seen = new Set([`fact:${id}`])
    let frontier = [`fact:${id}`]
    for (let depth = 0; depth < 6 && frontier.length; depth++) {
      const next = []
      for (const ref of frontier) {
        for (const { src } of db.prepare('SELECT src FROM links WHERE dst = ? AND rel = \'derived_from\'').all(ref)) {
          if (seen.has(src)) continue
          seen.add(src)
          if (src.startsWith('fact:')) {
            const fid = src.slice(5)
            const cur = db.prepare('SELECT status FROM facts WHERE id = ?').get(fid)
            if (!cur || cur.status === 'invalid') continue
            const to = wrong ? 'quarantined' : 'suspect'
            if (cur.status !== 'quarantined') db.prepare('UPDATE facts SET status = ? WHERE id = ?').run(to, fid)
            this.#event(to, src, 'code', `rests on ${ref}, which was ${wrong ? 'found wrong' : 'superseded'}`)
            next.push(src)
          }
          affected.push(src)
        }
      }
      frontier = next
    }
    if (affected.length) this.#event('affected', `fact:${id}`, by, `${affected.length} dependent item(s) flagged`, { wrong, affected })
    return affected
  }

  /** The fact is wrong (wrong: true) or out of date (wrong: false). Everything derived from it is flagged. */
  invalidate(id, { reason, by = 'code', wrong = true } = {}) {
    if (!this.db.prepare('SELECT id FROM facts WHERE id = ?').get(id)) throw new Error(`no fact ${id}`)
    if (str(reason, 600).trim().length < 8) throw new Error('say why the fact is wrong or outdated')
    return this.#tx(() => ({ affected: this.#invalidate(id, { reason, by, wrong }) }))
  }

  /** A check confirmed the fact: back to active, review date pushed out. Never raises its tier or strength. */
  verify(id, { by = 'code', note = '' } = {}) {
    const f = this.db.prepare('SELECT volatility, status FROM facts WHERE id = ?').get(id)
    if (!f) throw new Error(`no fact ${id}`)
    if (f.status === 'invalid') throw new Error('an invalid fact cannot be confirmed; record a new one')
    this.db.prepare('UPDATE facts SET status = \'active\', last_checked_at = ?, check_note = ?, checks = checks + 1, review_at = ? WHERE id = ?').run(now(), str(note, 600), plusDays(VOLATILITY[f.volatility] ?? 30), id)
    this.#event('verify', `fact:${id}`, by, note)
  }

  /** Not settled: look again later (unclear check). */
  defer(id, { by = 'code', note = '', days = 3 } = {}) {
    this.db.prepare('UPDATE facts SET last_checked_at = ?, check_note = ?, review_at = ? WHERE id = ?').run(now(), str(note, 600), plusDays(days), id)
    this.#event('defer', `fact:${id}`, by, note)
  }

  /** Someone says the fact is wrong or outdated. From the owner it is decided at once; otherwise it is disputed. */
  flag(id, { by = 'agent', note, owner = false, wrong = true } = {}) {
    if (str(note, 1000).trim().length < 12) throw new Error('give the evidence: what shows the fact is wrong or outdated')
    if (owner) return this.invalidate(id, { reason: `the owner: ${note}`, by: 'owner', wrong })
    this.db.prepare('UPDATE facts SET status = \'conflict\', check_note = ? WHERE id = ? AND status IN (\'active\',\'stale\',\'suspect\')').run(str(note, 1000), id)
    this.#event('flag', `fact:${id}`, by, note)
    return { affected: [] }
  }

  /** Mark live facts past their review date as stale. Returns how many. */
  expire() {
    return Number(this.db.prepare('UPDATE facts SET status = \'stale\' WHERE status = \'active\' AND review_at IS NOT NULL AND review_at < ?').run(now()).changes)
  }

  /** What needs checking, most important first: constraints (limits, kills) before anything else. */
  due(limit = 12, { areas } = {}) {
    const a = areas?.length ? `AND (area IS NULL OR area IN (${areas.map(() => '?').join(',')}))` : ''
    return this.db.prepare(`SELECT * FROM facts WHERE (status IN ('stale','conflict','suspect','quarantined') OR (status = 'active' AND review_at < ?)) AND (review_at IS NULL OR review_at < ? OR last_checked_at IS NULL) ${a}
      ORDER BY CASE kind WHEN 'constraint' THEN 0 ELSE 1 END, CASE status WHEN 'quarantined' THEN 0 WHEN 'conflict' THEN 1 WHEN 'suspect' THEN 2 ELSE 3 END, uses DESC, trust DESC LIMIT ?`)
      .all(now(), now(), ...(areas ?? []), limit).map(r => this.#row(r))
  }

  /** Events after a sequence number (cross-process notifications: affected items, conflicts). */
  events(after = 0, kinds) {
    const k = kinds?.length ? `AND kind IN (${kinds.map(() => '?').join(',')})` : ''
    return this.db.prepare(`SELECT * FROM events WHERE seq > ? ${k} ORDER BY seq LIMIT 500`).all(after, ...(kinds ?? [])).map(e => ({ ...e, data: e.data ? JSON.parse(e.data) : null }))
  }

  kv(k, v) {
    if (v === undefined) return this.db.prepare('SELECT v FROM kv WHERE k = ?').get(k)?.v ?? null
    this.db.prepare('INSERT INTO kv VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, String(v))
  }

  list({ status, area, purpose, kind, limit = 100, offset = 0 } = {}) {
    const where = ['1=1']; const args = []
    if (status) { where.push('status = ?'); args.push(status) }
    if (area) { where.push('area = ?'); args.push(area) }
    if (purpose) { where.push('purpose = ?'); args.push(purpose) }
    if (kind) { where.push('kind = ?'); args.push(kind) }
    return this.db.prepare(`SELECT * FROM facts WHERE ${where.join(' AND ')} ORDER BY recorded_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset).map(r => this.#row(r))
  }

  stats() {
    const by = this.db.prepare('SELECT status, COUNT(*) AS n FROM facts GROUP BY status').all()
    const tiers = this.db.prepare('SELECT tier, COUNT(*) AS n FROM facts WHERE status != \'invalid\' GROUP BY tier').all()
    return {
      facts: Object.fromEntries(by.map(r => [r.status, r.n])),
      tiers: Object.fromEntries(tiers.map(r => [r.tier, r.n])),
      transcripts: this.db.prepare('SELECT COUNT(*) AS n FROM transcripts').get().n,
      pages: this.db.prepare('SELECT COUNT(*) AS n FROM pages').get().n,
      due: this.db.prepare('SELECT COUNT(*) AS n FROM facts WHERE status IN (\'stale\',\'conflict\',\'suspect\',\'quarantined\')').get().n,
    }
  }

  contextOf(runId) {
    return this.db.prepare('SELECT * FROM context_log WHERE run_id = ? ORDER BY ts').all(runId).map(r => {
      const ids = JSON.parse(r.facts ?? '[]')
      return { ...r, memory: JSON.parse(r.memory ?? 'null'), facts: ids.map(id => { const f = this.db.prepare('SELECT id, claim, status, tier, strength FROM facts WHERE id = ?').get(id); return f ?? { id, missing: true } }) }
    })
  }

  // ---------------------------------------------------------------- pages (L3)
  page(area) { return this.db.prepare('SELECT * FROM pages WHERE area = ?').get(area) ?? null }
  pages() { return this.db.prepare('SELECT area, title, updated_at, writer, length(body) AS bytes FROM pages ORDER BY area').all() }
  savePage(area, { title, body, writer, sources = [] }) {
    this.db.prepare('INSERT INTO pages VALUES (?,?,?,?,?,?) ON CONFLICT(area) DO UPDATE SET title = excluded.title, body = excluded.body, updated_at = excluded.updated_at, writer = excluded.writer, sources = excluded.sources')
      .run(str(area, 80), str(title, 160), str(body, 16000), now(), str(writer, 80), JSON.stringify(sources.slice(0, 200)))
    this.#event('page', `page:${area}`, writer, title)
  }

  // ---------------------------------------------------------------- transcripts (L0)
  /** Index new or changed transcripts under forge/runs. Incremental; returns how many files were (re)indexed. */
  indexTranscripts(runsDir = path.join(this.home, 'runs'), { max = 600 } = {}) {
    let runs
    try { runs = fs.readdirSync(runsDir).filter(n => !n.startsWith('.')).sort().reverse() } catch { return 0 }
    const known = new Map(this.db.prepare('SELECT path, mtime FROM transcripts').all().map(r => [r.path, r.mtime]))
    let n = 0
    const ins = this.db.prepare('INSERT INTO transcripts VALUES (?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime, bytes = excluded.bytes')
    const del = this.db.prepare('DELETE FROM transcripts_fts WHERE path = ?')
    const fts = this.db.prepare('INSERT INTO transcripts_fts(path, run_id, label, body) VALUES (?,?,?,?)')
    for (const run of runs) {
      const dir = path.join(runsDir, run, 'agents')
      let files
      try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')) } catch { continue }
      for (const f of files) {
        if (n >= max) return n
        const full = path.join(dir, f)
        let st
        try { st = fs.statSync(full) } catch { continue }
        const rel = `${run}/agents/${f}`
        if (known.get(rel) === st.mtimeMs) continue
        let body = ''
        try { body = fs.readFileSync(full, 'utf8').slice(0, 300_000) } catch { continue }
        this.#tx(() => { del.run(rel); fts.run(rel, run, f.replace(/^\d+-/, '').replace(/\.md$/, ''), body); ins.run(rel, run, f, st.mtimeMs, st.size) })
        n++
      }
    }
    return n
  }

  searchTranscripts(q, { limit = 8, runId } = {}) {
    const fq = ftsQuery(q, 10)
    if (!fq) return []
    try {
      return this.db.prepare(`SELECT path, run_id, label, snippet(transcripts_fts, 3, '[', ']', ' ... ', 40) AS snip FROM transcripts_fts WHERE transcripts_fts MATCH ? ${runId ? 'AND run_id = ?' : ''} ORDER BY bm25(transcripts_fts) LIMIT ?`).all(fq, ...(runId ? [runId] : []), limit)
    } catch { return [] }
  }

  transcriptExists(ref) {
    const r = String(ref ?? '')
    return !!this.db.prepare('SELECT 1 FROM transcripts WHERE path = ? OR run_id = ? LIMIT 1').get(r, r)
  }
}

const KEY = Symbol.for('agent-forge.knowledge')
/** One store per forge home and process. */
export function getKnowledge(home) {
  const map = (globalThis[KEY] ??= new Map())
  if (!map.has(home)) map.set(home, new Knowledge(home))
  return map.get(home)
}

/** The agent tools over the store (in-process MCP). Judges get read-only, measured-only access. */
export function knowledgeTools(kb, { judge = false, by, areas, purpose, area } = {}) {
  const S = { type: 'string' }
  const defs = [
    { name: 'knowledge_search', description: `Search the company's recorded facts (results, killed ideas, gate verdicts, engine measurements) with their source, strength and status.${judge ? ' You see measured facts only.' : ''}`, inputSchema: { type: 'object', properties: { query: S, limit: { type: 'number' } }, required: ['query'] } },
    { name: 'knowledge_get', description: 'One fact in full: its sources, what it was derived from, what depends on it, and its history.', inputSchema: { type: 'object', properties: { id: S }, required: ['id'] } },
    { name: 'transcript_search', description: 'Keyword search over the original transcripts of every agent run (the ground truth behind facts and notes). Use it to check what was actually measured or said.', inputSchema: { type: 'object', properties: { query: S, run: { type: 'string', description: 'optional run id' } }, required: ['query'] } },
    { name: 'knowledge_flag', description: 'Report that a recorded fact is wrong or out of date, with the evidence (a transcript, a file, a fresh measurement). It is marked disputed and checked.', inputSchema: { type: 'object', properties: { id: S, evidence: S }, required: ['id', 'evidence'] } },
  ]
  if (!judge) defs.push({ name: 'knowledge_add', description: 'Record a fact for the whole company. Write the claim exactly as strong as the evidence: keep words like "reportedly", "about", "on N days". strength: measured only if you ran it yourself and give the file or command; simulated for a model or backtest; argued for reasoning; hearsay for what someone else said. Your facts are recorded as agent claims until checked.', inputSchema: { type: 'object', properties: { claim: S, strength: { type: 'string', enum: ['measured', 'simulated', 'argued', 'hearsay'] }, source: { type: 'string', description: 'file path, command or run id that shows it' }, kind: { type: 'string', enum: ['fact', 'constraint', 'result', 'lesson'] }, entities: { type: 'array', items: S } }, required: ['claim', 'strength', 'source'] } })
  const handle = (name, a) => {
    if (name === 'knowledge_search') {
      const rows = kb.search(a.query, { areas, purpose, measuredOnly: judge, limit: Math.min(20, Number(a.limit) || 8) })
      const page = areas?.length ? areas.map(x => kb.page(x)).find(Boolean) : null
      return [rows.length ? rows.map(Knowledge.line).join('\n') : 'No recorded facts match.', page && !judge ? `\n(Area page "${page.title}" exists; its facts are above.)` : ''].join('')
    }
    if (name === 'knowledge_get') { const f = kb.get(String(a.id ?? '')); if (!f) return 'No such fact.'; if (judge && !(f.strength === 'measured' && ['owner', 'code', 'gate', 'tool'].includes(f.tier))) return 'Not available to you (not a measured fact).'; return JSON.stringify(f, null, 1).slice(0, 8000) }
    if (name === 'transcript_search') { const r = kb.searchTranscripts(a.query, { runId: a.run }); return r.length ? r.map(x => `## ${x.path}\n${x.snip}`).join('\n\n') : 'No transcript matches.' }
    if (name === 'knowledge_flag') { kb.flag(String(a.id ?? ''), { by, note: a.evidence }); return 'Flagged: it is marked disputed and will be checked against the transcripts.' }
    if (name === 'knowledge_add') {
      const r = kb.add({ claim: a.claim, strength: a.strength, tier: 'agent', kind: a.kind, entities: a.entities, area, purpose, by, sourceKind: 'agent', sourceRef: str(a.source, 300) || `agent:${by}` })
      return r.duplicate ? `Already recorded as ${r.id}; your report counts as another source.` : `Recorded as ${r.id} (${r.status}).`
    }
    throw new Error(`unknown tool ${name}`)
  }
  return { defs, handle }
}
