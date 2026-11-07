/**
 * Pluggable agent memory.
 *
 *   none      stateless: nothing injected, no memory tools
 *   markdown  curated notes (notes/*.md + MEMORY.md index); agent saves/searches via tools
 *   journal   episodic log: every run's task + outcome appended automatically; last entries injected
 *   hybrid    markdown + journal
 *   session   resumes the agent's previous Claude Code session (full conversational state)
 *
 * scope: agent (private) | team (shared by a team) | global; `namespace` overrides the directory.
 * New backends: add an entry to BACKENDS with { context, tools, handle, afterRun }.
 */
import fs from 'node:fs'
import path from 'node:path'

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'note'
const tokens = s => String(s).toLowerCase().match(/[a-z0-9À-￿]{2,}/g) ?? []

function score(queryTokens, text) {
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

export function memoryDir(home, def, team) {
  const m = def.memory
  if (m.namespace) return path.join(home, 'memory', 'ns', slug(m.namespace))
  if (m.scope === 'global') return path.join(home, 'memory', 'global')
  if (m.scope === 'team') return path.join(home, 'memory', 'teams', slug(team ?? 'default'))
  return path.join(home, 'memory', 'agents', def.name)
}

const markdown = {
  context(dir, m) {
    const idx = path.join(dir, 'MEMORY.md')
    if (!fs.existsSync(idx)) return ''
    return `## Your long-term memory (markdown notes)\nIndex of saved notes (read full notes with memory_read):\n${fs.readFileSync(idx, 'utf8').slice(0, m.injectChars)}`
  },
  tools: ['memory_save', 'memory_search', 'memory_read', 'memory_delete'],
  save(dir, { title, content, tags = [] }) {
    const notes = path.join(dir, 'notes')
    fs.mkdirSync(notes, { recursive: true })
    const id = slug(title)
    const body = `---\ntitle: ${JSON.stringify(title)}\ntags: ${JSON.stringify(tags)}\nupdated: ${new Date().toISOString()}\n---\n\n${content}\n`
    fs.writeFileSync(path.join(notes, `${id}.md`), body)
    reindex(dir)
    return `saved note "${id}"`
  },
  entries(dir) {
    const notes = path.join(dir, 'notes')
    if (!fs.existsSync(notes)) return []
    return fs.readdirSync(notes).filter(f => f.endsWith('.md')).map(f => ({ id: f.slice(0, -3), text: fs.readFileSync(path.join(notes, f), 'utf8') }))
  },
}

function reindex(dir) {
  const lines = markdown.entries(dir).map(e => {
    const title = e.text.match(/^title: (.*)$/m)?.[1] ?? e.id
    const first = e.text.split('\n---\n')[1]?.trim().split('\n')[0]?.slice(0, 140) ?? ''
    return `- [${JSON.parse(title)}](notes/${e.id}.md): ${first}`
  })
  fs.writeFileSync(path.join(dir, 'MEMORY.md'), `${lines.join('\n')}\n`)
}

const journal = {
  context(dir, m) {
    const f = path.join(dir, 'journal.jsonl')
    if (!fs.existsSync(f)) return ''
    const rows = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).slice(-(m.journalEntries ?? 8)).map(l => JSON.parse(l))
    const text = rows.map(r => `### ${r.ts.slice(0, 16)} ${r.label ?? ''}\nTask: ${r.task.slice(0, 400)}\nOutcome: ${r.outcome.slice(0, 900)}`).join('\n\n')
    return `## Your recent work journal (most recent last)\n${text}`.slice(0, m.injectChars)
  },
  tools: ['memory_search'],
  append(dir, row) {
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'journal.jsonl'), `${JSON.stringify(row)}\n`)
  },
  entries(dir) {
    const f = path.join(dir, 'journal.jsonl')
    if (!fs.existsSync(f)) return []
    return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l, i) => {
      const r = JSON.parse(l)
      return { id: `journal-${i}`, text: `${r.ts} ${r.label ?? ''}\nTask: ${r.task}\nOutcome: ${r.outcome}` }
    })
  },
}

