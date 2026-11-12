/**
 * Pluggable agent memory, in two layers.
 *
 *   ROLE memory      how to do this job well; shared by every use of the agent definition
 *                    forge/memory/agents/<agent>   (scope agent)   or   forge/memory/teams/<team> (scope team)
 *   PURPOSE memory   one initiative / workstream / asker: what was tried, the current state, decisions
 *                    forge/memory/instances/<agent | team-<team>>/<purpose>/
 *                    created the first time a run names the purpose, with a generated starting pack (genesis.md);
 *                    summary.md is the rolling state of the purpose, rewritten by the dreamer
 *
 * Modes (def.memory.mode): none (stateless) | markdown (notes) | journal (episodic log) | hybrid | session.
 * Judges (tag "judge"), builders (tag "builder", their state is the ticket folder) and the dreamer are stateless,
 * whatever their file says: a judge must not remember what it was told before.
 * scope: agent | team | global; `namespace` overrides the role folder. A team-scoped agent run outside a team uses
 * its own agent folder (there is no shared "default" bucket any more).
 */
import fs from 'node:fs'
import path from 'node:path'
import { getKnowledge, Knowledge } from './knowledge.js'

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'note'
export const purposeSlug = p => slug(p).slice(0, 48)
const tokens = s => String(s).toLowerCase().match(/[a-z0-9À-￿]{2,}/g) ?? []
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n)}…` : s }

export function score(queryTokens, text) {
  const t = tokens(text)
  if (!t.length) return 0
  const freq = new Map()
  for (const w of t) freq.set(w, (freq.get(w) ?? 0) + 1)
  let s = 0
  for (const q of queryTokens) {
    for (const [w, n] of freq) if (w === q) s += 3 * n; else if (w.startsWith(q)) s += n
  }
  return s / Math.sqrt(t.length)
}
export { tokens }

/** judge | builder | dreamer | stateful. Judges and builders never carry memory between runs. */
export function agentKind(def) {
  const t = def?.tags ?? []
  if (t.includes('judge')) return 'judge'
  if (t.includes('dreamer')) return 'dreamer'
  if (t.includes('builder')) return 'builder'
  return 'stateful'
}

/** The knowledge areas an agent sees: its explicit areas, its tags and its name prefix. */
export function areasOf(def) {
  return [...new Set([...(def?.knowledge?.areas ?? []), ...(def?.tags ?? []), String(def?.name ?? '').split('-')[0]].filter(Boolean))]
}

// ---------------------------------------------------------------- files (atomic, locked)
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
function withLock(dir, fn) {
  const lock = path.join(dir, '.lock')
  fs.mkdirSync(dir, { recursive: true })
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(lock); break } catch {
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 30_000) { fs.rmSync(lock, { recursive: true, force: true }); continue } } catch {}
      if (i > 100) break // 2 s: proceed rather than lose the write
      sleep(20)
    }
  }
  try { return fn() } finally { fs.rmSync(lock, { recursive: true, force: true }) }
}
export function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
}
const readText = (f, n = Infinity) => { try { const t = fs.readFileSync(f, 'utf8'); return n === Infinity ? t : t.slice(0, n) } catch { return '' } }

// ---------------------------------------------------------------- folders
export function memoryDir(home, def, team) {
  const m = def.memory
  if (m.namespace) return path.join(home, 'memory', 'ns', slug(m.namespace))
  if (m.scope === 'global') return path.join(home, 'memory', 'global')
  if (m.scope === 'team' && team) return path.join(home, 'memory', 'teams', slug(team))
  return path.join(home, 'memory', 'agents', def.name)
}

/** Who owns the purpose memory: the team for a team-scoped agent in a team, else the agent. */
export function instanceOwner(def, team) {
  if (def.memory?.namespace) return `ns-${slug(def.memory.namespace)}`
  if (def.memory?.scope === 'team' && team) return `team-${slug(team)}`
  return def.name
}
export function instanceDir(home, def, { team, purpose } = {}) {
  if (!purpose) return null
  return path.join(home, 'memory', 'instances', instanceOwner(def, team), purposeSlug(purpose))
}

// ---------------------------------------------------------------- notes
const parseNote = text => {
  const [, fm = '', body = ''] = text.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/) ?? [null, '', text]
  const get = k => { const v = fm.match(new RegExp(`^${k}: (.*)$`, 'm'))?.[1]; try { return v ? JSON.parse(v) : undefined } catch { return v } }
  return { title: get('title'), tags: get('tags') ?? [], updated: get('updated') ?? null, body: body.trim() }
}

const markdown = {
  entries(dir) {
    const notes = path.join(dir, 'notes')
    if (!fs.existsSync(notes)) return []
    return fs.readdirSync(notes).filter(f => f.endsWith('.md')).map(f => ({ id: f.slice(0, -3), text: readText(path.join(notes, f)) }))
  },
  /** Notes newest first: what the injected index shows within its budget. */
  ranked(dir) {
    return markdown.entries(dir).map(e => ({ ...e, ...parseNote(e.text) })).sort((a, b) => String(b.updated ?? '').localeCompare(String(a.updated ?? '')))
  },
  save(dir, { title, content, tags = [] }) {
    const id = slug(title)
    const body = `---\ntitle: ${JSON.stringify(String(title))}\ntags: ${JSON.stringify(tags)}\nupdated: ${new Date().toISOString()}\n---\n\n${content}\n`
    withLock(dir, () => { writeAtomic(path.join(dir, 'notes', `${id}.md`), body); reindex(dir) })
    return id
  },
  /** Archive (never delete): notes/.archive keeps the old text for audit. */
  archive(dir, id, why = '') {
    withLock(dir, () => {
      const f = path.join(dir, 'notes', `${slug(id)}.md`)
      if (fs.existsSync(f)) {
        const to = path.join(dir, 'notes', '.archive', `${slug(id)}.${Date.now()}.md`)
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.writeFileSync(to, `<!-- archived ${new Date().toISOString()}${why ? `: ${why}` : ''} -->\n${readText(f)}`)
        fs.rmSync(f)
      }
      reindex(dir)
    })
  },
}

function reindex(dir) {
  const lines = markdown.ranked(dir).map(e => `- [${e.title ?? e.id}](notes/${e.id}.md): ${clip(e.body.split('\n')[0], 140)}`)
  writeAtomic(path.join(dir, 'MEMORY.md'), `${lines.join('\n')}\n`)
}

const journal = {
  rows(dir) {
    const f = path.join(dir, 'journal.jsonl')
    if (!fs.existsSync(f)) return []
    return readText(f).trim().split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)] } catch { return [] } })
  },
  text(rows, n, chars) {
    const t = rows.slice(-n).map(r => `### ${String(r.ts).slice(0, 16)} ${r.label ?? ''}\nTask: ${clip(r.task, 300)}\nOutcome: ${clip(r.outcome, 700)}`).join('\n\n')
    return clip(t, chars)
  },
  append(dir, row) {
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'journal.jsonl'), `${JSON.stringify(row)}\n`)
  },
}

