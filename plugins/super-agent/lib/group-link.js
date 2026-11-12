/**
 * Group link: this company's connection to a group headquarters (plugins/group-hq), which may run on another
 * computer (docs/GROUP.md).
 *
 * The company always calls out; the headquarters never connects in, so the company needs no open port and works
 * behind NAT. Every few minutes it sends a snapshot (what the owner chose to share) and receives the
 * headquarters' directives and group policies in the reply.
 *
 * The company owner decides, on the company's own page, how much the headquarters may do (authority):
 *   observe   the headquarters sees the snapshot; its directives are not acted on and its policies are not applied
 *   advise    directives reach the CEO as advice: it may accept or decline with a reason; policies are guidance
 *   direct    directives reach the CEO as instructions it must carry out (or report blocked, with the reason, which
 *             goes to the owner); the group's daily spend cap is enforced and its rules bind the leaders
 * Owner-only matters (real money, publishing, credentials, the charter) stay with this company's owner whatever the
 * authority is.
 *
 * State: forge/company/group.json; the key the headquarters issued: forge/company/group-secret.json (mode 600).
 */
import fs from 'node:fs'
import path from 'node:path'
import { profile as P } from '../../company/lib/profile.js'
import { now, newId, str, clip } from './store.js'
import { progress } from './views.js'

export const AUTHORITIES = ['observe', 'advise', 'direct']
export const SHARE_KEYS = {
  kpis: 'KPIs, budget and spend, goal progress',
  plans: 'the plans of the leaders',
  initiatives: 'initiatives and gate results',
  org: 'the organisation and unit scores',
  advisory: 'advisory reviews and how the CEO answered them',
  health: 'health checks',
  feed: 'the owner\'s feed (messages from the leaders)',
}
const DEFAULT_SHARE = { kpis: true, plans: true, initiatives: true, org: true, advisory: true, health: true, feed: false }
const MAX_SNAPSHOT = 400_000

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
function writeJson(f, v, mode) { const tmp = `${f}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(v, null, 1), mode ? { mode } : undefined); fs.renameSync(tmp, f) }

/** A headquarters URL: http(s), no credentials, no query. Returns the normalized base (no trailing slash). */
export function hqUrl(u) {
  let x
  try { x = new URL(String(u ?? '').trim()) } catch { throw new Error('the headquarters address must be a URL such as https://hq.example.com:3095') }
  if (!['http:', 'https:'].includes(x.protocol)) throw new Error('the headquarters address must start with http:// or https://')
  if (x.username || x.password) throw new Error('put no user name or password in the address; use the invite code')
  return `${x.protocol}//${x.host}${x.pathname.replace(/\/+$/, '')}`
}
/** Plain http is fine on this machine and private networks (LAN, Tailscale); elsewhere the key would travel in clear. */
export function insecure(u) {
  const x = new URL(u)
  if (x.protocol === 'https:') return false
  const h = x.hostname
  return !(h === 'localhost' || h === '127.0.0.1' || h === '::1' || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h) || h.endsWith('.local') || h.endsWith('.ts.net'))
}

export class GroupLink {
  constructor(sa) {
    this.sa = sa
    this.file = path.join(sa.co.dir, 'group.json')
    this.secretFile = path.join(sa.co.dir, 'group-secret.json')
    this.syncing = false
  }

  read() {
    const g = readJson(this.file, {})
    g.share = { ...DEFAULT_SHARE, ...(g.share ?? {}) }
    g.authority = AUTHORITIES.includes(g.authority) ? g.authority : 'advise'
    g.everyMinutes = Math.min(120, Math.max(1, Number(g.everyMinutes) || 5))
    g.directives ??= []
    g.policies ??= {}
    g.log ??= []
    return g
  }
  update(fn) { const g = this.read(); const out = fn(g); g.updatedAt = now(); writeJson(this.file, g); return out }
  secret() { return readJson(this.secretFile, null)?.key ?? null }
  joined() { const g = this.read(); return !!(g.hq?.url && g.companyId && this.secret()) }
  #log(g, text) { g.log.push({ ts: now(), text: str(text, 400) }); g.log = g.log.slice(-60) }

