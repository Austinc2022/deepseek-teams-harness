/**
 * Growth: how agents, teams and leaders get better at their work, not only remember it.
 *
 *   know-how     a Skill Scout (web search) finds skills and best methods for a problem: the local library first, then
 *                GitHub and the web. Runs at the start of researched work, at the first sign of trouble, before giving
 *                up, on request (request_know_how, or a worker's needKnowHow) and when a review names a skill gap.
 *   verify       a worker's "ready" is checked by an independent verifier against the ticket's done-when before the
 *                ticket closes; principal and gate-bound tickets also go to the critique panel.
 *   capability   every review (verifier, critique, leaders' report_gap) names capability gaps: who fell short, why,
 *                and the remedy. Code applies the remedy for this task at once (a skill for the next turn, a search, a
 *                stronger model) and, when a gap repeats, asks a coach (the People head, else the CEO) to fix it for
 *                good. Agent changes are measured and rolled back when quality falls.
 *   trials       a new skill (downloaded or written here) is attached per run for a few uses; it is kept on the agent
 *                when its scores hold up, retired otherwise.
 *   learning     after notable work an after-action review writes lessons (to the company knowledge store and to the
 *                role's playbook skill, <agent>-playbook, which grows with experience); repeated lessons and proven
 *                methods become shared skills written by the Skill Smith (versioned, audited, trialled).
 *   persistence  giving up (stop, kill, cannot-finish) needs three distinct approaches, a know-how search and a red-team
 *                rescue challenge first; the host's turn limit triggers a rescue before a ticket is stopped.
 *
 * State: forge/super-agent/growth.json (only the loop holder writes it). Model work runs as engine runs, capped per day.
 */
import fs from 'node:fs'
import path from 'node:path'
import { profile as P } from '../../company/lib/profile.js'
import { now, today, newId, str, clip, slug } from './store.js'
import { workerDef, WORKER } from './org.js'

const S = { type: 'string' }
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
const arr = items => ({ type: 'array', items })

export const SCOUT = `${P.prefix}skill-scout`
export const SMITH = `${P.prefix}skill-smith`
export const VERIFIER = `${P.prefix}ticket-verifier`
export const RED = P.auditorName
const QUALITY = ['relentless-solver', 'masterwork-standard', 'executive-judgment', 'grand-scale-orchestration']

/** A capability gap, as every review reports it. */
export const GAP = obj({
  who: { type: 'string', description: 'the agent, team or super team that fell short (its name), or "worker" for the ticket builder' },
  category: { type: 'string', enum: ['method', 'knowledge', 'instructions', 'model', 'tools', 'staffing'] },
  gap: { type: 'string', description: 'what was weak, concretely' },
  evidence: { type: 'string', description: 'the file, line or moment that shows it' },
  remedy: { type: 'string', enum: ['use-skill', 'search-skill', 'update-instructions', 'stronger-model', 'add-member', 'access'] },
  detail: { type: 'string', description: 'for use-skill the skill name; for search-skill what to search for; otherwise the change' },
})
const VERIFY = obj({
  pass: { type: 'boolean', description: 'true only when every done-when condition holds, checked by you in the folder' },
  checks: arr(obj({ check: S, ok: { type: 'boolean' }, evidence: S })),
  mustFix: arr(S),
  capabilityGaps: arr(GAP),
})
const KNOWHOW = obj({
  summary: { type: 'string', description: 'two sentences: what the best practitioners do for this problem' },
  localSkills: { ...arr(S), description: 'names of installed skills that fit, best first (at most 3)' },
  internetSkills: { ...arr(obj({ repo: S, path: S, why: S })), description: 'SKILL.md files on GitHub worth installing (at most 2): owner/name and path' },
  methods: { type: 'string', description: 'Markdown brief: the state-of-the-art methods for this exact problem, step by step, with what to try first and what usually goes wrong' },
  sources: arr(S),
})
const AAR = obj({
  lessons: { ...arr(obj({ text: S, kind: { type: 'string', enum: ['do', 'avoid', 'method'] }, appliesTo: { type: 'string', enum: ['builder', 'leader', 'all'] }, evidence: S })), description: 'at most 4 lessons that would make the next similar task better; none when nothing general was learned' },
  skillCandidate: { type: 'object', description: 'a reusable method worth a skill of its own, or empty', properties: { name: S, description: S, body: S }, required: [] },
})
const SKILLDOC = obj({ name: S, description: S, body: { type: 'string', description: 'the SKILL.md body in Markdown: when to use it, the method step by step, checks, pitfalls' } })
const AUDIT = obj({ safe: { type: 'boolean' }, reasons: arr(S), summary: S })
const RESCUE = obj({ worthContinuing: { type: 'boolean' }, routes: arr(obj({ route: S, why: S, firstStep: S })), verdict: S })

const DAY = 86400_000
const toks = s => new Set((String(s).toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []).filter(w => !STOP.has(w)))
const STOP = new Set('the and for with that this from are was were not but you your into have has its use when what how all any can will should more than then them they there their which while about after before also only each other such some'.split(' '))
const overlap = (a, b) => { const A = toks(a), B = toks(b); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size) }
const mean = xs => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : null)

export class Growth {
  constructor(sa) {
    this.sa = sa
    this.file = path.join(sa.store.dir, 'growth.json')
    this.running = new Map() // run id -> label (model work of this module)
    this.lib = null
  }
  get registry() { return this.sa.forge.registry }
  get skillsDir() { return this.registry.d.skills }