/** The index of notes in a folder, newest first, within a budget, saying how many were left out. */
function indexText(dir, chars) {
  const notes = markdown.ranked(dir)
  const lines = []
  let used = 0
  for (const e of notes) {
    const l = `- [${e.title ?? e.id}] (id ${e.id}, ${String(e.updated ?? '').slice(0, 10)}): ${clip(e.body.split('\n')[0], 140)}`
    if (used + l.length > chars) break
    lines.push(l); used += l.length + 1
  }
  if (!notes.length) return ''
  return `${lines.join('\n')}${notes.length > lines.length ? `\n(${notes.length - lines.length} older notes not shown: memory_search or memory_read finds them.)` : ''}`
}

// ---------------------------------------------------------------- starting pack
/**
 * What a new purpose memory starts out knowing, generated by code: the recorded facts most relevant to the purpose,
 * killed ideas nearby, the area page, and (for a fork) the state of the purpose it was forked from.
 * fresh: measured facts only, no one's opinions or summaries (for work that must challenge earlier conclusions).
 */
export function startingPack(home, def, { purpose, team, fresh = false, forkFrom, brief } = {}) {
  const kb = getKnowledge(home)
  const areas = areasOf(def)
  const query = `${purpose} ${brief ?? ''} ${def.description ?? ''}`
  const parts = [`# Starting pack: ${def.name} for "${purpose}"`, `Generated ${new Date().toISOString().slice(0, 16)} by code${fresh ? ' (fresh eyes: measured facts only; earlier opinions and summaries are deliberately left out)' : ''}.`]
  try {
    const facts = kb.search(query, { purpose, areas, measuredOnly: fresh, limit: 14 })
    if (facts.length) parts.push(`## What is recorded\n${facts.map(Knowledge.line).join('\n')}`)
    if (!fresh) {
      const kills = kb.search(query, { areas, kinds: ['constraint'], limit: 6 }).filter(f => !facts.some(x => x.id === f.id))
      if (kills.length) parts.push(`## Limits and killed ideas nearby (check whether they still hold before building on them)\n${kills.map(Knowledge.line).join('\n')}`)
      const page = areas.map(a => kb.page(a)).find(Boolean)
      if (page) parts.push(`## Area page: ${page.title} (updated ${String(page.updated_at).slice(0, 10)})\n${clip(page.body, 1800)}`)
    }
  } catch (e) { parts.push(`(The knowledge store could not be read: ${e.message})`) }
  if (forkFrom && !fresh) {
    const src = instanceDir(home, def, { team, purpose: forkFrom }) ?? ''
    const s = readText(path.join(src, 'summary.md'), 2400) || readText(path.join(src, 'genesis.md'), 1600)
    if (s) parts.push(`## Inherited from "${forkFrom}"\n${s}`)
  }
  if (parts.length === 2) parts.push('Nothing is recorded yet for this purpose. Record what you learn: memory_save for your own working notes, knowledge_add for facts the company should know.')
  return parts.join('\n\n')
}

