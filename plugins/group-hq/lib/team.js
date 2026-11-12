/**
 * The headquarters' people (docs/GROUP.md):
 *
 *   Group CEO        hq-group-ceo. Leads the group through tools only: reads the companies, sends directives,
 *                    advice and questions, sets group and company policies, answers the review team. The owner
 *                    talks to it on the HQ page; events (a finished review, a blocked or declined directive, a
 *                    company that joined) start a turn of their own.
 *   Review team      hq-advisor-portfolio, hq-advisor-benchmark, hq-advisor-governance and hq-advisory-lead. It is
 *                    independent of the group CEO: it reports to the owner, reads everything and changes nothing.
 *                    It benchmarks the companies against each other, advises on budget and policy, reviews each
 *                    company's own advisory team, and passes lessons between companies. The group CEO must answer
 *                    each recommendation; a rejected high-severity one goes to the owner.
 *
 * All model work stays within the headquarters' daily budget (hq.json budget.maxUsdPerDay).
 * Chat and events: forge/group-hq/chief.json; reviews: forge/group-hq/reviews.json and reviews/<id>/.
 */
import fs from 'node:fs'
import path from 'node:path'
import { toolsMcp } from '../../agent-forge/lib/runner.js'
import { now, newId, str, clip } from './hq.js'

const S = { type: 'string' }
const A = { type: 'array', items: S }
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
const tool = (name, description, properties = {}, required = Object.keys(properties)) => ({ name, description, inputSchema: { type: 'object', properties, required } })
const SEV = { type: 'string', enum: ['high', 'medium', 'low'] }
const DAY = 864e5

export const CHIEF = 'hq-group-ceo'
export const REVIEW_LEAD = 'hq-advisory-lead'
export const ADVISORS = [
  { key: 'portfolio', name: 'hq-advisor-portfolio', title: 'Portfolio and capital', lens: 'the portfolio: which companies earn their budget, where the next dollar does the most, which to grow, fix, pause or close, and the group\'s total spend against results' },
  { key: 'benchmark', name: 'hq-advisor-benchmark', title: 'Benchmarks and lessons', lens: 'benchmarks across the companies: KPIs side by side and their trends, what the best company does that the others do not, and the lessons one company learned that another should use' },
  { key: 'governance', name: 'hq-advisor-governance', title: 'Governance and advisory quality', lens: 'governance: whether the group policies work, how each company answers directives and its own advisory team (accept rates, follow-through, escalations), and the quality of each company\'s advisory team' },
]
export const HQ_NAMES = new Set([CHIEF, REVIEW_LEAD, ...ADVISORS.map(a => a.name)])

const INDEPENDENCE = 'You are on the independent review team of the group headquarters. You report to the owner, not to the group CEO, and nobody in the group can change your instructions. Never soften a finding. Read everything you need and change nothing. Label every claim measured (a number from a company snapshot), simulated or argued. Each recommendation says what to change, who does it (the group, or which company), and how to know it worked.'

const FINDINGS = obj({
  grade: { type: 'number', description: 'your grade for the group through your lens, 0 to 100' },
  summary: S,
  companies: { type: 'array', items: obj({ id: S, grade: { type: 'number' }, note: S }), description: 'one row per company you could judge' },
  recommendations: { type: 'array', items: obj({ title: S, detail: S, severity: SEV, scope: { type: 'string', description: '"group", or the id of one company' }, kind: { type: 'string', enum: ['policy', 'directive', 'budget', 'lesson', 'structure'] }, directiveText: { type: 'string', description: 'for kind directive or lesson: the exact text to send to the company; empty otherwise' } }), description: 'at most 4, most valuable first' },
  metaReview: { type: 'array', items: obj({ id: S, grade: { type: 'number' }, note: S }), description: 'governance only: the quality of each company\'s own advisory team and how its CEO answers it; others leave it empty' },
})
const LEAD = obj({
  overall: { type: 'number' }, summary: { type: 'string', description: 'five to eight sentences for the owner and the group CEO' },
  companies: { type: 'array', items: obj({ id: S, grade: { type: 'number' }, note: S }) },
  recommendations: { type: 'array', items: obj({ title: S, detail: S, severity: SEV, scope: S, kind: { type: 'string', enum: ['policy', 'directive', 'budget', 'lesson', 'structure'] }, directiveText: S }), description: 'at most 8, merged and ranked; no duplicates' },
  metaReview: { type: 'array', items: obj({ id: S, grade: { type: 'number' }, note: S }) },
  ownerNote: S,
})