  read() {
    let g
    try { g = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { g = {} }
    for (const k of ['ledger', 'trials', 'lessons', 'knowhow', 'changes', 'challenges', 'smith', 'scores', 'events']) g[k] ??= []
    g.perf ??= {}; g.perf.history ??= {}; g.perf.plans ??= []; g.perf.reflected ??= {}; g.perf.judged ??= []
    g.days ??= {}
    return g
  }
  update(fn) {
    const g = this.read()
    const out = fn(g)
    g.ledger = g.ledger.slice(-800); g.lessons = g.lessons.slice(-600); g.knowhow = g.knowhow.slice(-300); g.scores = g.scores.slice(-2000)
    g.perf.plans = g.perf.plans.slice(-300); g.perf.judged = g.perf.judged.slice(-500)
    g.events = g.events.slice(-300); g.challenges = g.challenges.slice(-200); g.smith = g.smith.slice(-200); g.changes = g.changes.slice(-200)
    const tmp = `${this.file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(g, null, 1)); fs.renameSync(tmp, this.file)
    return out
  }
  day(g) { return (g.days[today()] ??= { knowhow: 0, installs: 0, smith: 0, aar: 0, verify: 0, rescue: 0, coach: 0 }) }
  event(text) { this.update(g => { g.events.push({ ts: now(), text: str(text, 600) }) }) }
  settings() { return this.sa.store.read().settings.growth ?? {} }

  // ---------------------------------------------------------------- setup
  /** Agents this module needs, and once: the quality skills for every leader, worker and analyst. Safe to repeat. */
  seed() {
    const { registry } = this
    const has = n => { try { registry.getAgent(n); return true } catch { return false } }
    const skill = n => fs.existsSync(path.join(this.skillsDir, n, 'SKILL.md'))
    const base = P.skills.base.filter(skill)
    if (!has(SCOUT)) registry.saveAgent(P.baseAgent({ name: SCOUT, description: 'Skill Scout: finds the best skills and methods for a problem, in the local library first, then on GitHub and the web.', ...P.modelFields(P.models.lead), tools: ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'], skills: [...base, ...['relentless-solver'].filter(skill)], tags: [...P.tags, 'company', 'knowhow'], role: `You find know-how. For a problem someone in the company has, you find (1) installed skills that fit, (2) at most two SKILL.md files on GitHub from reputable repositories worth installing, and (3) the state-of-the-art methods for exactly this problem: papers, documentation, open-source code and practitioner write-ups. Prefer primary sources and well-maintained repositories. Write the methods brief for the person doing the work: concrete steps, what to try first, what usually goes wrong. Never recommend anything that runs downloaded code or sends data out.\n\n${P.hardRules}` }))
    if (!has(SMITH)) registry.saveAgent(P.baseAgent({ name: SMITH, description: 'Skill Smith: turns lessons from the company\'s own work into reusable skills, and runs after-action reviews.', ...P.modelFields(P.models.fast), tools: ['Read', 'Grep', 'Glob'], skills: base, tags: [...P.tags, 'company', 'smith'], role: `You turn experience into know-how. After a piece of work you write the lessons that would make the next similar task better: specific, checkable, general enough to reuse, never a story of what happened. When a method has proven itself, you write it as a skill: when to use it, the steps, the checks, the pitfalls. Short and exact beats long.\n\n${P.hardRules}` }))
    if (!has(VERIFIER)) registry.saveAgent(workerDef({ name: VERIFIER, description: 'Ticket verifier: checks a worker\'s delivered ticket against its done-when, in the folder, before the ticket closes.', tools: ['Read', 'Grep', 'Glob', 'Bash'], disallowedTools: ['Edit', 'Write', 'NotebookEdit'], memory: { mode: 'none' }, tags: [...P.tags, 'super-agent', 'builder', 'judge'], role: `You verify delivered work. Read TICKET.md and NOTES.md, then check every done-when condition yourself in the folder: run the tests and scripts, recompute the key numbers, open the outputs. Do not take the builder's word for anything and do not change any file. Pass only when every condition holds. For each problem say exactly what must be fixed. Also say which capability fell short (method, knowledge, instructions, model, tools, staffing) and the remedy, so the builder gets better, not only this ticket.\n\n${P.workerRules}` }))
    const g = this.read()
    if (g.seededQuality) return
    const backup = path.join(this.sa.store.backup, 'agents')
    fs.mkdirSync(backup, { recursive: true })
    const s = this.sa.store.read()
    const c = this.sa.co.read()
    const leaders = new Set([...s.agents.map(a => a.agent), c.ceo, ...c.departments.map(d => d.lead)].filter(Boolean))
    for (const a of registry.listAgents().filter(x => !x.invalid && P.isOurs(x.name))) {
      const tags = a.tags ?? []
      if (tags.includes('judge') || [SCOUT, SMITH, VERIFIER, RED].includes(a.name)) continue
      const want = leaders.has(a.name) ? QUALITY : tags.includes('builder') ? ['relentless-solver', 'masterwork-standard'] : ['relentless-solver']
      const def = registry.getAgent(a.name)
      const add = want.filter(k => skill(k) && !(def.skills ?? []).includes(k))
      if (!add.length) continue
      try { fs.writeFileSync(path.join(backup, `${a.name}.${Date.now()}.yaml`), registry.getAgentSource(a.name)) } catch {}
      registry.saveAgent({ ...def, skills: [...(def.skills ?? []), ...add] })
    }
    // the old "a cheap no is a good result" rules are baked into existing agent files: replace them there too
    const OLD = [/Do not open work to look busy; a cheap "no" is a good result\./g, /Kill initiatives that do not hold up\. A cheap "no" is a good result\./g]
    const NEW = ['Do not open work to look busy. A first "no" starts a search: say why it failed, what would have to be true, and try the next distinct approach; stop only after three distinct approaches, a know-how search and a rescue challenge.', 'Kill initiatives that do not hold up after a real search: several distinct approaches, the reason each failed, and what would have to be true. A first negative result is the start of that search.']
    for (const a of registry.listAgents().filter(x => !x.invalid && P.isOurs(x.name))) {
      let src
      try { src = registry.getAgentSource(a.name) } catch { continue }
      const next = OLD.reduce((t, re, i) => t.replace(re, NEW[i]), src)
      if (next === src) continue
      try { fs.writeFileSync(path.join(backup, `${a.name}.${Date.now()}.rules.yaml`), src); registry.saveAgentSource(a.name, next) } catch (e) { this.sa.log(`growth: rules for ${a.name}: ${e.message}`) }
    }
    // super teams: more rounds, so a weak first pass gets a second and third look
    try { for (const st of this.sa.co.supers.list()) if ((st.maxRounds ?? 0) < 4 && P.isOurs(st.supervisor ?? '')) this.sa.co.supers.update(st.id, { maxRounds: 4 }) } catch (e) { this.sa.log(`growth: super team rounds: ${e.message}`) }
    this.update(x => { x.seededQuality = now() })
    this.event('Quality skills given to every leader, worker and analyst; super teams now review up to 4 rounds.')
  }

  // ---------------------------------------------------------------- the skill library
  library() {
    if (this.lib && Date.now() - this.lib.at < 10 * 60_000) return this.lib.list
    const list = []
    for (const n of fs.readdirSync(this.skillsDir)) {
      const f = path.join(this.skillsDir, n, 'SKILL.md')
      if (!fs.existsSync(f)) continue
      const head = fs.readFileSync(f, 'utf8').slice(0, 1500)
      list.push({ name: n, description: (head.match(/^description:\s*(.+)$/m)?.[1] ?? '').replace(/^["']|["']$/g, '').slice(0, 300) })
    }
    this.lib = { at: Date.now(), list }
    return list
  }
  /** Installed skills that fit a text, by word overlap (no model). Playbooks of other agents are left out. */
  match(text, k = 3, exclude = []) {
    const want = toks(text)
    return this.library()
      .filter(x => !x.name.endsWith('-playbook') && !exclude.includes(x.name))
      .map(x => { const have = toks(`${x.name.replace(/-/g, ' ')} ${x.description}`); let n = 0; for (const w of have) if (want.has(w)) n++; return { ...x, score: have.size ? n / Math.sqrt(have.size) : 0 } })
      .filter(x => x.score >= 0.9).sort((a, b) => b.score - a.score).slice(0, k)
  }
  playbookName(agent) { return `${agent}-playbook` }

  /** The skills to attach to one run of `agent` (on top of its own): its trials, its playbook, and `extra`. */
  attach(agent, extra = []) {
    let def
    try { def = this.registry.getAgent(agent) } catch { return null }
    const g = this.read()
    const trial = g.trials.filter(t => t.agent === agent && t.status === 'trial').map(t => t.skill)
    const pb = fs.existsSync(path.join(this.skillsDir, this.playbookName(agent), 'SKILL.md')) ? [this.playbookName(agent)] : []
    const add = [...trial, ...pb, ...extra].filter(k => fs.existsSync(path.join(this.skillsDir, k, 'SKILL.md')) && !(def.skills ?? []).includes(k))
    return add.length ? { skills: [...new Set([...(def.skills ?? []), ...add])], attached: [...new Set(add)] } : null
  }

  // ---------------------------------------------------------------- model work (engine runs, capped)
  #run(label, fn, meta = {}) {
    const { id, done } = this.sa.forge.engine.startCustom(label, fn, meta, { cwd: meta.cwd ?? P.projectDir, meta: { growth: label } })
    this.running.set(id, label)
    return done.then(st => { this.sa.co.charge(st.costUsd, label); if (st.status !== 'completed') throw new Error(String(st.error ?? st.status).split('\n')[0]); return st.result }).finally(() => this.running.delete(id))
  }
  #budget(kind, max) {
    return this.update(g => { const d = this.day(g); if (d[kind] >= max) return false; d[kind]++; return true })
  }

  // ---------------------------------------------------------------- know-how
  /**
   * Find skills and methods for a problem. `forAgent` gets the skills as trials; a ticket gets the brief in
   * KNOW-HOW.md and as an input. Returns the result text. `me` is the leader on whose behalf skills are installed.
   */
  async knowHow({ problem, context = '', forAgent, ticket, why, by }) {
    const st = this.settings()
    if (!this.#budget('knowhow', st.maxKnowHowPerDay ?? 40)) return 'The know-how limit for today is reached; work from the skills and lessons you have.'
    const lib = this.match(`${problem} ${context}`, 8)
    const lessons = this.lessonsFor(`${problem} ${context}`, 6)
    const rec = { id: newId('h'), ts: now(), problem: str(problem, 600), why, by, forAgent, ticket: ticket?.id, status: 'running' }
    this.update(g => { g.knowhow.push(rec) })
    try {
      const res = await this.#run(`know-how: ${clip(problem, 50)}`, async api => {
        const r = await api.agent(SCOUT, [
          `# Problem\n${str(problem, 4000)}`,
          context ? `# Context\n${str(context, 6000)}` : '',
          `# Why you are asked\n${why ?? 'at the start of the work'}`,
          `# Installed skills that may fit (check them first; name the ones that do in localSkills)\n${lib.map(x => `- ${x.name}: ${x.description}`).join('\n') || '(none matched)'}`,
          lessons.length ? `# What the company already learned\n${lessons.map(l => `- (${l.kind}) ${l.text}`).join('\n')}` : '',
          '# Your job\nFind the best known way to solve this problem: what the best practitioners and the literature do, and skills worth installing. Search the web and GitHub. Be concrete and current.',
        ].filter(Boolean).join('\n\n'), { schema: KNOWHOW, label: 'scout', full: true, signal: AbortSignal.timeout(15 * 60_000) })
        if (!r?.ok) throw new Error(r?.error ?? 'the scout gave no answer')
        const out = r.structured
        // install internet skills through the audit (the org's installer, on behalf of the root super agent)
        const installed = []
        const root = this.sa.store.read().agents.find(a => !a.parent)
        for (const x of (out.internetSkills ?? []).slice(0, 2)) {
          if (!this.#budget('installs', st.maxInstallsPerDay ?? 15)) break
          try { const msg = await this.sa.org.installSkill(root, { repo: x.repo, path: x.path }, api); const m = msg.match(/Installed (\S+)\./); if (m) installed.push(m[1]) } catch (e) { this.sa.log(`know-how install ${x.repo}: ${e.message}`) }
        }
        return { ...out, installed }
      }, { problem: clip(problem, 80) })
      const local = (res.localSkills ?? []).filter(n => this.library().some(x => x.name === n)).slice(0, 3)
      const skills = [...new Set([...local, ...res.installed])]
      if (forAgent) for (const k of skills) this.startTrial(forAgent, k, res.installed.includes(k) ? 'internet' : 'library', ticket?.id)
      const brief = `# Know-how: ${clip(problem, 120)}\n\n${res.summary}\n\n${res.methods}\n\nSkills attached: ${skills.join(', ') || 'none'}\nSources:\n${(res.sources ?? []).slice(0, 12).map(s => `- ${s}`).join('\n')}\n`
      if (ticket) {
        try { fs.appendFileSync(path.join(ticket.dir, 'KNOW-HOW.md'), `\n\n${brief}`) } catch {}
        this.sa.store.update(s => { const t = s.tickets.find(x => x.id === ticket.id); if (t) { t.inputs.push({ id: newId('i'), ts: now(), kind: 'know-how', text: `A know-how brief is in KNOW-HOW.md (${why ?? 'requested'}): ${clip(res.summary, 600)} Skills attached to your next turns: ${skills.join(', ') || 'none'}. Use the best method you find there; say in NOTES.md which one you chose and why.` }); t.knowHowAt = now(); t.knowHowTurn = t.assignments.length } })
      }
      this.update(g => { const x = g.knowhow.find(y => y.id === rec.id); if (x) { x.status = 'done'; x.skills = skills; x.summary = str(res.summary, 600); x.endedAt = now() } })
      return clip(brief, 9000)
    } catch (e) {
      this.update(g => { const x = g.knowhow.find(y => y.id === rec.id); if (x) { x.status = 'failed'; x.error = str(e.message, 300); x.endedAt = now() } })
      return `The know-how search failed: ${e.message}. Continue with what you have.`
    }
  }

  // ---------------------------------------------------------------- trials
  startTrial(agent, skill, from, ticket) {
    this.update(g => {
      if (g.trials.some(t => t.agent === agent && t.skill === skill && t.status !== 'retired')) return
      let def; try { def = this.registry.getAgent(agent) } catch { return }
      if ((def.skills ?? []).includes(skill)) return
      g.trials.push({ id: newId('r'), agent, skill, from, ticket, status: 'trial', startedAt: now(), uses: 0, scores: [] })
    })
  }
  /** A quality observation for an agent's output (0..1), credited to the trial skills that run carried. */
  score(agent, value, { source, ticket, attached = [], task, why } = {}) {
    if (!Number.isFinite(value)) return
    const decided = []
    this.update(g => {
      g.scores.push({ ts: now(), agent, value, source, ticket, attached, ...(task ? { task: str(task, 300) } : {}), ...(why ? { why: str(why, 400) } : {}) })
      for (const t of g.trials.filter(x => x.agent === agent && x.status === 'trial' && attached.includes(x.skill))) {
        t.uses++; t.scores.push(value)
        if (t.uses < 3) continue
        const base = mean(g.scores.filter(x => x.agent === agent && !(x.attached ?? []).includes(t.skill)).slice(-12).map(x => x.value)) ?? 0.6
        t.status = mean(t.scores) >= base - 0.02 ? 'promoted' : 'retired'
        t.decidedAt = now(); t.baseline = Math.round(base * 100) / 100
        decided.push(t)
      }
      // a recent change to this agent is judged on the scores after it
      for (const ch of g.changes.filter(x => x.agent === agent && x.status === 'measuring')) {
        const after = g.scores.filter(x => x.agent === agent && x.ts > ch.at).map(x => x.value)
        if (after.length < 3) continue
        ch.after = Math.round(100 * mean(after)) / 100
        ch.status = ch.before != null && ch.after < ch.before - 0.1 ? 'rolled-back' : 'kept'
        if (ch.status === 'rolled-back') decided.push({ rollback: ch })
      }
    })
    for (const t of decided) {
      if (t.rollback) { this.#rollback(t.rollback); continue }
      if (t.status === 'promoted') {
        try { const def = this.registry.getAgent(t.agent); if (!(def.skills ?? []).includes(t.skill)) this.registry.saveAgent({ ...def, skills: [...(def.skills ?? []), t.skill] }) } catch {}
        this.sa.say({ from: 'system', kind: 'org', text: `Skill "${t.skill}" kept for ${t.agent}: it scored ${Math.round(100 * mean(t.scores))}% over ${t.uses} uses (baseline ${Math.round(100 * t.baseline)}%).` })
      } else this.sa.say({ from: 'system', kind: 'org', text: `Skill "${t.skill}" retired for ${t.agent}: ${Math.round(100 * mean(t.scores))}% over ${t.uses} uses against a baseline of ${Math.round(100 * t.baseline)}%.` })
    }
  }
  agentScore(agent, n = 10) { return mean(this.read().scores.filter(x => x.agent === agent).slice(-n).map(x => x.value)) }

  // ---------------------------------------------------------------- agent changes (coaching), measured and reversible
  recordChange(agent, prevDef, by, what) {
    this.update(g => { g.changes.push({ id: newId('c'), agent, at: now(), by, what: str(what, 300), prev: prevDef, before: this.agentScoreIn(g, agent), status: 'measuring' }) })
  }
  agentScoreIn(g, agent) { const v = mean(g.scores.filter(x => x.agent === agent).slice(-10).map(x => x.value)); return v == null ? null : Math.round(100 * v) / 100 }
  #rollback(ch) {
    // team and super team changes have no definition to restore: the coach decides what to do instead
    if (ch.prev) { try { this.registry.saveAgent(ch.prev) } catch (e) { this.sa.log(`rollback ${ch.agent}: ${e.message}`); return } }
    this.sa.say({ from: 'system', kind: 'org', text: `Change to ${ch.agent} ("${ch.what}") ${ch.prev ? 'rolled back' : 'did not help'}: quality fell from ${ch.before} to ${ch.after}.` })
    const coach = this.coach()
    if (coach) this.sa.trigger({ source: 'growth', kind: 'coaching', to: coach, text: `Your change to ${ch.agent} ("${ch.what}") made its work worse (score ${ch.before} -> ${ch.after}) and was rolled back. Try a different remedy if the gap is still there.` })
  }

  // ---------------------------------------------------------------- capability gaps
  coach() {
    const s = this.sa.store.read()
    return (s.agents.find(a => a.kind === 'dept' && a.dept === 'people' && !a.paused) ?? s.agents.find(a => !a.parent))?.id
  }
  /** Record gaps from a review; apply the remedy for this task at once; coach on repeats. */
  gaps(list, { source, ticket, by }) {
    if (!Array.isArray(list) || !list.length) return
    const s = this.sa.store.read()
    const t = ticket ? s.tickets.find(x => x.id === ticket) : null
    const rows = list.slice(0, 6).map(x => ({ id: newId('g'), ts: now(), source, by, ticket, who: str(x.who === 'worker' && t ? t.worker : x.who, 80), category: x.category, gap: str(x.gap, 400), evidence: str(x.evidence, 300), remedy: x.remedy, detail: str(x.detail, 300) }))
    this.update(g => { g.ledger.push(...rows) })
    for (const r of rows) {
      // now: this task
      if (t && r.who === t.worker) {
        if (r.remedy === 'use-skill' && this.library().some(x => x.name === r.detail)) this.startTrial(r.who, r.detail, 'review', t.id)
        if (r.remedy === 'stronger-model') this.sa.store.update(x => { const y = x.tickets.find(z => z.id === t.id); if (y) y.boost = true })
        if (r.remedy === 'search-skill' && !t.knowHowAt) this.knowHow({ problem: r.detail || r.gap, context: `${t.title}\n${clip(t.brief, 2000)}`, forAgent: t.worker, ticket: t, why: `a review (${source}) found: ${r.gap}`, by: source }).catch(() => {})
      } else if (r.remedy === 'use-skill' && this.library().some(x => x.name === r.detail)) this.startTrial(r.who, r.detail, 'review')
      // for good: the same gap twice in a week
      const g = this.read()
      const same = g.ledger.filter(x => x.who === r.who && x.category === r.category && Date.now() - new Date(x.ts) < 7 * DAY)
      const coached = g.ledger.some(x => x.who === r.who && x.category === r.category && x.coachedAt && Date.now() - new Date(x.coachedAt) < 3 * DAY)
      const coach = this.coach()
      if (same.length >= 2 && !coached && coach && this.#budget('coach', 12)) {
        this.update(x => { for (const y of x.ledger) if (y.who === r.who && y.category === r.category) y.coachedAt = now() })
        this.sa.trigger({ source: 'growth', kind: 'coaching', to: coach, text: `Coaching needed: ${r.who} fell short on ${r.category} ${same.length} times this week.\n${same.slice(-4).map(x => `- (${x.source}) ${x.gap}${x.evidence ? ` [${x.evidence}]` : ''}; suggested: ${x.remedy}${x.detail ? ` ${x.detail}` : ''}`).join('\n')}\nFix the cause for good: give it a skill or a better one (update_agent skills, or request_know_how for a new skill), sharpen its instructions (update_agent role), raise its model or effort, or get a missing role (staff). Its work is scored after the change; a change that makes it worse is rolled back by code. Protected agents (the auditor, the worker template, the verifier) cannot be changed: improve them through their playbook (propose_skill_update).` })
      }
    }
  }

  // ---------------------------------------------------------------- verification
  /** Check a delivered ticket. Resolves to { pass, text, gaps }. */
  async verify(t) {
    this.#budget('verify', 1e9)
    const res = await this.#run(`verify: ${t.short}`, async api => {
      const r = await api.agent(VERIFIER, [
        `# Verify ticket: ${t.title}`,
        `The work is in the current directory: ${t.dir}. Read TICKET.md, NOTES.md and the report below, then check each done-when condition yourself.`,
        `## Brief\n${clip(t.brief, 4000)}`, `## Done when\n${clip(t.doneWhen, 2000)}`,
        `## The builder's report\n${clip(t.assignments.filter(a => a.report).at(-1)?.report?.summary ?? '', 3000)}`,
        'Pass only when every condition holds. List what must be fixed, exactly. Name capability gaps of the builder (who: "worker").',
      ].join('\n\n'), { schema: VERIFY, label: `verify:${t.short}`, full: true, cwd: t.dir, signal: AbortSignal.timeout(20 * 60_000) })
      if (!r?.ok) throw new Error(r?.error ?? 'the verifier gave no verdict')
      return r.structured
    }, { ticket: t.id, cwd: t.dir })
    const failed = (res.checks ?? []).filter(c => !c.ok)
    return { pass: res.pass === true && !(res.mustFix ?? []).length, mustFix: res.mustFix ?? [], gaps: res.capabilityGaps ?? [], text: `${res.pass ? 'PASSED' : 'FAILED'}: ${(res.checks ?? []).length} checks, ${failed.length} failed.${failed.length ? `\nFailed: ${failed.map(c => `${c.check} (${clip(c.evidence, 160)})`).join('; ')}` : ''}${res.mustFix?.length ? `\nMust fix:\n${res.mustFix.map(m => `- ${m}`).join('\n')}` : ''}` }
  }

  // ---------------------------------------------------------------- learning
  lessonsFor(text, k = 6, appliesTo) {
    return this.read().lessons.filter(l => !appliesTo || l.appliesTo === 'all' || l.appliesTo === appliesTo)
      .map(l => ({ ...l, s: overlap(text, l.text) })).filter(l => l.s > 0.2).sort((a, b) => b.s - a.s).slice(0, k)
  }
  /** After-action review of a ticket: lessons to the knowledge store and the playbook; proven methods to the Smith. */
  async afterAction(t, { why }) {
    if (this.settings().learning === false || !this.#budget('aar', this.settings().maxReviewsPerDay ?? 40)) return
    let notes = ''
    try { notes = clip(fs.readFileSync(path.join(t.dir, 'NOTES.md'), 'utf8'), 6000) } catch {}
    const reports = t.assignments.filter(a => a.report).map((a, i) => `${i + 1}. (${a.report.status}) ${clip(a.report.summary, 700)}`).join('\n')
    const reviews = (t.reviews ?? []).map(r => `- ${r.kind}: ${clip(r.text, 500)}`).join('\n')
    let out
    try {
      out = await this.#run(`after-action: ${t.short}`, async api => {
        const r = await api.agent(SMITH, [
          `# After-action review of ticket "${t.title}" (${why})`,
          `## Brief\n${clip(t.brief, 2500)}`, `## How it went (${t.assignments.length} turns; outcome ${t.outcome ?? t.status})\n${reports}`,
          reviews ? `## Reviews\n${reviews}` : '', notes ? `## The builder's notes\n${notes}` : '',
          '## Your job\nWrite the lessons that would make the next similar task faster or better: what to do, what to avoid, which method worked. Each must be general enough to reuse and specific enough to act on. If a method here is worth a skill of its own (it would help many future tasks), give it as skillCandidate. Return no lessons when nothing general was learned.',
        ].filter(Boolean).join('\n\n'), { schema: AAR, label: `aar:${t.short}`, full: true, cwd: t.dir, signal: AbortSignal.timeout(10 * 60_000) })
        if (!r?.ok) throw new Error(r?.error ?? 'no review')
        return r.structured
      }, { ticket: t.id, cwd: t.dir })
    } catch (e) { this.sa.log(`after-action ${t.short}: ${e.message}`); return }
    const lessons = (out.lessons ?? []).slice(0, 4).filter(l => str(l.text, 400).trim().length > 20).map(l => ({ id: newId('l'), ts: now(), ticket: t.id, owner: t.owner, agent: l.appliesTo === 'builder' ? t.worker : l.appliesTo === 'leader' ? this.sa.store.read().agents.find(a => a.id === t.owner)?.agent : null, text: str(l.text, 400).trim(), kind: l.kind, appliesTo: l.appliesTo, evidence: str(l.evidence, 300), source: t.dir }))
    if (!lessons.length && !out.skillCandidate?.body) return
    // the same lesson again is counted on the existing one: repetition is what makes it worth a skill
    const repeated = []
    this.update(g => {
      for (const l of lessons) {
        const same = g.lessons.find(x => overlap(x.text, l.text) >= 0.8 && x.kind === l.kind)
        if (same) { same.count = (same.count ?? 1) + 1; same.lastAt = now(); (same.sources ??= [same.source]).push(l.source); same.sources = same.sources.slice(-8); if (same.ticket !== l.ticket) repeated.push(same.id) }
        else g.lessons.push({ ...l, count: 1 })
      }
    })
    for (const l of lessons) this.#toKnowledge(l)
    for (const agent of new Set(lessons.map(l => l.agent).filter(Boolean))) this.#playbook(agent)
    // lessons that repeat across tasks (the same, or close) become shared skills
    const g = this.read()
    for (const l of g.lessons.filter(x => repeated.includes(x.id) || lessons.some(n => n.id === x.id))) {
      if (l.smithed) continue
      const similar = g.lessons.filter(x => x.id !== l.id && overlap(x.text, l.text) >= 0.5)
      if ((l.count ?? 1) < 2 && !similar.length) continue
      this.update(x => { for (const y of x.lessons) if (y.id === l.id || similar.some(z => z.id === y.id)) y.smithed = now() })
      this.smith({ reason: 'a lesson repeated across tasks', material: [l, ...similar.slice(0, 4)].map(x => `- (${x.kind}, ${x.appliesTo}, seen ${x.count ?? 1}x) ${x.text} [${(x.sources ?? [x.source]).join(', ')}]`).join('\n'), appliesTo: l.appliesTo, agents: [l.agent].filter(Boolean) }).catch(() => {})
    }
    const firstTime = !(t.reviews ?? []).some(r => r.kind === 'verify' && !r.pass)
    if (out.skillCandidate?.body && firstTime && t.outcome === 'completed') this.smith({ reason: 'a method that delivered a ticket at the first check', material: `Proposed skill "${out.skillCandidate.name}": ${out.skillCandidate.description}\n\n${out.skillCandidate.body}`, appliesTo: 'builder', agents: [t.worker] }).catch(() => {})
  }
  #toKnowledge(l) {
    import('../../company/lib/knowledge-hooks.js').then(m => {
      try { m.kb().add({ claim: l.text, strength: 'argued', tier: 'agent', kind: 'lesson', area: m.AREA, by: SMITH, sourceKind: 'ticket', sourceRef: l.source, key: undefined }) } catch (e) { this.sa.log(`lesson to knowledge: ${e.message}`) }
    }).catch(() => {})
    if (l.agent) import('../../agent-forge/lib/memory.js').then(m => {
      try { const def = this.registry.getAgent(l.agent); if ((def.memory?.mode ?? 'none') !== 'none' && m.saveNote && m.memoryDir) m.saveNote(m.memoryDir(this.registry.home, def), { title: clip(l.text, 80), content: `${l.text}\n\nEvidence: ${l.evidence}\nSource: ${l.source}`, tags: ['lesson', 'after-action'] }) } catch {}
    }).catch(() => {})
  }
  /** The agent's own playbook skill: its lessons as Do / Avoid / Methods, newest first, attached to every run. */
  #playbook(agent) {
    const ls = this.read().lessons.filter(l => l.agent === agent)
    if (!ls.length) return
    const sec = k => { const seen = []; for (const l of [...ls].reverse().filter(x => x.kind === k).sort((a, b) => (b.count ?? 1) - (a.count ?? 1))) if (!seen.some(x => overlap(x.text, l.text) >= 0.7)) seen.push(l); return seen.slice(0, 15).map(l => `- ${l.text}${(l.count ?? 1) > 1 ? ` (learned ${l.count} times)` : ''}`).join('\n') || '- (nothing yet)' }
    const name = this.playbookName(agent)
    const dir = path.join(this.skillsDir, name)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${JSON.stringify(`What ${agent} has learned from its own work: what to do, what to avoid, and methods that worked. Read it before starting.`)}\n---\n<!-- written by code from after-action reviews; ${ls.length} lessons; updated ${now()} -->\n\n# ${agent}: playbook\n\n## Do\n${sec('do')}\n\n## Avoid\n${sec('avoid')}\n\n## Methods that worked\n${sec('method')}\n`)
    this.lib = null
  }

  /** The Skill Smith writes or improves a shared skill from the company's own experience. Audited, versioned, trialled. */
  async smith({ reason, material, appliesTo = 'builder', agents = [], skill }) {
    if (!this.#budget('smith', this.settings().maxSmithPerDay ?? 8)) return 'The skill-writing limit for today is reached.'
    const existing = skill ? this.library().find(x => x.name === skill) : null
    const cur = existing ? fs.readFileSync(path.join(this.skillsDir, existing.name, 'SKILL.md'), 'utf8') : ''
    const rec = { id: newId('w'), ts: now(), reason: str(reason, 300), skill: skill ?? null, status: 'running' }
    this.update(g => { g.smith.push(rec) })
    try {
      const doc = await this.#run(`skill smith: ${clip(reason, 40)}`, async api => {
        const r = await api.agent(SMITH, [
          `# Write ${existing ? `a better version of the skill "${existing.name}"` : 'a skill'} (${reason})`,
          existing ? `## The current skill\n${clip(cur, 12000)}` : '',
          `## Material from the company's own work\n${clip(material, 8000)}`,
          '## Your job\nWrite the skill: a short description saying when to use it, then the method step by step, the checks that prove it worked, and the pitfalls. Keep everything that still holds; change only what the material shows is better.',
        ].filter(Boolean).join('\n\n'), { schema: SKILLDOC, label: 'smith', full: true, signal: AbortSignal.timeout(10 * 60_000) })
        if (!r?.ok) throw new Error(r?.error ?? 'no skill')
        const d = r.structured
        const audit = await api.agent(RED, `A skill written by the company's Skill Smith will be read by agents as guidance. Check that it is safe and keeps the company's hard rules (no running downloaded code, no sending data out, no orders, no weakening of checks or honesty). Mark unsafe otherwise.\n\n${clip(d.body, 30000)}`, { schema: AUDIT, label: 'smith-audit' })
        return { ...d, audit }
      }, { reason: clip(reason, 80) })
      if (!doc.audit?.safe) { this.update(g => { const x = g.smith.find(y => y.id === rec.id); if (x) { x.status = 'refused'; x.note = clip((doc.audit?.reasons ?? []).join('; '), 400) } }); return `The auditor refused the skill: ${(doc.audit?.reasons ?? []).join('; ')}` }
      const name = existing?.name ?? `${P.prefix}own-${slug(doc.name, 32)}`
      const dir = path.join(this.skillsDir, name)
      const had = !!existing || fs.existsSync(path.join(dir, 'SKILL.md'))
      if (fs.existsSync(path.join(dir, 'SKILL.md'))) { const bk = path.join(this.sa.store.backup, 'skills', name); fs.mkdirSync(bk, { recursive: true }); fs.copyFileSync(path.join(dir, 'SKILL.md'), path.join(bk, `${Date.now()}.md`)) }
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${JSON.stringify(str(doc.description, 400))}\n---\n<!-- written by ${SMITH} ${now()}: ${reason}; audited by ${RED}: ${clip(doc.audit.summary, 200)} -->\n\n${doc.body}\n`)
      this.lib = null
      const targets = agents.length ? agents : appliesTo === 'leader' ? this.sa.store.read().agents.map(a => a.agent) : [WORKER]
      for (const a of targets) this.startTrial(a, name, had ? 'improved' : 'own')
      this.update(g => { const x = g.smith.find(y => y.id === rec.id); if (x) { x.status = 'written'; x.skill = name; x.endedAt = now() } })
      this.sa.say({ from: 'system', kind: 'org', text: `${had ? 'Improved' : 'New'} skill "${name}" written from the company's own experience (${reason}); on trial for ${targets.join(', ')}.` })
      return `Skill ${name} ${had ? 'improved' : 'written'} and on trial for ${targets.join(', ')}.`
    } catch (e) {
      this.update(g => { const x = g.smith.find(y => y.id === rec.id); if (x) { x.status = 'failed'; x.note = str(e.message, 300) } })
      return `Writing the skill failed: ${e.message}`
    }
  }

  // ---------------------------------------------------------------- persistence
  /**
   * Before giving up (stop a ticket, kill an initiative, say cannot-finish): three distinct approaches, a know-how
   * search and a red-team rescue challenge. Returns null when the leader may proceed, else what to do first.
   */
  guard(me, { action, ref, title, attempts, exempt, challenge }) {
    if (exempt && ['duplicate', 'superseded', 'owner-asked', 'out-of-scope'].includes(exempt)) return null
    const tried = (Array.isArray(attempts) ? attempts : []).map(x => ({ approach: str(x?.approach, 300).trim(), result: str(x?.result, 300).trim() })).filter(x => x.approach.length > 10)
    const distinct = tried.filter((x, i) => !tried.slice(0, i).some(y => overlap(x.approach, y.approach) >= 0.7))
    if (distinct.length < 3) return `Not yet. Before you ${action}, show three distinct approaches that were tried (attempts: [{approach, result}]; you gave ${distinct.length}). If fewer were tried, try another approach first: request_know_how for the best known methods, or message the ticket with a new route. Exempt only a duplicate, superseded work, the owner's request or work outside scope (exempt).`
    const g = this.read()
    const done = challenge && g.challenges.find(c => c.id === challenge && c.ref === ref && c.status === 'done')
    if (done) return null
    const running = g.challenges.find(c => c.ref === ref && c.status === 'running')
    if (running) return `The rescue challenge for ${ref} is still running (${running.id}); its result reaches you as an event.`
    const id = newId('x')
    this.update(x => { x.challenges.push({ id, ts: now(), by: me.id, action, ref, title: str(title, 200), attempts: distinct, status: 'running' }) })
    this.#challenge(me, id, { action, ref, title, attempts: distinct }).catch(e => this.sa.log(`challenge ${id}: ${e.message}`))
    return `A rescue challenge (${id}) started: the Skill Scout searches for better methods and the red team argues for the best ways to continue. When its result reaches you, read it; then either take a route, or repeat this call with challenge: "${id}" to ${action}.`
  }
  async #challenge(me, id, { action, ref, title, attempts }) {
    this.#budget('rescue', 1e9)
    const problem = `${title}: ${attempts.map(a => `${a.approach} -> ${a.result}`).join('; ')}`
    const brief = await this.knowHow({ problem: `Better ways to achieve: ${title}`, context: `Tried so far:\n${attempts.map(a => `- ${a.approach}: ${a.result}`).join('\n')}`, why: `before giving up (${action})`, by: me.id })
    let res
    try {
      res = await this.#run(`rescue: ${clip(title, 40)}`, async api => {
        const r = await api.agent(RED, `Someone wants to ${action} "${title}" (${ref}). Argue against giving up, honestly. What was tried:\n${attempts.map(a => `- ${a.approach}: ${a.result}`).join('\n')}\n\nWhat the know-how search found:\n${clip(brief, 6000)}\n\nGive the three best routes to continue, each with its first step, and say whether continuing is worth it. If every route is weak, say so plainly.`, { schema: RESCUE, label: 'rescue', signal: AbortSignal.timeout(12 * 60_000) })
        return r
      }, { ref })
    } catch (e) { res = null }
    this.update(g => { const c = g.challenges.find(x => x.id === id); if (c) { c.status = 'done'; c.endedAt = now(); c.worth = res?.worthContinuing ?? null; c.verdict = str(res?.verdict, 600) } })
    this.sa.trigger({ source: 'growth', kind: 'rescue', to: me.id, text: `Rescue challenge ${id} for "${title}" (${ref}, before you ${action}):\nRed team: ${res ? `${res.worthContinuing ? 'worth continuing' : 'continuing looks weak'}. ${res.verdict}\n${(res.routes ?? []).map((r, i) => `${i + 1}. ${r.route} (${r.why}). First step: ${r.firstStep}`).join('\n')}` : 'no answer'}\n\nKnow-how:\n${clip(brief, 4000)}\n\nTake a route now (message_ticket, a new ticket, a directive), or repeat your call with challenge: "${id}" to ${action}.` })
  }

  /** The host's turn limit: rescue once before a ticket is stopped (the caller runs the search). True when it may. */
  rescueTicket(t) {
    if (t.rescued) return false
    this.sa.store.update(s => { const y = s.tickets.find(z => z.id === t.id); if (y) { y.rescued = now(); y.boost = true } })
    this.update(g => { this.day(g).rescue++ })
    return true
  }

  // ---------------------------------------------------------------- views
  stats() {
    const g = this.read()
    const s = this.sa.store.read()
    const done = s.tickets.filter(t => t.outcome === 'completed' && (t.reviews ?? []).some(r => r.kind === 'verify'))
    const firstPass = done.filter(t => !(t.reviews ?? []).some(r => r.kind === 'verify' && !r.pass)).length
    const kills = g.challenges
    const byAgent = {}
    for (const r of g.ledger) { const k = r.who; byAgent[k] ??= { gaps: 0, categories: {} }; byAgent[k].gaps++; byAgent[k].categories[r.category] = (byAgent[k].categories[r.category] ?? 0) + 1 }
    return {
      verify: { checked: s.tickets.filter(t => (t.reviews ?? []).some(r => r.kind === 'verify')).length, firstPass, delivered: done.length, firstPassRate: done.length ? firstPass / done.length : null },
      critique: { tickets: s.tickets.filter(t => t.critiques?.length).length, of: s.tickets.filter(t => t.status === 'ended').length },
      knowhow: { total: g.knowhow.length, today: this.day(g).knowhow, skillsAttached: g.knowhow.reduce((n, k) => n + (k.skills?.length ?? 0), 0), recent: g.knowhow.slice(-8).reverse().map(k => ({ ts: k.ts, problem: k.problem, why: k.why, status: k.status, skills: k.skills ?? [] })) },
      trials: { trial: g.trials.filter(t => t.status === 'trial').length, promoted: g.trials.filter(t => t.status === 'promoted').length, retired: g.trials.filter(t => t.status === 'retired').length, list: g.trials.slice(-15).reverse().map(t => ({ agent: t.agent, skill: t.skill, from: t.from, status: t.status, uses: t.uses, mean: t.scores.length ? Math.round(100 * mean(t.scores)) : null })) },
      lessons: { total: g.lessons.length, playbooks: this.library().filter(x => x.name.endsWith('-playbook')).length, recent: [...g.lessons].sort((a, b) => String(b.lastAt ?? b.ts).localeCompare(String(a.lastAt ?? a.ts))).slice(0, 6).map(l => ({ text: l.text, kind: l.kind, appliesTo: l.appliesTo, count: l.count ?? 1 })) },
      smith: { written: g.smith.filter(x => x.status === 'written').length, refused: g.smith.filter(x => x.status === 'refused').length, recent: g.smith.slice(-5).reverse().map(x => ({ skill: x.skill, status: x.status, reason: x.reason })) },
      gaps: { total: g.ledger.length, week: g.ledger.filter(x => Date.now() - new Date(x.ts) < 7 * DAY).length, byAgent, recent: g.ledger.slice(-8).reverse().map(x => ({ who: x.who, category: x.category, gap: x.gap, remedy: x.remedy, source: x.source })) },
      changes: g.changes.slice(-8).reverse().map(c => ({ agent: c.agent, what: c.what, status: c.status, before: c.before, after: c.after ?? null })),
      challenges: { total: kills.length, proceeded: kills.filter(c => c.proceeded).length, recent: kills.slice(-5).reverse().map(c => ({ title: c.title, action: c.action, status: c.status, worth: c.worth })) },
      events: g.events.slice(-5).reverse(),
    }
  }
  /** One agent's capability record for its page. */
  agentView(agent) {
    const g = this.read()
    return {
      score: this.agentScoreIn(g, agent), scores: g.scores.filter(x => x.agent === agent).slice(-20).map(x => ({ ts: x.ts, value: x.value, source: x.source })),
      gaps: g.ledger.filter(x => x.who === agent).slice(-10).reverse(), trials: g.trials.filter(t => t.agent === agent).slice(-10).reverse(),
      changes: g.changes.filter(c => c.agent === agent).slice(-6).reverse().map(c => ({ at: c.at, what: c.what, status: c.status, before: c.before, after: c.after ?? null })),
      playbook: fs.existsSync(path.join(this.skillsDir, this.playbookName(agent), 'SKILL.md')) ? this.playbookName(agent) : null,
      lessons: g.lessons.filter(l => l.agent === agent).slice(-6).reverse().map(l => ({ text: l.text, kind: l.kind })),
    }
  }
}