/** Open memory for one agent run. */
export function openMemory(home, def, { team } = {}) {
  const m = def.memory
  const mode = m.mode
  if (mode === 'none') return { mode, dir: null, context: '', toolDefs: [], handle: null, afterRun() {}, sessionId: null, saveSession() {} }
  const dir = memoryDir(home, def, team)
  fs.mkdirSync(dir, { recursive: true })
  const useMd = mode === 'markdown' || mode === 'hybrid'
  const useJournal = mode === 'journal' || mode === 'hybrid'

  const parts = []
  if (useMd) parts.push(markdown.context(dir, m))
  if (useJournal) parts.push(journal.context(dir, m))
  const toolNames = new Set([...(useMd ? markdown.tools : []), ...(useJournal ? journal.tools : [])])

  const allEntries = () => [...(useMd ? markdown.entries(dir) : []), ...(useJournal ? journal.entries(dir) : [])]
  const toolDefs = [
    { name: 'memory_save', description: 'Save or overwrite a durable memory note (facts, decisions, preferences, lessons) that future runs of you will see in the memory index.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['title', 'content'] } },
    { name: 'memory_search', description: 'Keyword search across your memory notes and work journal.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
    { name: 'memory_read', description: 'Read one memory note by id (the file name in the index without .md).', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'memory_delete', description: 'Delete an outdated or wrong memory note by id.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  ].filter(t => toolNames.has(t.name))

  const handle = (name, args) => {
    switch (name) {
      case 'memory_save': return markdown.save(dir, args)
      case 'memory_search': {
        const q = tokens(args.query)
        const hits = allEntries().map(e => ({ ...e, s: score(q, e.text) })).filter(e => e.s > 0).sort((a, b) => b.s - a.s).slice(0, args.limit ?? 6)
        return hits.length ? hits.map(h => `## ${h.id}\n${h.text.slice(0, 1500)}`).join('\n\n') : 'no matching memories'
      }
      case 'memory_read': {
        const f = path.join(dir, 'notes', `${slug(args.id)}.md`)
        return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : `no note "${args.id}"`
      }
      case 'memory_delete': {
        fs.rmSync(path.join(dir, 'notes', `${slug(args.id)}.md`), { force: true })
        reindex(dir)
        return `deleted "${args.id}"`
      }
    }
    throw new Error(`unknown memory tool ${name}`)
  }

  const sessionFile = path.join(dir, 'session.json')
  const sessionId = mode === 'session' && fs.existsSync(sessionFile) ? JSON.parse(fs.readFileSync(sessionFile, 'utf8')).sessionId : null

  return {
    mode,
    dir,
    context: parts.filter(Boolean).join('\n\n'),
    toolDefs,
    handle,
    sessionId,
    saveSession(id) { if (mode === 'session' && id) fs.writeFileSync(sessionFile, JSON.stringify({ sessionId: id, updated: new Date().toISOString() })) },
    afterRun({ task, outcome, label, runId, ok }) {
      if (useJournal && (m.autoJournal ?? true)) journal.append(dir, { ts: new Date().toISOString(), runId, label, ok, task: String(task).slice(0, 2000), outcome: String(outcome ?? '').slice(0, 4000) })
    },
  }
}

/** Everything stored in one agent's memory folder, for the chat Memory tab. Null when the agent has no memory. */
export function listMemory(home, def, { team } = {}) {
  const m = def.memory
  if (m.mode === 'none') return null
  const dir = memoryDir(home, def, team)
  const notes = markdown.entries(dir).map(e => {
    const [, fm = '', body = ''] = e.text.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/) ?? [null, '', e.text]
    const get = k => { const v = fm.match(new RegExp(`^${k}: (.*)$`, 'm'))?.[1]; try { return v ? JSON.parse(v) : undefined } catch { return v } }
    return { id: e.id, title: get('title') ?? e.id, tags: get('tags') ?? [], updated: get('updated') ?? null, body: body.trim() }
  }).sort((a, b) => String(b.updated ?? '').localeCompare(String(a.updated ?? '')))
  const jf = path.join(dir, 'journal.jsonl')
  const journalRows = fs.existsSync(jf) ? fs.readFileSync(jf, 'utf8').trim().split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)] } catch { return [] } }) : []
  const sf = path.join(dir, 'session.json')
  let session = null
  try { if (fs.existsSync(sf)) session = JSON.parse(fs.readFileSync(sf, 'utf8')) } catch {}
  return {
    dir, mode: m.mode, scope: m.namespace ? 'namespace' : m.scope, namespace: m.namespace,
    notes, journal: journalRows.slice(-60).reverse().map(r => ({ ts: r.ts, label: r.label, ok: r.ok, task: String(r.task ?? '').slice(0, 600), outcome: String(r.outcome ?? '').slice(0, 1500) })),
    journalCount: journalRows.length, session,
  }
}

/** Save or delete a markdown note in a memory folder (the caller checks the folder belongs to the chat). */
export function saveNote(dir, note) { return markdown.save(dir, note) }
export function deleteNote(dir, id) {
  fs.rmSync(path.join(dir, 'notes', `${slug(id)}.md`), { force: true })
  reindex(dir)
}