/** Create a purpose memory (instance) now, with its starting pack. Returns its folder. Safe to repeat. */
export function ensureInstance(home, def, { purpose, team, fresh = false, forkFrom, brief, reason } = {}) {
  const dir = instanceDir(home, def, { team, purpose })
  if (!dir) return null
  if (fs.existsSync(path.join(dir, 'meta.json'))) return dir
  fs.mkdirSync(path.join(dir, 'notes'), { recursive: true })
  const meta = { agent: def.name, owner: instanceOwner(def, team), purpose: String(purpose), slug: purposeSlug(purpose), team: team ?? null, fresh: !!fresh, forkedFrom: forkFrom ?? null, reason: reason ?? null, createdAt: new Date().toISOString(), lastUsedAt: null, runs: 0, status: 'active' }
  writeAtomic(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2))
  writeAtomic(path.join(dir, 'genesis.md'), startingPack(home, def, { purpose, team, fresh, forkFrom, brief }))
  return dir
}

// ---------------------------------------------------------------- open for one run
const NONE = mode => ({ mode, dir: null, instance: null, context: '', toolDefs: [], handle: null, afterRun() {}, sessionId: null, saveSession() {}, injected: null })

/** Open memory for one agent run. opts: { team, purpose, fresh, forkFrom } */
export function openMemory(home, def, { team, purpose, fresh, forkFrom } = {}) {
  const m = def.memory
  const kind = agentKind(def)
  if (m.mode === 'none' || kind !== 'stateful') return NONE('none')
  const mode = m.mode
  const base = memoryDir(home, def, team)
  fs.mkdirSync(base, { recursive: true })
  const inst = purpose ? ensureInstance(home, def, { purpose, team, fresh, forkFrom }) : null
  const writeDir = inst ?? base
  const useMd = mode === 'markdown' || mode === 'hybrid'
  const useJournal = mode === 'journal' || mode === 'hybrid'

  // the injected layer, within the agent's budget: purpose state first, then the role's lessons
  const budget = m.injectChars ?? 6000
  const parts = []
  if (inst) {
    const meta = (() => { try { return JSON.parse(readText(path.join(inst, 'meta.json'))) } catch { return {} } })()
    const summary = readText(path.join(inst, 'summary.md'))
    parts.push(`## Your purpose memory: "${meta.purpose ?? purpose}"${meta.fresh ? ' (fresh eyes)' : ''}\n${summary ? `Current state (kept by the dreamer from your past runs):\n${clip(summary, Math.round(budget * 0.3))}` : `Starting pack (first work on this purpose):\n${clip(readText(path.join(inst, 'genesis.md')), Math.round(budget * 0.3))}`}`)
    if (useMd) { const idx = indexText(inst, Math.round(budget * 0.12)); if (idx) parts.push(`Notes for this purpose (memory_read by id):\n${idx}`) }
    if (useJournal) { const j = journal.text(journal.rows(inst), 3, Math.round(budget * 0.18)); if (j) parts.push(`Your last runs on this purpose:\n${j}`) }
  }
  if (useMd) { const idx = indexText(base, Math.round(budget * (inst ? 0.25 : 0.5))); if (idx) parts.push(`## Your role memory (lessons for this job, newest first; memory_read by id)\n${idx}`) }
  if (useJournal && !inst) { const j = journal.text(journal.rows(base), m.journalEntries ?? 6, Math.round(budget * 0.45)); if (j) parts.push(`## Your recent work journal (most recent last)\n${j}`) }

  const toolNames = new Set([...(useMd ? ['memory_save', 'memory_search', 'memory_read', 'memory_delete'] : []), ...(useJournal ? ['memory_search'] : [])])
  const toolDefs = [
    { name: 'memory_save', description: `Save or overwrite a memory note that future runs of you will see.${inst ? ' layer "purpose" (default): about this purpose only. layer "role": a lesson about doing your job well, useful for every purpose.' : ''} Write it as strong as the evidence: keep "probably", "on N days", "according to X".`, inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, ...(inst ? { layer: { type: 'string', enum: ['purpose', 'role'] } } : {}) }, required: ['title', 'content'] } },
    { name: 'memory_search', description: 'Keyword search across your memory notes and journal (purpose and role).', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
    { name: 'memory_read', description: 'Read one memory note by id.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'memory_delete', description: 'Retire an outdated or wrong note by id (it is archived, not destroyed).', inputSchema: { type: 'object', properties: { id: { type: 'string' }, why: { type: 'string' } }, required: ['id'] } },
  ].filter(t => toolNames.has(t.name))
  const dirs = [inst, base].filter(Boolean)
  const allEntries = () => dirs.flatMap(d => [...(useMd ? markdown.entries(d) : []), ...(useJournal ? journal.rows(d).map((r, i) => ({ id: `journal-${i}`, text: `${r.ts} ${r.label ?? ''}\nTask: ${r.task}\nOutcome: ${r.outcome}` })) : [])])
  const handle = (name, args) => {
    switch (name) {
      case 'memory_save': { const d = args.layer === 'role' ? base : writeDir; return `saved note "${markdown.save(d, args)}"${d === base && inst ? ' in your role memory' : ''}` }
      case 'memory_search': {
        const q = tokens(args.query)
        const hits = allEntries().map(e => ({ ...e, s: score(q, e.text) })).filter(e => e.s > 0).sort((a, b) => b.s - a.s).slice(0, args.limit ?? 6)
        return hits.length ? hits.map(h => `## ${h.id}\n${h.text.slice(0, 1500)}`).join('\n\n') : 'no matching memories'
      }
      case 'memory_read': {
        for (const d of dirs) { const f = path.join(d, 'notes', `${slug(args.id)}.md`); if (fs.existsSync(f)) return readText(f) }
        return `no note "${args.id}"`
      }
      case 'memory_delete': {
        const d = dirs.find(x => fs.existsSync(path.join(x, 'notes', `${slug(args.id)}.md`)))
        if (!d) return `no note "${args.id}"`
        markdown.archive(d, args.id, args.why)
        return `retired "${args.id}" (archived)`
      }
    }
    throw new Error(`unknown memory tool ${name}`)
  }

  const sessionFile = path.join(writeDir, 'session.json')
  const sessionId = mode === 'session' && fs.existsSync(sessionFile) ? JSON.parse(readText(sessionFile)).sessionId : null

  return {
    mode, dir: writeDir, base, instance: inst, purpose: purpose ?? null,
    context: parts.filter(Boolean).join('\n\n'),
    toolDefs, handle, sessionId,
    injected: { base, instance: inst, chars: parts.join('').length },
    saveSession(id) { if (mode === 'session' && id) writeAtomic(sessionFile, JSON.stringify({ sessionId: id, updated: new Date().toISOString() })) },
    afterRun({ task, outcome, label, runId, ok }) {
      if (useJournal && (m.autoJournal ?? true)) journal.append(writeDir, { ts: new Date().toISOString(), runId, label, ok, task: String(task).slice(0, 2000), outcome: String(outcome ?? '').slice(0, 4000) })
      if (inst) {
        try {
          withLock(inst, () => {
            const f = path.join(inst, 'meta.json')
            const meta = JSON.parse(readText(f) || '{}')
            meta.lastUsedAt = new Date().toISOString(); meta.runs = (meta.runs ?? 0) + 1; meta.dirty = true
            if (meta.status === 'archived') meta.status = 'active'
            writeAtomic(f, JSON.stringify(meta, null, 2))
          })
        } catch {}
      }
    },
  }
}