const CHIEF_TOOLS = [
  tool('list_companies', 'The companies in the group with their latest numbers, authority and open directives.'),
  tool('read_company', 'Everything one company shares: its latest snapshot, KPI history and directives.', { id: S }),
  tool('send_directive', 'Send a directive (an instruction), advice or a question to one company (its id) or to "all". What the company does with it depends on the authority its owner gave the headquarters (observe: nothing; advise: its CEO decides; direct: its CEO must carry it out). Owner-only matters of a company (real money, publishing, credentials) stay with that company\'s owner.', { company: S, kind: { type: 'string', enum: ['directive', 'advice', 'question'] }, text: S }),
  tool('set_policy', 'Set group policies (scope "group") or one company\'s own (scope = its id): a daily spend cap in dollars and rules. They bind companies that gave the headquarters authority to direct, and are guidance for the others. Give only what changes.', { scope: S, maxDailyUsd: { type: 'number' }, rules: A, note: S }, ['scope']),
  tool('respond_review', 'Answer a recommendation of the review team (it reports to the owner). accept: you carry it out now (send the directive, set the policy) or plan it; reject: why, with evidence (a rejected high-severity one goes to the owner); defer: until when.', { id: S, decision: { type: 'string', enum: ['accept', 'reject', 'defer', 'done'] }, reason: S }),
  tool('note_owner', 'Tell the owner something they must know or decide. Not for progress.', { text: S }),
]

export class People {
  constructor(hq, forge, { log = () => {} } = {}) {
    this.hq = hq
    this.forge = forge
    this.log = log
    this.chiefFile = path.join(hq.dir, 'chief.json')
    this.reviewFile = path.join(hq.dir, 'reviews.json')
    fs.mkdirSync(path.join(hq.dir, 'reviews'), { recursive: true })
    this.chiefBusy = false
    this.reviewBusy = null
  }

