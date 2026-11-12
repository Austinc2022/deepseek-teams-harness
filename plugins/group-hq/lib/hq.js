/**
 * Group headquarters: the store and the rules (docs/GROUP.md).
 *
 * Companies join with an invite code and then sync: each sync sends the company's snapshot (what its owner chose
 * to share) and the answers to earlier directives, and gets back the directives it has not seen and the policies
 * that apply to it. The company decides how much authority the headquarters has over it (observe, advise, direct);
 * the headquarters only sees that setting, it cannot change it.
 *
 * State: forge/group-hq/ (git-ignored)
 *   hq.json                    settings, invites (hashed), companies (key hashed), directives, policies
 *   companies/<id>/snapshot.json   the latest snapshot
 *   companies/<id>/history.jsonl   one KPI row per company at most every 30 minutes, for trends
 * Keys and invite codes are kept only as SHA-256 hashes.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const now = () => new Date().toISOString()
export const newId = (p = '') => p + crypto.randomBytes(5).toString('hex')
export const str = (v, max = 4000) => String(v ?? '').slice(0, max)
export const clip = (s, n = 6000) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n)}…` : s }
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex')
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y) }
const MIN = 60_000

const DEFAULTS = {
  name: 'Group headquarters',
  mission: '',
  listen: { enabled: false, host: '0.0.0.0', port: 3095, tls: { cert: '', key: '' } },
  policies: { maxDailyUsd: null, rules: [], note: '' },
  models: { model: 'claude-opus-5-5' },
  budget: { maxUsdPerDay: 30 },
  review: { enabled: true, everyDays: 7 },
  chief: { enabled: true, mayDirect: true },
}

export class HQ {
  constructor(home, { log = () => {} } = {}) {
    this.home = home
    this.dir = path.join(home, 'group-hq')
    this.file = path.join(this.dir, 'hq.json')
    this.log = log
    fs.mkdirSync(path.join(this.dir, 'companies'), { recursive: true })
  }

  // ---------------------------------------------------------------- state
  read() {
    let s
    try { s = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { s = {} }
    for (const [k, v] of Object.entries(DEFAULTS)) s[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...v, ...(s[k] ?? {}) } : (s[k] ?? v)
    s.listen.tls = { ...DEFAULTS.listen.tls, ...(s.listen.tls ?? {}) }
    s.policies.rules ??= []
    for (const k of ['invites', 'companies', 'directives', 'log']) s[k] ??= []
    s.days ??= {}
    return s
  }
  update(fn) {
    const s = this.read()
    const out = fn(s)
    s.updatedAt = now()
    const tmp = `${this.file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(s, null, 1), { mode: 0o600 })
    fs.renameSync(tmp, this.file)
    return out
  }
  #log(s, text) { s.log.push({ ts: now(), text: str(text, 400) }); s.log = s.log.slice(-200) }
  companyDir(id) { if (!/^g[0-9a-f]{10}$/.test(id)) throw new Error('bad company id'); const d = path.join(this.dir, 'companies', id); fs.mkdirSync(d, { recursive: true }); return d }
  snapshot(id) { try { return JSON.parse(fs.readFileSync(path.join(this.companyDir(id), 'snapshot.json'), 'utf8')) } catch { return null } }
  history(id, days = 30) {
    let rows = []
    try { rows = fs.readFileSync(path.join(this.companyDir(id), 'history.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) } catch {}
    const since = Date.now() - days * 24 * 60 * MIN
    return rows.filter(r => new Date(r.at).getTime() >= since)
  }
  spentToday(s = this.read()) { return s.days[new Date().toISOString().slice(0, 10)] ?? 0 }
  charge(usd, note) {
    if (!(usd > 0)) return
    const day = new Date().toISOString().slice(0, 10)
    this.update(s => { s.days[day] = Math.round(((s.days[day] ?? 0) + usd) * 10000) / 10000; this.#log(s, `model spend $${Math.round(usd * 100) / 100}: ${note}`) })
  }
  budgetHold() { const s = this.read(); return this.spentToday(s) >= s.budget.maxUsdPerDay ? `today's headquarters budget ($${s.budget.maxUsdPerDay}) is spent` : null }

  // ---------------------------------------------------------------- owner settings
  setSettings(patch = {}) {
    return this.update(s => {
      if (patch.name !== undefined) s.name = str(patch.name, 120).trim() || s.name
      if (patch.mission !== undefined) s.mission = str(patch.mission, 2000).trim()
      if (patch.listen) {
        if (typeof patch.listen.enabled === 'boolean') s.listen.enabled = patch.listen.enabled
        if (patch.listen.host !== undefined) { const h = str(patch.listen.host, 100).trim(); if (!/^[\w.:-]+$/.test(h)) throw new Error('bad listen address'); s.listen.host = h }
        if (patch.listen.port !== undefined) { const n = Number(patch.listen.port); if (!(Number.isInteger(n) && n > 0 && n < 65536)) throw new Error('bad port'); s.listen.port = n }
        if (patch.listen.tls) for (const k of ['cert', 'key']) if (patch.listen.tls[k] !== undefined) s.listen.tls[k] = str(patch.listen.tls[k], 500).trim()
      }
      if (patch.policies) s.policies = cleanPolicies(patch.policies, s.policies)
      if (patch.models?.model !== undefined) s.models.model = str(patch.models.model, 60).trim() || s.models.model
      if (patch.budget?.maxUsdPerDay !== undefined) { const n = Number(patch.budget.maxUsdPerDay); if (Number.isFinite(n) && n >= 0) s.budget.maxUsdPerDay = Math.min(10000, n) }
      if (patch.review) { if (typeof patch.review.enabled === 'boolean') s.review.enabled = patch.review.enabled; const n = Number(patch.review.everyDays); if (Number.isFinite(n) && n >= 1) s.review.everyDays = Math.min(60, n) }
      if (patch.chief) for (const k of ['enabled', 'mayDirect']) if (typeof patch.chief[k] === 'boolean') s.chief[k] = patch.chief[k]
      return publicSettings(s)
    })
  }

  // ---------------------------------------------------------------- invites
  /** A one-time invite code. Only its hash is kept: show the code to the owner once. */
  createInvite({ label, days = 7 } = {}) {
    const code = `${crypto.randomBytes(3).toString('hex')}-${crypto.randomBytes(3).toString('hex')}-${crypto.randomBytes(3).toString('hex')}-${crypto.randomBytes(3).toString('hex')}`.toUpperCase()
    const d = Math.min(90, Math.max(1, Number(days) || 7))
    const inv = { id: newId('i'), label: str(label, 120).trim() || 'company', codeHash: sha(code), createdAt: now(), expiresAt: new Date(Date.now() + d * 24 * 60 * MIN).toISOString() }
    this.update(s => { s.invites.push(inv); s.invites = s.invites.slice(-200); this.#log(s, `invite created for "${inv.label}" (expires ${inv.expiresAt.slice(0, 10)})`) })
    return { ...publicInvite(inv), code }
  }
  revokeInvite(id) { return this.update(s => { const i = s.invites.find(x => x.id === id); if (!i) throw new Error('no such invite'); i.revoked = now(); return publicInvite(i) }) }

  // ---------------------------------------------------------------- the company API (listener.js)
  join({ code, company } = {}, ip) {
    const h = sha(str(code, 200).trim().toUpperCase())
    const key = crypto.randomBytes(32).toString('hex')
    const id = newId('g')
    const out = this.update(s => {
      const inv = s.invites.find(x => same(x.codeHash, h))
      if (!inv || inv.revoked || inv.usedBy || new Date(inv.expiresAt) < new Date()) throw httpError(403, 'this invite code is not valid (used, expired, revoked or mistyped)')
      inv.usedBy = id; inv.usedAt = now()
      const c = company ?? {}
      s.companies.push({
        id, name: str(c.name, 80).trim() || inv.label, label: str(c.label, 120), profile: str(c.profile, 40), mission: str(c.mission, 1500),
        authority: ['observe', 'advise', 'direct'].includes(c.authority) ? c.authority : 'advise', share: typeof c.share === 'object' ? c.share : {},
        keyHash: sha(key), joinedAt: now(), lastSeenAt: now(), lastIp: str(ip, 60), invite: inv.id, status: 'active', policies: {},
      })
      this.#log(s, `company "${str(c.name, 80) || inv.label}" joined (invite ${inv.label})`)
      return { companyId: id, key, hq: { name: s.name, mission: s.mission }, policies: effectivePolicies(s, s.companies.at(-1)) }
    })
    this.onChange?.({ type: 'joined', company: id })
    return out
  }

  /** Who is calling: the company for a valid "Bearer <id>.<key>", or an error. */
  authenticate(header) {
    const m = String(header ?? '').match(/^Bearer (g[0-9a-f]{10})\.([0-9a-f]{64})$/)
    if (!m) throw httpError(401, 'missing or malformed key')
    const c = this.read().companies.find(x => x.id === m[1])
    if (!c || !same(c.keyHash, sha(m[2]))) throw httpError(401, 'unknown company or wrong key')
    if (c.status === 'removed') throw httpError(403, 'this company was removed from the group')
    return c
  }

  sync(company, { snapshot, responses = [], known = [] } = {}, ip) {
    const snap = snapshot && typeof snapshot === 'object' ? snapshot : null
    if (snap) {
      const dir = this.companyDir(company.id)
      fs.writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify({ ...snap, receivedAt: now() }))
      const hist = path.join(dir, 'history.jsonl')
      let last = 0
      try { const t = fs.readFileSync(hist, 'utf8').trim().split('\n').at(-1); last = t ? new Date(JSON.parse(t).at).getTime() : 0 } catch {}
      if (Date.now() - last >= 30 * MIN) fs.appendFileSync(hist, JSON.stringify({ at: now(), kpis: snap.kpis ?? null, spentTodayUsd: snap.budget?.spentTodayUsd ?? null, percent: snap.progress?.percent ?? null, advisory: snap.advisory?.latest?.overall ?? null, health: snap.health?.status ?? null }) + '\n')
    }
    const knownSet = new Set((Array.isArray(known) ? known : []).map(String))
    let changed = []
    const out = this.update(s => {
      const c = s.companies.find(x => x.id === company.id)
      c.lastSeenAt = now(); c.lastIp = str(ip, 60)
      if (snap) {
        c.name = str(snap.company?.name, 80).trim() || c.name
        c.label = str(snap.company?.label, 120) || c.label
        c.mission = str(snap.company?.mission, 1500) || c.mission
        if (['observe', 'advise', 'direct'].includes(snap.authority) && snap.authority !== c.authority) { this.#log(s, `${c.name} changed the headquarters' authority from ${c.authority} to ${snap.authority}`); c.authority = snap.authority }
        if (snap.share) c.share = snap.share
      }
      for (const r of Array.isArray(responses) ? responses.slice(0, 200) : []) {
        const d = s.directives.find(x => x.id === String(r.id) && x.company === c.id)
        if (!d) continue
        const st = ['accepted', 'declined', 'done', 'blocked', 'ignored', 'closed'].includes(r.status) ? r.status : null
        if (!st) continue
        d.status = st
        d.response = { status: st, note: str(r.note, 2000), by: str(r.by, 80), ts: str(r.ts, 40) || now() }
        changed.push(d)
      }
      for (const d of s.directives) if (d.company === c.id && knownSet.has(d.id) && d.status === 'pending') { d.status = 'delivered'; d.deliveredAt = now() }
      const pending = c.status === 'suspended' ? [] : s.directives.filter(d => d.company === c.id && d.status === 'pending').slice(0, 50)
      return {
        directives: pending.map(d => ({ id: d.id, kind: d.kind, text: d.text, from: d.from, ts: d.ts })),
        policies: effectivePolicies(s, c), hq: { name: s.name, mission: s.mission }, suspended: c.status === 'suspended',
      }
    })
    if (changed.length) this.onChange?.({ type: 'responses', company: company.id, directives: changed.map(d => d.id) })
    return out
  }

  leave(company) {
    this.update(s => { const c = s.companies.find(x => x.id === company.id); c.status = 'left'; c.leftAt = now(); c.keyHash = sha(crypto.randomBytes(16)); for (const d of s.directives) if (d.company === c.id && ['pending', 'delivered', 'accepted'].includes(d.status)) d.status = 'closed'; this.#log(s, `company "${c.name}" left the group`) })
    return { ok: true }
  }

  // ---------------------------------------------------------------- owner and group CEO actions
  /** Send a directive, advice or question to one company or to all active ones. */
  direct({ company, kind = 'directive', text, from = 'owner' } = {}) {
    const t = str(text, 6000).trim()
    if (t.length < 10) throw new Error('write what the company should do (10+ characters)')
    if (!['directive', 'advice', 'question'].includes(kind)) throw new Error('kind is directive, advice or question')
    return this.update(s => {
      const targets = company === 'all' ? s.companies.filter(c => c.status === 'active') : s.companies.filter(c => c.id === company && c.status !== 'removed' && c.status !== 'left')
      if (!targets.length) throw new Error('no such active company')
      const made = targets.map(c => ({ id: newId('d'), company: c.id, kind, text: t, from: str(from, 80), ts: now(), status: 'pending', authorityAtSend: c.authority }))
      s.directives.push(...made)
      s.directives = s.directives.slice(-2000)
      this.#log(s, `${from} sent a ${kind} to ${targets.map(c => c.name).join(', ')}`)
      return made
    })
  }
  cancelDirective(id) { return this.update(s => { const d = s.directives.find(x => x.id === id); if (!d) throw new Error('no such directive'); if (d.status !== 'pending') throw new Error('only a directive the company has not received yet can be cancelled'); d.status = 'cancelled'; return d }) }

  setCompany(id, patch = {}) {
    return this.update(s => {
      const c = s.companies.find(x => x.id === id)
      if (!c) throw new Error('no such company')
      if (patch.policies) c.policies = cleanPolicies(patch.policies, c.policies ?? {})
      if (patch.status !== undefined) { if (!['active', 'suspended'].includes(patch.status) || !['active', 'suspended'].includes(c.status)) throw new Error('status is active or suspended'); c.status = patch.status; this.#log(s, `${c.name} ${patch.status === 'suspended' ? 'suspended' : 'reactivated'}`) }
      if (patch.note !== undefined) c.note = str(patch.note, 1000)
      return publicCompany(c)
    })
  }
  removeCompany(id) {
    return this.update(s => { const c = s.companies.find(x => x.id === id); if (!c) throw new Error('no such company'); c.status = 'removed'; c.removedAt = now(); c.keyHash = sha(crypto.randomBytes(16)); this.#log(s, `${c.name} removed from the group`); return publicCompany(c) })
  }

  // ---------------------------------------------------------------- views
  online(c) { return c.status === 'active' && Date.now() - new Date(c.lastSeenAt).getTime() < 20 * MIN }
  companies() {
    const s = this.read()
    return s.companies.filter(c => c.status !== 'removed').map(c => {
      const snap = this.snapshot(c.id)
      return {
        ...publicCompany(c), online: this.online(c), policies: effectivePolicies(s, c),
        summary: snap ? {
          receivedAt: snap.receivedAt, status: snap.status ?? null, kpis: snap.kpis ?? null, budget: snap.budget ? { dailyUsd: snap.budget.dailyUsd, spentTodayUsd: snap.budget.spentTodayUsd, metering: snap.budget.metering } : null,
          progress: snap.progress ? { percent: snap.progress.percent, money: snap.progress.money } : null, health: snap.health ?? null,
          advisory: snap.advisory ? { latest: snap.advisory.latest ? { overall: snap.advisory.latest.overall, at: snap.advisory.latest.at } : null, stats: snap.advisory.stats } : null,
          northStar: snap.company?.northStar ?? null,
        } : null,
        directives: { open: s.directives.filter(d => d.company === c.id && ['pending', 'delivered', 'accepted'].includes(d.status)).length, blocked: s.directives.filter(d => d.company === c.id && d.status === 'blocked').length },
      }
    })
  }
  company(id) {
    const s = this.read()
    const c = s.companies.find(x => x.id === id)
    if (!c) throw new Error('no such company')
    return { ...publicCompany(c), online: this.online(c), policies: effectivePolicies(s, c), ownPolicies: c.policies ?? {}, snapshot: this.snapshot(id), history: this.history(id), directives: s.directives.filter(d => d.company === id).slice(-100).reverse() }
  }
  portfolio() {
    const list = this.companies().filter(c => c.status === 'active' || c.status === 'suspended')
    const num = f => list.map(f).filter(v => typeof v === 'number')
    const sum = xs => Math.round(xs.reduce((n, x) => n + x, 0) * 100) / 100
    const avg = xs => (xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : null)
    return {
      companies: list.length, online: list.filter(c => c.online).length,
      spentTodayUsd: sum(num(c => c.summary?.budget?.spentTodayUsd)), dailyBudgetUsd: sum(num(c => c.summary?.budget?.dailyUsd)),
      spend7dUsd: sum(num(c => c.summary?.kpis?.spend7dUsd)), delivered7d: sum(num(c => c.summary?.kpis?.delivered7d)),
      avgScore: avg(num(c => c.summary?.kpis?.companyScore)), avgAdvisory: avg(num(c => c.summary?.advisory?.latest?.overall)), avgGoal: avg(num(c => c.summary?.progress?.percent)),
      healthFails: list.filter(c => c.summary?.health?.status === 'fail').length,
      openDirectives: sum(list.map(c => c.directives.open)), blockedDirectives: sum(list.map(c => c.directives.blocked)),
      escalations: sum(num(c => c.summary?.advisory?.stats?.escalated)),
    }
  }
  overview() {
    const s = this.read()
    return {
      settings: publicSettings(s), spentTodayUsd: this.spentToday(s), budgetHold: this.budgetHold(),
      portfolio: this.portfolio(), companies: this.companies(),
      directives: s.directives.slice(-150).reverse().map(d => ({ ...d, companyName: s.companies.find(c => c.id === d.company)?.name ?? d.company })),
      invites: s.invites.slice().reverse().map(publicInvite), log: s.log.slice().reverse().slice(0, 80),
      listener: this.listenerState ?? null,
    }
  }
}

// ---------------------------------------------------------------- helpers
export function httpError(status, message) { const e = new Error(message); e.status = status; return e }
function cleanPolicies(p, prev = {}) {
  const out = { ...prev }
  if (p.maxDailyUsd !== undefined) { const n = p.maxDailyUsd === null || p.maxDailyUsd === '' ? null : Number(p.maxDailyUsd); if (n !== null && !(Number.isFinite(n) && n >= 0)) throw new Error('maxDailyUsd must be a number of dollars, or empty'); out.maxDailyUsd = n }
  if (Array.isArray(p.rules)) out.rules = p.rules.map(r => str(r, 600).trim()).filter(Boolean).slice(0, 30)
  if (p.note !== undefined) out.note = str(p.note, 1000)
  return out
}
/** Group policies merged with a company's own: the lower spend cap wins, rules add up. */
export function effectivePolicies(s, c) {
  const g = s.policies ?? {}, o = c?.policies ?? {}
  const caps = [g.maxDailyUsd, o.maxDailyUsd].filter(v => typeof v === 'number')
  return { maxDailyUsd: caps.length ? Math.min(...caps) : null, rules: [...(g.rules ?? []), ...(o.rules ?? [])], note: [g.note, o.note].filter(Boolean).join(' ') }
}
const publicInvite = i => ({ id: i.id, label: i.label, createdAt: i.createdAt, expiresAt: i.expiresAt, usedBy: i.usedBy ?? null, usedAt: i.usedAt ?? null, revoked: i.revoked ?? null, status: i.revoked ? 'revoked' : i.usedBy ? 'used' : new Date(i.expiresAt) < new Date() ? 'expired' : 'open' })
const publicCompany = c => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'keyHash'))
const publicSettings = s => ({ name: s.name, mission: s.mission, listen: s.listen, policies: s.policies, models: s.models, budget: s.budget, review: s.review, chief: s.chief })