  async #call(url, route, body, { auth = true, timeoutMs = 20_000 } = {}) {
    const g = this.read()
    const headers = { 'content-type': 'application/json', 'user-agent': 'dsh-company-link/1' }
    if (auth) headers.authorization = `Bearer ${g.companyId}.${this.secret()}`
    const r = await fetch(`${url}/v1/${route}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
    let j = null
    try { j = await r.json() } catch {}
    if (!r.ok) throw new Error(j?.error ?? `the headquarters answered ${r.status}`)
    return j ?? {}
  }

  // ---------------------------------------------------------------- owner actions (web UI)
  async join({ url, code, authority = 'advise', share = {}, name } = {}) {
    if (this.joined()) throw new Error(`already joined ${this.read().hq.name ?? this.read().hq.url}; leave it first`)
    const base = hqUrl(url)
    const inv = str(code, 200).trim()
    if (inv.length < 8) throw new Error('paste the invite code from the headquarters')
    if (!AUTHORITIES.includes(authority)) throw new Error(`authority is one of ${AUTHORITIES.join(', ')}`)
    const c = this.sa.co.read()
    const companyName = str(name, 80).trim() || P.label
    const j = await this.#call(base, 'join', { code: inv, company: { name: companyName, profile: P.id, label: P.label, mission: clip(c.charter.mission, 1500), authority, share: { ...DEFAULT_SHARE, ...share } } }, { auth: false })
    if (!j.companyId || !j.key) throw new Error('the headquarters did not return a company id and key')
    writeJson(this.secretFile, { key: j.key, issuedAt: now() }, 0o600)
    this.update(g => {
      g.hq = { url: base, name: str(j.hq?.name, 120), mission: str(j.hq?.mission, 1500) }
      g.companyId = String(j.companyId)
      g.name = companyName
      g.joinedAt = now()
      g.authority = authority
      g.share = { ...DEFAULT_SHARE, ...Object.fromEntries(Object.entries(share).filter(([k]) => k in SHARE_KEYS).map(([k, v]) => [k, v === true])) }
      g.policies = j.policies ?? {}
      g.lastError = null
      this.#log(g, `joined ${g.hq.name || base} with authority ${authority}`)
      g.notices = [...(g.notices ?? []), `This company joined the group headquarters "${j.hq?.name || base}" (authority: ${authority}).`]
      g.tellPolicies = true
      g.syncNow = true
    })
    return this.view()
  }

  setSettings(patch = {}) {
    const before = this.read().authority
    this.update(x => {
      if (patch.authority !== undefined) { if (!AUTHORITIES.includes(patch.authority)) throw new Error(`authority is one of ${AUTHORITIES.join(', ')}`); x.authority = patch.authority }
      if (patch.share) for (const k of Object.keys(SHARE_KEYS)) if (typeof patch.share[k] === 'boolean') x.share[k] = patch.share[k]
      if (patch.everyMinutes !== undefined) x.everyMinutes = Math.min(120, Math.max(1, Number(patch.everyMinutes) || 5))
      if (patch.authority && patch.authority !== before) {
        this.#log(x, `authority changed from ${before} to ${patch.authority}`)
        x.notices = [...(x.notices ?? []), `The headquarters' authority over this company is now "${patch.authority}".`]
        x.tellPolicies = true
      }
      x.syncNow = true
      return x
    })
    return this.view()
  }

  async leave() {
    const g = this.read()
    if (!g.hq?.url) throw new Error('this company has not joined a headquarters')
    let note = ''
    try { if (this.secret()) await this.#call(g.hq.url, 'leave', { companyId: g.companyId }) } catch (e) { note = ` (the headquarters could not be told: ${e.message})` }
    fs.rmSync(this.secretFile, { force: true })
    this.update(x => { this.#log(x, `left ${x.hq?.name || x.hq?.url}${note}`); x.left = { hq: x.hq, at: now() }; delete x.hq; delete x.companyId; x.policies = {}; for (const d of x.directives) if (['new', 'accepted'].includes(d.status)) { d.status = 'closed'; d.note = 'the company left the headquarters' } x.notices = [...(x.notices ?? []), `This company left the group headquarters${note}.`] })
    return this.view()
  }

  /** The owner answers a directive by hand (also used when the CEO is not running). */
  ownerRespond(id, { status, note } = {}) {
    if (!['accepted', 'declined', 'done', 'blocked'].includes(status)) throw new Error('status is accepted, declined, done or blocked')
    return this.update(g => {
      const d = g.directives.find(x => x.id === id)
      if (!d) throw new Error('no such directive')
      d.status = status; d.note = str(note, 1500); d.by = 'owner'; d.respondedAt = now(); d.sent = false
      g.syncNow = true
      return d
    })
  }

  // ---------------------------------------------------------------- the CEO answers (respond_hq)
  respond(me, a) {
    const g = this.read()
    const status = { accept: 'accepted', decline: 'declined', done: 'done', blocked: 'blocked' }[String(a.decision)]
    if (!status) throw new Error('decision is accept, decline, done or blocked')
    const note = str(a.note, 2000).trim()
    if (status !== 'accepted' && note.length < 15) throw new Error('say what was done, or why (15+ characters)')
    if (status === 'declined' && g.authority === 'direct') throw new Error('the headquarters has authority to direct this company: carry it out, or report blocked with the reason (the owner is told)')
    const d = this.update(x => {
      const y = x.directives.find(z => z.id === String(a.id))
      if (!y) throw new Error(`no directive ${a.id}`)
      if (['done', 'closed', 'ignored'].includes(y.status)) throw new Error(`directive ${y.id} is already ${y.status}`)
      y.status = status; y.note = note; y.by = me.id; y.respondedAt = now(); y.sent = false
      return y
    })
    if (status === 'blocked' || status === 'declined') this.sa.say({ from: me.id, kind: 'group', question: status === 'blocked' && g.authority === 'direct', text: `Headquarters directive ${status}: "${clip(d.text, 200)}". ${note}` })
    this.syncAt = 0
    return `Recorded: directive ${d.id} ${status}. The headquarters sees it at the next sync.`
  }

  // ---------------------------------------------------------------- what is shared
  snapshot() {
    const g = this.read()
    const sa = this.sa
    const s = sa.store.read()
    const c = sa.co.read()
    const out = {
      at: now(), company: { name: g.name ?? P.label, profile: P.id, label: P.label, mission: clip(c.charter.mission, 1500), northStar: clip(P.northStarText(c.charter), 200) },
      authority: g.authority, share: g.share,
      status: { loop: !!sa.store.holder(), hold: sa.holdReason ?? null, paused: fs.existsSync(path.join(sa.co.dir, 'PAUSED')), autopilot: c.charter.autopilot.enabled, proactive: s.enabled },
    }
    const safe = f => { try { return f() } catch (e) { return { error: e.message } } }
    if (g.share.kpis) {
      out.kpis = safe(() => sa.advisory.kpis())
      out.budget = safe(() => { const b = sa.co.budget(); return { dailyUsd: b.dailyUsd, spentTodayUsd: b.spentTodayUsd, metering: sa.co.metering, days: Object.keys(c.days).sort().slice(-30).map(k => ({ date: k, usd: c.days[k].modelUsd ?? 0 })) } })
      out.progress = safe(() => { const p = progress(sa); return { percent: p.percent ?? null, done: p.done ?? null, total: p.total ?? null, steps: (p.steps ?? []).map(x => ({ title: clip(x.title, 120), done: !!x.done })), money: { label: p.money.label, perDayUsd: p.money.paperProfitPerDayUsd, targetDailyUsd: p.money.targetDailyUsd, totalUsd: p.money.paperProfitUsd } } })
    }
    if (g.share.plans) out.plans = s.agents.map(a => ({ id: a.id, title: a.title ?? a.id, kind: a.kind ?? null, focus: clip(a.plan?.focus, 600), outcome: clip(a.plan?.outcome, 400), expectedBy: a.plan?.expectedBy ?? null, pctComplete: a.plan?.pctComplete ?? null, blockers: (a.plan?.blockers ?? []).slice(0, 5).map(x => clip(x, 200)), updatedAt: a.plan?.updatedAt ?? null }))
    if (g.share.initiatives) {
      out.initiatives = c.initiatives.slice(-60).map(i => ({ id: i.id, title: clip(i.title, 160), stage: i.stage, confidence: i.confidence ?? null, department: i.department }))
      out.gate = c.orders.slice(-15).map(o => ({ ts: o.ts, proposal: clip(o.proposal, 120), status: o.status, book: o.book ?? null }))
      out.tickets = { open: s.tickets.filter(t => t.status === 'open').length, recent: s.tickets.slice(-15).reverse().map(t => ({ title: clip(t.title, 120), status: t.status, outcome: t.outcome ?? null, endedAt: t.endedAt ?? null })) }
    }
    if (g.share.org) out.org = safe(() => {
      const { units } = sa.perf.scores()
      return { departments: c.departments.map(d => ({ name: d.name, lead: d.lead, teams: d.teams })), superAgents: s.agents.length, agents: sa.forge.registry.listAgents().filter(x => !x.invalid && P.isOurs(x.name)).length, superTeams: sa.co.supers.list().length, units: Object.values(units).filter(u => ['Super agent', 'COO', 'Department'].includes(u.type)).map(u => ({ name: u.name, type: u.type, score: u.score, trend: u.trend })) }
    })
    if (g.share.advisory) out.advisory = safe(() => {
      const v = sa.advisory.view()
      return { latest: v.latest ? { at: v.latest.endedAt, overall: v.latest.overall, summary: clip(v.latest.summary, 2000), scorecard: v.latest.scorecard } : null, stats: v.stats, recs: v.recs.slice(0, 30).map(r => ({ id: r.id, title: clip(r.title, 200), severity: r.severity, status: r.status, kpi: r.kpi, response: r.response ? { decision: r.response.decision, reason: clip(r.response.reason, 400) } : null, escalated: !!r.escalatedAt, followUp: r.followUps?.at(-1)?.verdict ?? null })) }
    })
    if (g.share.health) out.health = safe(() => { const h = sa.health.view(); return { status: h.status, fail: h.fail, warn: h.warn, failing: h.checks.filter(x => x.status !== 'ok').map(x => `${x.name}: ${x.status}`).slice(0, 10) } })
    if (g.share.feed) out.feed = s.feed.slice(-25).reverse().map(m => ({ ts: m.ts, from: m.from, text: clip(m.text, 400) }))
    let text = JSON.stringify(out)
    if (text.length > MAX_SNAPSHOT) { delete out.feed; delete out.initiatives; out.truncated = true; text = JSON.stringify(out) }
    return out
  }

  // ---------------------------------------------------------------- sync (the loop process only)
  async tick() {
    const pending = this.read()
    if (pending.notices?.length || pending.tellPolicies || pending.syncNow) {
      const g = this.update(x => { const out = { notices: x.notices ?? [], tell: !!x.tellPolicies, sync: !!x.syncNow }; delete x.notices; delete x.tellPolicies; delete x.syncNow; return { ...x, ...out } })
      for (const n of g.notices) this.sa.say({ from: 'system', kind: 'group', text: n })
      if (g.tell && this.joined()) this.#tellPolicies(this.read(), true)
      if (g.sync) this.syncAt = 0
    }
    if (!this.joined() || this.syncing) return
    if (Date.now() - (this.syncAt ?? 0) < pending.everyMinutes * 60_000) return
    await this.sync().catch(() => {})
  }

  async sync() {
    if (this.syncing) return null
    this.syncing = true
    this.syncAt = Date.now()
    try {
      const g = this.read()
      if (!g.hq?.url) throw new Error('not joined')
      const responses = g.directives.filter(d => d.sent === false).map(d => ({ id: d.id, status: d.status, note: d.note ?? '', by: d.by ?? null, ts: d.respondedAt ?? now() }))
      // known: the directives already here, so one lost in transit is sent again
      const j = await this.#call(g.hq.url, 'sync', { snapshot: this.snapshot(), responses, known: g.directives.map(d => d.id).slice(-200) })
      const fresh = []
      const next = this.update(x => {
        for (const r of responses) { const d = x.directives.find(y => y.id === r.id); if (d && d.respondedAt === r.ts) d.sent = true }
        const prevPolicies = JSON.stringify(x.policies ?? {})
        x.policies = j.policies ?? {}
        x.policiesChanged = prevPolicies !== JSON.stringify(x.policies)
        if (j.hq?.name) x.hq.name = str(j.hq.name, 120)
        for (const d of j.directives ?? []) {
          if (!d?.id || x.directives.some(y => y.id === d.id)) continue
          const rec = { id: String(d.id).slice(0, 40), kind: ['directive', 'advice', 'question'].includes(d.kind) ? d.kind : 'directive', text: str(d.text, 6000), from: str(d.from, 80) || 'headquarters', ts: d.ts ?? now(), receivedAt: now(), status: 'new' }
          if (x.authority === 'observe') { rec.status = 'ignored'; rec.note = 'This company shares data only (authority: observe); directives are not acted on.'; rec.sent = false; rec.respondedAt = now() }
          x.directives.push(rec)
          fresh.push(rec)
        }
        x.directives = x.directives.slice(-200)
        x.lastSyncAt = now(); x.lastOkAt = now(); x.lastError = null
        x.suspended = j.suspended === true
        return x
      })
      for (const d of fresh) this.#deliver(next, d)
      if (next.policiesChanged) this.#tellPolicies(next)
      return { ok: true, directives: fresh.length }
    } catch (e) {
      this.update(x => { x.lastSyncAt = now(); if (x.lastError !== e.message) this.#log(x, `sync failed: ${e.message}`); x.lastError = str(e.message, 300) })
      throw e
    } finally { this.syncing = false }
  }

  #deliver(g, d) {
    const ceo = this.sa.store.read().agents.find(a => !a.parent)?.id ?? 'ceo'
    const hq = g.hq?.name || 'the group headquarters'
    if (d.status === 'ignored') { this.sa.say({ from: 'group', kind: 'group', text: `${hq} sent a ${d.kind}; not acted on because its authority is "observe": ${clip(d.text, 400)}` }); return }
    const how = d.kind === 'question'
      ? 'Answer it with respond_hq decision done and the answer in note (use the facts; say what is unknown).'
      : g.authority === 'direct'
        ? 'The owner gave the headquarters authority to direct this company: carry it out through your tools and put it in your plan. Answer with respond_hq: accept now, done with the evidence when it is carried out, or blocked with the reason if it cannot be done (the owner is told). Owner-only matters still need this company\'s owner: ask with reply_owner.'
        : 'The headquarters advises this company; you decide. Answer with respond_hq: accept (and put it in your plan), or decline with your reason. Report done with the evidence when an accepted one is carried out.'
    this.sa.trigger({ key: `hq:${d.id}`, source: 'group', kind: `hq-${d.kind}`, to: ceo, text: `${hq} (${d.from}) sends a ${d.kind} (id ${d.id}):\n${d.text}\n\n${how}` })
    this.sa.say({ from: 'group', kind: 'group', text: `${hq} sent a ${d.kind}: ${clip(d.text, 400)}` })
  }

  #tellPolicies(g, authorityChanged = false) {
    const p = g.policies ?? {}
    const rules = (p.rules ?? []).filter(Boolean)
    if (!rules.length && p.maxDailyUsd == null && !authorityChanged) return
    const ceo = this.sa.store.read().agents.find(a => !a.parent)?.id ?? 'ceo'
    const bind = g.authority === 'direct'
    this.sa.trigger({ key: `hq-policy:${now()}`, source: 'group', kind: 'hq-policies', to: ceo, text: `Group policies from ${g.hq?.name || 'the headquarters'} (authority: ${g.authority}; they ${bind ? 'bind this company' : g.authority === 'advise' ? 'are guidance' : 'are not applied'}):\n${p.maxDailyUsd != null ? `- Daily spend cap: $${p.maxDailyUsd}${bind ? ' (enforced in code)' : ''}\n` : ''}${rules.map(r => `- ${r}`).join('\n') || '- no rules'}${p.note ? `\nNote: ${p.note}` : ''}\n${bind ? 'Follow them from now on and adjust your plan where it conflicts.' : 'Weigh them in your plans.'}` })
  }

  /** The group's daily spend cap when it binds this company (authority direct), else null. Read by Company.holdReason. */
  spendCap() {
    const g = this.read()
    if (g.authority !== 'direct' || !g.hq?.url) return null
    const n = Number(g.policies?.maxDailyUsd)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  view() {
    const g = this.read()
    return {
      joined: this.joined(), hq: g.hq ?? null, companyId: g.companyId ?? null, name: g.name ?? P.label, joinedAt: g.joinedAt ?? null,
      authority: g.authority, authorities: AUTHORITIES, share: g.share, shareKeys: SHARE_KEYS, everyMinutes: g.everyMinutes,
      lastSyncAt: g.lastSyncAt ?? null, lastOkAt: g.lastOkAt ?? null, lastError: g.lastError ?? null, insecure: g.hq?.url ? insecure(g.hq.url) : false,
      policies: g.policies, spendCap: this.spendCap(), suspended: !!g.suspended, directives: g.directives.slice().reverse().slice(0, 60), log: g.log.slice().reverse().slice(0, 30), left: g.left ?? null,
    }
  }
}

export const HQ_TOOL = {
  name: 'respond_hq',
  description: 'Answer a directive, advice or question from the group headquarters (by id). accept: you will carry it out (put it in your plan). decline: you will not, with your reason (not allowed when the headquarters has authority to direct this company). done: carried out, or the answer to a question, in note. blocked: it cannot be done now, with the reason (the owner is told).',
  inputSchema: { type: 'object', properties: { id: { type: 'string' }, decision: { type: 'string', enum: ['accept', 'decline', 'done', 'blocked'] }, note: { type: 'string' } }, required: ['id', 'decision'] },
}