  // ---------------------------------------------------------------- files
  #read(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
  #write(f, v) { const tmp = `${f}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(v, null, 1)); fs.renameSync(tmp, f) }
  chief() { const c = this.#read(this.chiefFile, {}); c.messages ??= []; c.events ??= []; return c }
  #chief(fn) { const c = this.chief(); const out = fn(c); c.messages = c.messages.slice(-300); c.events = c.events.slice(-200); this.#write(this.chiefFile, c); return out }
  reviews() { const r = this.#read(this.reviewFile, {}); r.reviews ??= []; r.recs ??= []; return r }
  #reviews(fn) { const r = this.reviews(); const out = fn(r); r.reviews = r.reviews.slice(-60); r.recs = r.recs.slice(-400); this.#write(this.reviewFile, r); return out }

  // ---------------------------------------------------------------- agents
  seed() {
    const { registry } = this.forge
    const model = this.hq.read().models.model
    const has = n => { try { registry.getAgent(n); return true } catch { return false } }
    const base = { backend: 'claude-code', model, effort: 'high', permission: 'allow', tools: ['Read', 'Grep', 'Glob'], disallowedTools: ['Edit', 'Write', 'NotebookEdit', 'Bash'], memory: { mode: 'none' }, execution: { mode: 'host' }, maxTurns: 40, knowledge: false, tags: ['group-hq'] }
    const made = []
    if (!has(CHIEF)) {
      registry.saveAgent({ ...base, name: CHIEF, description: 'Group CEO: leads the group headquarters through its tools; reads every company, sends directives and policies, answers the review team.', tags: ['group-hq', 'leader'], role: 'You are the group CEO at the group headquarters. The companies in the group each have their own owner, CEO and advisory team; their owner decided how much authority the headquarters has over them (observe, advise, direct), and you respect it. You lead the group toward its mission: you read what the companies share, compare them, and act through your tools only: directives, advice and questions to a company, group and company policies (spend caps, rules), and answers to the review team. Prefer few, specific directives with a clear way to check them. Never ask a company to break its hard rules, spend real money or publish anything: those are its owner\'s decisions. Every claim you make is backed by a number from a snapshot, or you say it is unknown.' })
      made.push(CHIEF)
    }
    for (const a of ADVISORS) if (!has(a.name)) { registry.saveAgent({ ...base, name: a.name, description: `HQ review team: ${a.title}. Independent of the group CEO.`, tags: ['group-hq', 'advisory'], role: `You review the group of companies through one lens: ${a.lens}. The facts are in a context file; read the company snapshots it points to for more.\n\n${INDEPENDENCE}` }); made.push(a.name) }
    if (!has(REVIEW_LEAD)) { registry.saveAgent({ ...base, name: REVIEW_LEAD, description: 'HQ review lead: merges the review team\'s findings into one review for the owner and the group CEO.', tags: ['group-hq', 'advisory'], role: `You lead the independent review team of the group headquarters. You check the advisors' findings against the facts, merge duplicates, and write one review: an overall grade, a grade per company, at most 8 ranked recommendations (each with its scope: the group or one company, and for directives the exact text to send), the quality of each company's own advisory team, and what the owner should know.\n\n${INDEPENDENCE}` }); made.push(REVIEW_LEAD) }
    return made
  }

  // ---------------------------------------------------------------- the group CEO
  /** The owner writes to the group CEO. */
  say(text) {
    const t = str(text, 8000).trim()
    if (!t) throw new Error('empty message')
    this.#chief(c => { c.messages.push({ id: newId('m'), ts: now(), from: 'owner', text: t, status: 'queued' }) })
    this.drain().catch(e => this.log(`group CEO: ${e.message}`))
    return { ok: true }
  }
  /** Something happened that the group CEO should handle on its own. */
  event(kind, text, key) {
    this.#chief(c => { if (key && c.events.some(e => e.key === key)) return; c.events.push({ id: newId('e'), ts: now(), kind, key, text: str(text, 12000), status: 'pending' }) })
  }

  async drain() {
    if (this.chiefBusy) return
    this.chiefBusy = true
    try {
      for (;;) {
        const s = this.hq.read()
        const c = this.chief()
        const msgs = c.messages.filter(m => m.from === 'owner' && m.status === 'queued')
        const ev = s.chief.enabled ? c.events.find(e => e.status === 'pending') : null
        if (!msgs.length && !ev) break
        const hold = this.hq.budgetHold()
        if (hold) {
          this.#chief(x => { for (const m of x.messages) if (m.status === 'queued') { m.status = 'answered' } x.messages.push({ id: newId('m'), ts: now(), from: 'system', text: `No model call can start: ${hold}.` }) })
          break
        }
        const work = msgs.length ? { kind: 'chat', text: msgs.map(m => m.text).join('\n\n'), ids: msgs.map(m => m.id) } : { kind: ev.kind, text: ev.text, event: ev.id }
        this.#chief(x => { for (const m of x.messages) if (work.ids?.includes(m.id)) m.status = 'working'; const e = x.events.find(y => y.id === work.event); if (e) e.status = 'working' })
        const reply = await this.#turn(work, c).catch(e => ({ from: 'system', text: `The group CEO could not answer: ${e.message}`, tools: [] }))
        this.#chief(x => {
          for (const m of x.messages) if (work.ids?.includes(m.id)) m.status = 'answered'
          const e = x.events.find(y => y.id === work.event); if (e) { e.status = 'done'; e.note = clip(reply.text, 600) }
          x.messages.push({ id: newId('m'), ts: now(), ...reply, ...(work.event ? { event: work.kind } : {}) })
        })
      }
    } finally { this.chiefBusy = false }
  }

