/**
 * Knowledge and memory API under /api/super/knowledge/ (both servers): the fact store, its history and status,
 * what each run was shown, the organisation as definitions and purpose memories, dreaming, and the owner's
 * corrections (an owner flag decides at once and flags everything derived from the fact).
 */
import fs from 'node:fs'
import path from 'node:path'
import { kb, AREA } from '../../company/lib/knowledge-hooks.js'
import { listInstances, instanceFiles, agentKind, memoryDir, rankedNotes, journalRows } from '../../agent-forge/lib/memory.js'
import { profile as P } from '../../company/lib/profile.js'
import { today } from './store.js'

const num = (v, d, hi = 500) => Math.min(hi, Math.max(1, Number(v) || d))

export async function handleKnowledge(sa, method, p, body, query) {
  const K = kb()
  const home = sa.forge.registry.home
  let r
  if (method === 'GET' && p === '/api/super/knowledge/stats') {
    const st = sa.memory?.settings ?? {}
    const rel = K.db.prepare("SELECT k, v FROM kv WHERE k LIKE 'reliability-stats:%'").all().map(x => ({ by: x.k.slice(18), ...JSON.parse(x.v), factor: Number(K.kv(`reliability:${x.k.slice(18)}`) ?? 1) })).sort((a, b) => a.factor - b.factor)
    return { ...K.stats(), area: AREA, dream: { settings: st, last: Number(K.kv('dream:last') ?? 0) || null, spentTodayUsd: Number(K.kv(`dream:usd:${today()}`) ?? 0), running: !!sa.memory?.running }, reliability: rel, instances: listInstances(home).length }
  }
  if (method === 'GET' && p === '/api/super/knowledge/facts') {
    const q = query.get('q')
    const status = query.get('status') || undefined
    const kind = query.get('kind') || undefined
    const purpose = query.get('purpose') || undefined
    if (q) return K.search(q, { statuses: status ? [status] : undefined, purpose, kinds: kind ? [kind] : undefined, limit: num(query.get('limit'), 40, 200) })
    return K.list({ status, kind, purpose, limit: num(query.get('limit'), 80), offset: Number(query.get('offset')) || 0 })
  }
  if ((r = p.match(/^\/api\/super\/knowledge\/facts\/(f[0-9a-f]{10})$/)) && method === 'GET') return K.get(r[1]) ?? undefined
  if ((r = p.match(/^\/api\/super\/knowledge\/facts\/(f[0-9a-f]{10})\/(wrong|outdated|confirm)$/)) && method === 'POST') {
    const b = await body()
    const note = String(b.note ?? '').trim()
    if (r[2] === 'confirm') { K.verify(r[1], { by: 'owner', note: note || 'confirmed by the owner' }); return { ok: true } }
    return K.flag(r[1], { owner: true, wrong: r[2] === 'wrong', note: note || `marked ${r[2]} by the owner` })
  }
  if (method === 'GET' && p === '/api/super/knowledge/attention') {
    return { quarantined: K.list({ status: 'quarantined', limit: 60 }), conflict: K.list({ status: 'conflict', limit: 60 }), suspect: K.list({ status: 'suspect', limit: 60 }), stale: K.list({ status: 'stale', limit: 60 }), due: K.due(20) }
  }
  if (method === 'GET' && p === '/api/super/knowledge/page') return K.page(AREA) ?? { area: AREA, title: null, body: null }
  if ((r = p.match(/^\/api\/super\/knowledge\/runs\/([\w-]{6,40})\/context$/)) && method === 'GET') return K.contextOf(r[1])
  if (method === 'GET' && p === '/api/super/knowledge/dreams') {
    const f = path.join(path.dirname(K.file), 'dream-log.jsonl')
    let rows = []
    try { rows = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).slice(-30).map(l => JSON.parse(l)).reverse() } catch {}
    return rows
  }
  if (method === 'POST' && p === '/api/super/knowledge/dream') return sa.store.command({ type: 'dream-now' })
  if (method === 'GET' && p === '/api/super/knowledge/org') {
    const { registry } = sa.forge
    const insts = listInstances(home)
    const agents = registry.listAgents().filter(a => !a.invalid && P.isOurs(a.name)).map(a => {
      const kind = agentKind(a)
      const base = kind === 'stateful' && a.memory.mode !== 'none' ? memoryDir(home, a, undefined) : null
      return {
        name: a.name, title: a.title ?? null, description: a.description, model: a.model, kind, clonedFrom: a.clonedFrom ?? null, hired: (a.tags ?? []).includes('hired'),
        memory: kind === 'stateful' ? { mode: a.memory.mode, scope: a.memory.scope, roleNotes: base ? rankedNotes(base).length : 0, journal: base ? journalRows(base).length : 0 } : { mode: 'none', why: kind === 'judge' ? 'judge: independent, measured facts only' : kind === 'builder' ? 'builder: its state is the ticket folder' : kind },
        instances: insts.filter(i => i.agent === a.name && !i.owner.startsWith('team-')).map(i => ({ purpose: i.purpose, slug: i.slug, status: i.status, runs: i.runs, lastUsedAt: i.lastUsedAt, createdAt: i.createdAt, fresh: i.fresh, forkedFrom: i.forkedFrom, reason: i.reason, hasSummary: i.hasSummary, notes: i.notes, dir: i.dir })),
      }
    })
    const teams = registry.listTeams().filter(t => P.isOurs(t.name)).map(t => ({ name: t.name, description: t.description, members: t.members, instances: insts.filter(i => i.owner === `team-${t.name}`).map(i => ({ purpose: i.purpose, slug: i.slug, status: i.status, runs: i.runs, lastUsedAt: i.lastUsedAt, hasSummary: i.hasSummary, dir: i.dir })) }))
    return { agents, teams }
  }
  if (method === 'GET' && p === '/api/super/knowledge/instance') {
    const dir = path.resolve(String(query.get('dir') ?? ''))
    const root = path.join(home, 'memory', 'instances') + path.sep
    if (!dir.startsWith(root)) throw new Error('not a purpose memory folder')
    const f = instanceFiles(dir)
    return { ...f, journal: f.journal.slice(-30).reverse().map(j => ({ ts: j.ts, label: j.label, ok: j.ok, runId: j.runId, task: String(j.task ?? '').slice(0, 600), outcome: String(j.outcome ?? '').slice(0, 1500) })) }
  }
  return undefined
}