// ---------------------------------------------------------------- listings
/** Every purpose memory, for the dashboard and the dreamer. */
export function listInstances(home) {
  const root = path.join(home, 'memory', 'instances')
  const out = []
  let owners = []
  try { owners = fs.readdirSync(root).filter(n => !n.startsWith('.')) } catch { return out }
  for (const owner of owners) {
    let ps = []
    try { ps = fs.readdirSync(path.join(root, owner)).filter(n => !n.startsWith('.')) } catch { continue }
    for (const p of ps) {
      const dir = path.join(root, owner, p)
      let meta = {}
      try { meta = JSON.parse(readText(path.join(dir, 'meta.json'))) } catch { continue }
      out.push({ ...meta, owner, dir, notes: markdown.entries(dir).length, journal: journal.rows(dir).length, hasSummary: fs.existsSync(path.join(dir, 'summary.md')) })
    }
  }
  return out.sort((a, b) => String(b.lastUsedAt ?? b.createdAt).localeCompare(String(a.lastUsedAt ?? a.createdAt)))
}

export function updateInstanceMeta(dir, patch) {
  withLock(dir, () => {
    const f = path.join(dir, 'meta.json')
    const meta = JSON.parse(readText(f) || '{}')
    writeAtomic(f, JSON.stringify({ ...meta, ...patch }, null, 2))
  })
}
export const instanceFiles = dir => ({ meta: (() => { try { return JSON.parse(readText(path.join(dir, 'meta.json'))) } catch { return {} } })(), summary: readText(path.join(dir, 'summary.md')), genesis: readText(path.join(dir, 'genesis.md')), journal: journal.rows(dir), notes: markdown.ranked(dir) })
export const journalRows = dir => journal.rows(dir)
export const rankedNotes = dir => markdown.ranked(dir)
export const archiveNote = (dir, id, why) => markdown.archive(dir, id, why)