  async #turn(work, c) {
    const { engine } = this.forge
    this.seed()
    const history = c.messages.filter(m => m.from !== 'system').slice(-12)
    const log = []
    const s = this.hq.read()
    const prompt = [
      `# The group\n${s.name}${s.mission ? `: ${s.mission}` : ''}\nCurrent time: ${new Date().toString()}. ${s.chief.mayDirect ? '' : 'The owner has switched off directives from you: you may advise and ask, not send directives.'}`,
      `# Group policies now\nDaily spend cap per company: ${s.policies.maxDailyUsd ?? 'none'}\nRules: ${(s.policies.rules ?? []).join(' | ') || 'none'}`,
      `# Companies\n${this.#companiesText()}`,
      history.length ? `# Conversation so far\n${history.map(m => `${m.from === 'owner' ? 'Owner' : m.event ? `You (on ${m.event})` : 'You'}: ${clip(m.text, 1200)}`).join('\n\n')}` : '',
      work.kind === 'chat' ? `# The owner writes\n${work.text}` : `# Event: ${work.kind}\n${work.text}`,
      `# How to answer\nYour final message is what the owner reads: the answer first, then what your tools changed. Use read_company before judging one company. Use tools only for actions that are worth it; say exactly what you changed. Never invent numbers.`,
    ].filter(Boolean).join('\n\n')
    const { done } = engine.startCustom(`hq: group CEO (${work.kind})`, async api => {
      const mcp = toolsMcp('hq', CHIEF_TOOLS, (name, args) => this.#tool(name, args ?? {}))
      return api.agent(CHIEF, prompt, { label: `group-ceo:${work.kind}`, full: true, extraMcp: { hq: mcp }, cwd: this.hq.dir, signal: AbortSignal.timeout(20 * 60_000), onEvent: ev => { if (ev.type === 'tool') log.push({ tool: String(ev.name ?? '').replace(/^mcp__hq__/, ''), arg: clip(ev.brief ?? '', 90) }) } })
    }, { hq: 'chief', kind: work.kind }, { cwd: this.hq.dir, meta: { hqChief: work.kind } })
    const st = await done
    this.hq.charge(st.costUsd ?? 0, `group CEO (${work.kind})`)
    if (!st.result?.ok) return { from: 'system', text: `The group CEO did not answer: ${st.result?.error ?? st.error ?? st.status}`.split('\n')[0], tools: log }
    return { from: 'chief', text: str(st.result.text, 8000).trim() || '(no text)', tools: log, costUsd: st.costUsd ?? null }
  }