/** Everything stored in one agent's memory folders, for the chat Memory tab. Null when the agent has no memory. */
export function listMemory(home, def, { team } = {}) {
  const m = def.memory
  if (m.mode === 'none' || agentKind(def) !== 'stateful') return null
  const dir = memoryDir(home, def, team)
  const notes = markdown.ranked(dir).map(e => ({ id: e.id, title: e.title ?? e.id, tags: e.tags, updated: e.updated, body: e.body }))
  const journalRowsAll = journal.rows(dir)
  const sf = path.join(dir, 'session.json')
  let session = null
  try { if (fs.existsSync(sf)) session = JSON.parse(readText(sf)) } catch {}
  const owner = instanceOwner(def, team)
  return {
    dir, mode: m.mode, scope: m.namespace ? 'namespace' : m.scope, namespace: m.namespace,
    notes, journal: journalRowsAll.slice(-60).reverse().map(r => ({ ts: r.ts, label: r.label, ok: r.ok, task: String(r.task ?? '').slice(0, 600), outcome: String(r.outcome ?? '').slice(0, 1500) })),
    journalCount: journalRowsAll.length, session,
    instances: listInstances(home).filter(i => i.owner === owner).map(i => ({ purpose: i.purpose, createdAt: i.createdAt, lastUsedAt: i.lastUsedAt, runs: i.runs, status: i.status, fresh: i.fresh, forkedFrom: i.forkedFrom })),
  }
}

/** Save or delete a markdown note in a memory folder (the caller checks the folder belongs to the chat). */
export function saveNote(dir, note) { return `saved note "${markdown.save(dir, note)}"` }
export function deleteNote(dir, id) { markdown.archive(dir, id, 'deleted from the chat Memory tab') }