  #companiesText() {
    const list = this.hq.companies()
    if (!list.length) return '(no company has joined yet)'
    return list.map(c => { const k = c.summary?.kpis ?? {}; return `- ${c.id} "${c.name}" (${c.profile || '?'}; ${c.status}${c.online ? ', online' : ', offline'}; authority ${c.authority}): score ${k.companyScore ?? '?'}, goal ${c.summary?.progress?.percent ?? '?'}%, delivered 7d ${k.delivered7d ?? '?'}, spend 7d $${k.spend7dUsd ?? '?'}, today $${c.summary?.budget?.spentTodayUsd ?? '?'} of $${c.summary?.budget?.dailyUsd ?? '?'}, health ${c.summary?.health?.status ?? '?'}, advisory ${c.summary?.advisory?.latest?.overall ?? '?'}/100, open directives ${c.directives.open}${c.directives.blocked ? `, blocked ${c.directives.blocked}` : ''}` }).join('\n')
  }

  async #tool(name, a) {
    try {
      const s = this.hq.read()
      if (name === 'list_companies') return `${this.#companiesText()}\n\nPortfolio: ${JSON.stringify(this.hq.portfolio())}`
      if (name === 'read_company') {
        const c = this.hq.company(String(a.id))
        const h = c.history
        const first = h[0], last = h.at(-1)
        return clip(`# ${c.name} (${c.id}), authority ${c.authority}, ${c.status}${c.online ? ', online' : ', offline'}\nPolicies that apply: ${JSON.stringify(c.policies)}\nTrend over ${h.length} samples: ${first && last ? `score ${first.kpis?.companyScore ?? '?'} -> ${last.kpis?.companyScore ?? '?'}, goal ${first.percent ?? '?'}% -> ${last.percent ?? '?'}%, advisory ${first.advisory ?? '?'} -> ${last.advisory ?? '?'}` : 'not enough history'}\nDirectives:\n${c.directives.slice(0, 15).map(d => `- ${d.id} ${d.kind} [${d.status}] ${clip(d.text, 160)}${d.response?.note ? ` -> ${clip(d.response.note, 200)}` : ''}`).join('\n') || '(none)'}\n\n# Snapshot\n${JSON.stringify(c.snapshot, null, 1)}`, 14000)
      }
      if (name === 'send_directive') {
        if (!s.chief.mayDirect && a.kind === 'directive') throw new Error('the owner has switched off directives from the group CEO; send advice or a question')
        const made = this.hq.direct({ company: String(a.company), kind: a.kind ?? 'directive', text: a.text, from: 'group CEO' })
        return `Sent ${made.length} ${a.kind ?? 'directive'}(s): ${made.map(d => d.id).join(', ')}. Each company receives it at its next sync.`
      }
      if (name === 'set_policy') {
        const patch = {}
        if (a.maxDailyUsd !== undefined) patch.maxDailyUsd = a.maxDailyUsd
        if (Array.isArray(a.rules)) patch.rules = a.rules
        if (a.note !== undefined) patch.note = a.note
        if (String(a.scope) === 'group') { this.hq.setSettings({ policies: { ...s.policies, ...patch } }); return 'Group policies updated; companies get them at their next sync.' }
        this.hq.setCompany(String(a.scope), { policies: patch })
        return `Policies of ${a.scope} updated.`
      }
      if (name === 'respond_review') return this.respondReview('group CEO', a)
      if (name === 'note_owner') { this.#chief(c => { c.messages.push({ id: newId('m'), ts: now(), from: 'chief', kind: 'note', text: str(a.text, 3000) }) }); return 'The owner will see it.' }
      return `unknown tool ${name}`
    } catch (e) { return `Error: ${e.message}` }
  }

  // ---------------------------------------------------------------- the review team
  blockedReview() {
    if (this.reviewBusy) return 'a review is already running'
    if (!this.hq.companies().some(c => c.status === 'active' && c.summary)) return 'no company has sent a snapshot yet'
    return this.hq.budgetHold()
  }

  async runReview({ trigger = 'manual', focus } = {}) {
    const why = this.blockedReview()
    if (why) throw new Error(`cannot start a review: ${why}`)
    this.seed()
    const id = newId('r')
    const dir = path.join(this.hq.dir, 'reviews', id)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'CONTEXT.md'), this.#context(focus))
    this.#reviews(r => { r.reviews.push({ id, trigger: str(trigger, 200), status: 'running', startedAt: now() }) })
    const { engine } = this.forge
    const { id: runId, done } = engine.startCustom('hq: group review', async api => {
      const results = await Promise.all(ADVISORS.map(a => api.agent(a.name, `Review the group through your lens (${a.title}). The facts are in ${path.join(dir, 'CONTEXT.md')}; each company's full snapshot is in the file it names. Return your findings.${focus ? `\nThe owner asked to look at: ${focus}` : ''}`, { schema: FINDINGS, label: `hq-advisor:${a.key}`, cwd: dir, signal: AbortSignal.timeout(25 * 60_000) }).then(r => ({ ...a, r })).catch(e => ({ ...a, r: null, error: e.message }))))
      const got = results.filter(x => x.r)
      if (!got.length) throw new Error('no advisor returned findings')
      const lead = await api.agent(REVIEW_LEAD, `Merge the findings into one review. Facts: ${path.join(dir, 'CONTEXT.md')}.\n\n${got.map(x => `## ${x.title} (grade ${x.r.grade})\n${JSON.stringify(x.r, null, 1)}`).join('\n\n')}`, { schema: LEAD, label: 'hq-advisory-lead', cwd: dir, signal: AbortSignal.timeout(20 * 60_000) })
      if (!lead) throw new Error('the review lead returned no review')
      return { results: results.map(x => ({ key: x.key, title: x.title, r: x.r, error: x.error })), lead }
    }, { hq: 'review', id }, { cwd: dir, meta: { hqReview: id } })
    this.reviewBusy = { id, runId }
    done.then(st => {
      this.hq.charge(st.costUsd ?? 0, `group review ${id}`)
      if (st.status !== 'completed' || !st.result?.lead) { this.#reviews(r => { const x = r.reviews.find(y => y.id === id); Object.assign(x, { status: 'failed', error: str(st.error ?? st.status, 300).split('\n')[0], endedAt: now() }) }); return }
      const { lead, results } = st.result
      const recs = (lead.recommendations ?? []).slice(0, 8).map(x => ({ id: newId('v'), review: id, ts: now(), title: str(x.title, 200), detail: str(x.detail, 3000), severity: ['high', 'medium', 'low'].includes(x.severity) ? x.severity : 'medium', scope: str(x.scope, 40) || 'group', kind: x.kind, directiveText: str(x.directiveText, 4000), status: 'open' }))
      const names = Object.fromEntries(this.hq.companies().map(c => [c.id, c.name]))
      const md = [`# Group review ${id}`, `${now().slice(0, 16)} · overall ${Math.round(lead.overall)}/100`, '', lead.summary, '', '## Companies', ...(lead.companies ?? []).map(c => `- ${names[c.id] ?? c.id}: ${Math.round(c.grade)}/100. ${c.note}`), '', '## Recommendations', ...recs.map((x, i) => `${i + 1}. **${x.title}** (${x.severity}, ${x.kind}, ${x.scope === 'group' ? 'group' : names[x.scope] ?? x.scope}) [${x.id}]\n   ${x.detail}${x.directiveText ? `\n   Directive: ${x.directiveText}` : ''}`), '', '## Company advisory teams', ...(lead.metaReview ?? []).map(m => `- ${names[m.id] ?? m.id}: ${Math.round(m.grade)}/100. ${m.note}`), lead.ownerNote ? `\n## For the owner\n${lead.ownerNote}` : '', '', '## The advisors', ...results.map(x => `### ${x.title}${x.r ? ` (${Math.round(x.r.grade)})` : ''}\n${x.r?.summary ?? x.error ?? ''}`)].join('\n')
      fs.writeFileSync(path.join(dir, 'REPORT.md'), md)
      this.#reviews(r => {
        r.recs.push(...recs)
        Object.assign(r.reviews.find(y => y.id === id), { status: 'completed', endedAt: now(), costUsd: st.costUsd ?? 0, overall: Math.round(lead.overall), summary: str(lead.summary, 3000), companies: lead.companies ?? [], metaReview: lead.metaReview ?? [], ownerNote: str(lead.ownerNote, 1500), recs: recs.map(x => x.id) })
      })
      this.event('review', `The independent review team finished a group review (overall ${Math.round(lead.overall)}/100). It reports to the owner, who reads your answers.\n\n${lead.summary}\n\n# Recommendations\n${recs.map(x => `- ${x.id} (${x.severity}, ${x.kind}, scope ${x.scope}): ${x.title}\n  ${clip(x.detail, 600)}${x.directiveText ? `\n  Proposed text: ${clip(x.directiveText, 600)}` : ''}`).join('\n')}\n\nAnswer each with respond_review. When you accept one, carry it out now with your tools where you can (send_directive, set_policy).`, `review:${id}`)
      this.drain().catch(e => this.log(`group CEO: ${e.message}`))
    }).catch(e => { this.log(`group review ${id}: ${e.message}`); this.#reviews(r => { const x = r.reviews.find(y => y.id === id); if (x) Object.assign(x, { status: 'failed', error: str(e.message, 300), endedAt: now() }) }) }).finally(() => { this.reviewBusy = null })
    return { id, runId }
  }

  #context(focus) {
    const s = this.hq.read()
    const list = this.hq.companies()
    const rv = this.reviews()
    const prev = rv.reviews.filter(r => r.status === 'completed').at(-1)
    const trend = id => { const h = this.hq.history(id, 30); if (h.length < 2) return 'not enough history'; const a = h[0], b = h.at(-1); return `from ${a.at.slice(0, 10)} to ${b.at.slice(0, 10)}: score ${a.kpis?.companyScore ?? '?'} -> ${b.kpis?.companyScore ?? '?'}, goal ${a.percent ?? '?'}% -> ${b.percent ?? '?'}%, delivered 7d ${a.kpis?.delivered7d ?? '?'} -> ${b.kpis?.delivered7d ?? '?'}, advisory ${a.advisory ?? '?'} -> ${b.advisory ?? '?'}` }
    return [
      `# ${s.name}: facts for the group review (${now().slice(0, 16)})`, s.mission ? `Mission: ${s.mission}` : '', focus ? `The owner asked to look at: ${focus}` : '',
      `# Group policies\nDaily spend cap: ${s.policies.maxDailyUsd ?? 'none'}; rules: ${(s.policies.rules ?? []).join(' | ') || 'none'}`,
      `# Portfolio\n${JSON.stringify(this.hq.portfolio())}`,
      `# Companies\n${list.map(c => `## ${c.name} (${c.id})\nProfile ${c.profile || '?'}; ${c.status}${c.online ? ', online' : ', offline'}; authority given to the headquarters: ${c.authority}; joined ${c.joinedAt?.slice(0, 10)}; last seen ${c.lastSeenAt?.slice(0, 16)}\nShares: ${Object.entries(c.share ?? {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'only its status'}\nPolicies that apply: ${JSON.stringify(c.policies)}\nKPIs: ${JSON.stringify(c.summary?.kpis ?? null)}\nTrend: ${trend(c.id)}\nAdvisory: ${JSON.stringify(c.summary?.advisory ?? null)}\nDirectives: ${this.#directivesText(s, c.id)}\nFull snapshot: ${path.join(this.hq.dir, 'companies', c.id, 'snapshot.json')}`).join('\n\n') || '(none)'}`,
      prev ? `# The last group review (${prev.endedAt?.slice(0, 10)}, ${prev.overall}/100)\n${prev.summary}` : '# The last group review\nThis is the first one.',
      `# Earlier recommendations (latest first)\n${rv.recs.slice(-30).reverse().map(r => `- ${r.id} [${r.status}] (${r.severity}, ${r.scope}) ${r.title}${r.response ? `; group CEO ${r.response.decision}: ${clip(r.response.reason, 200)}` : ''}`).join('\n') || '(none)'}`,
    ].filter(Boolean).join('\n\n')
  }
  #directivesText(s, id) {
    const ds = s.directives.filter(d => d.company === id).slice(-12).reverse()
    return ds.length ? ds.map(d => `${d.kind} [${d.status}] "${clip(d.text, 120)}"${d.response?.note ? ` -> ${clip(d.response.note, 160)}` : ''}`).join('; ') : 'none'
  }

  respondReview(by, a) {
    const decision = String(a.decision ?? '')
    if (!['accept', 'reject', 'defer', 'done'].includes(decision)) throw new Error('decision is accept, reject, defer or done')
    const reason = str(a.reason, 2000).trim()
    if (reason.length < 15) throw new Error('give a reason (15+ characters)')
    const r = this.#reviews(x => {
      const rec = x.recs.find(y => y.id === String(a.id))
      if (!rec) throw new Error(`no recommendation ${a.id}`)
      rec.response = { by, decision, reason, ts: now() }
      rec.status = { accept: 'accepted', reject: 'rejected', defer: 'deferred', done: 'done' }[decision]
      return rec
    })
    if (decision === 'reject' && r.severity === 'high') this.#chief(c => { c.messages.push({ id: newId('m'), ts: now(), from: 'review', kind: 'escalation', text: `Escalation: the group CEO rejected a high-severity recommendation of the review team: "${r.title}". Reason given: ${reason}\nYou can accept it on the Review tab.` }) })
    return `Recorded: ${r.id} ${r.status}.`
  }

  /** The owner decides a review recommendation; accept with send: true sends its directive text to its company. */
  ownerReview(id, { decision, note, send } = {}) {
    if (!['accept', 'dismiss'].includes(decision)) throw new Error('decision is accept or dismiss')
    const r = this.#reviews(x => { const rec = x.recs.find(y => y.id === id); if (!rec) throw new Error('no such recommendation'); rec.owner = { decision, note: str(note, 1000), ts: now() }; rec.status = decision === 'accept' ? 'owner-accepted' : 'dismissed'; return rec })
    let sent = []
    if (decision === 'accept' && send && r.directiveText) sent = this.hq.direct({ company: r.scope === 'group' ? 'all' : r.scope, kind: r.kind === 'lesson' ? 'advice' : 'directive', text: r.directiveText, from: 'owner (review)' })
    if (decision === 'accept' && !sent.length) this.event('owner-accepted', `The owner accepted review recommendation ${r.id}: ${r.title}\n${r.detail}${note ? `\nThe owner adds: ${note}` : ''}\nCarry it out with your tools and say what you did.`, `owner-accepted:${r.id}`)
    this.drain().catch(() => {})
    return { rec: r, sent: sent.map(d => d.id) }
  }

  // ---------------------------------------------------------------- the loop
  async tick() {
    const s = this.hq.read()
    // directives a company blocked or declined go to the group CEO
    const st = this.chief()
    for (const d of s.directives.filter(x => ['blocked', 'declined'].includes(x.status) && x.response)) {
      const key = `resp:${d.id}:${d.status}`
      if (st.events.some(e => e.key === key)) continue
      const c = s.companies.find(x => x.id === d.company)
      this.event('directive-' + d.status, `${c?.name ?? d.company} ${d.status} your ${d.kind} ${d.id}: "${clip(d.text, 400)}"\nTheir answer (${d.response.by ?? 'their CEO'}): ${d.response.note}\nDecide what follows: accept it, send a better directive, or tell the owner.`, key)
    }
    for (const c of s.companies.filter(x => x.status === 'active' && Date.now() - new Date(x.joinedAt).getTime() < DAY)) this.event('joined', `A company joined the group: ${c.name} (${c.id}, ${c.profile || 'unknown profile'}, authority ${c.authority}). Read it when its first snapshot is in, and decide whether it needs anything from the headquarters.`, `joined:${c.id}`)
    if (s.chief.enabled) this.drain().catch(e => this.log(`group CEO: ${e.message}`))
    // scheduled review
    if (s.review.enabled && !this.reviewBusy) {
      const last = this.reviews().reviews.filter(r => r.status !== 'failed').at(-1)
      if (last?.status === 'running') { this.#reviews(r => { const x = r.reviews.find(y => y.id === last.id); if (x?.status === 'running') Object.assign(x, { status: 'failed', error: 'the host restarted during the review', endedAt: now() }) }); return }
      const due = !last || Date.now() - new Date(last.startedAt).getTime() >= s.review.everyDays * DAY
      if (due && !this.blockedReview()) await this.runReview({ trigger: last ? `scheduled (every ${s.review.everyDays} days)` : 'first review' }).catch(e => this.log(`group review: ${e.message}`))
    }
  }

  view() {
    const rv = this.reviews()
    const c = this.chief()
    return {
      chief: { busy: this.chiefBusy, messages: c.messages.slice(-80), events: c.events.slice(-30).reverse() },
      review: { busy: this.reviewBusy, blocked: this.blockedReview(), latest: rv.reviews.filter(r => r.status === 'completed').at(-1) ?? null, reviews: rv.reviews.slice().reverse().slice(0, 20), recs: rv.recs.slice().reverse().slice(0, 80) },
      team: { chief: CHIEF, lead: REVIEW_LEAD, advisors: ADVISORS.map(a => ({ key: a.key, name: a.name, title: a.title })) },
    }
  }
  report(id) { if (!/^r[0-9a-f]{10}$/.test(id)) throw new Error('bad review id'); const f = path.join(this.hq.dir, 'reviews', id, 'REPORT.md'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null }
}
