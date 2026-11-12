/**
 * The COO and the department heads as leaders. In continuous mode (charter.autopilot.mode) they work all the time
 * through the same machinery as the super agents (events, threads, a plan, tools), instead of only inside a company
 * cycle every few hours:
 *
 *   COO              directs departments at any time, moves and kills initiatives, decides build requests (opens the
 *                    ticket itself, forwards it to the CEO, or drops it), hires, and writes the periodic brief.
 *   department head  works a directive with its super team and teams in the background, reports to the COO in the
 *                    fixed report form; code applies the report and sends proposals to the gate.
 *
 * Code still decides what code decided before: only the gate moves an initiative to the gated stage, hires follow the
 * fixed templates, budget holds stop new work.
 */
import path from 'node:path'
import { profile as P } from '../../company/lib/profile.js'
import { gatherFacts, gate, applyReports, hire, REPORT, DECISION_RULE, initiativeLine, charterText } from '../../company/lib/cycle.js'
import { now, newId, str, clip, slug } from './store.js'
import { kindOf } from './leaders.js'

const S = { type: 'string' }
const tool = (name, description, properties = {}, required = Object.keys(properties)) => ({ name, description, inputSchema: { type: 'object', properties, required } })

export const deptLeaderId = depId => `dept-${slug(depId, 20)}`
export const COO_ID = 'coo'

export const COO_TOOLS = [
  tool('direct_department', 'Give a department head a directive now. It works it in the background with its teams and reports back to you as an event; give several departments directives at once when the work is independent. Continue an existing initiative (initiativeId) before starting a new one (newInitiative).', {
    department: { type: 'string', enum: [] },
    initiativeId: { type: 'string', description: 'id of an existing initiative, or empty for a new one' },
    newInitiative: { type: 'object', properties: { title: S, thesis: S, kind: { type: 'string', enum: P.initiativeKinds } }, required: ['title', 'thesis'] },
    brief: { type: 'string', description: 'self-contained brief: goal, what to examine, deliverable' },
    proof: { type: 'string', description: 'what result counts as evidence, and what result kills the initiative' },
  }, ['department', 'brief', 'proof']),
  tool('set_initiative', `Move an initiative to another stage (not "${P.gatedStage}": only the gate does that), kill it, or record your confidence.`, { id: S, stage: { type: 'string', enum: P.agentStages }, confidence: { type: 'number', description: '0..1' }, note: S, attempts: { type: 'array', description: 'for a kill: the distinct approaches tried, each with its result (at least three)', items: { type: 'object', properties: { approach: S, result: S }, required: ['approach', 'result'] } }, exempt: { type: 'string', enum: ['duplicate', 'superseded', 'owner-asked', 'out-of-scope'] }, challenge: { type: 'string', description: 'id of a finished rescue challenge, to proceed with the kill after reading it' } }, ['id', 'stage', 'note']),
  tool('decide_build', 'Decide a build request from a department. ticket: open the ticket yourself now (give title, brief, doneWhen). forward: hand it to the CEO with your reason. drop: reject it with the reason.', { id: S, decision: { type: 'string', enum: ['ticket', 'forward', 'drop'] }, reason: S, title: S, brief: S, doneWhen: S, workstream: S }, ['id', 'decision', 'reason']),
  tool('hire', 'Ask HR for a new analyst in a department team when a missing skill blocks an initiative. It runs in the background; the result reaches you as an event.', { department: { type: 'string', enum: [] }, team: { type: 'string', description: `existing team name, or a new one starting with ${P.prefix}` }, need: S, why: S }),
  tool('write_brief', 'Write the brief for the owner (Markdown): state of the company, what was learned with numbers, what the gate decided, honest odds for the north star, what happens next. It is filed with the company briefs and the CEO is told.', { markdown: S, summary: { type: 'string', description: 'two sentences' } }),
]

export const DEPT_TOOLS = [
  tool('run_super_team', 'Give your super team (you as supervisor over your teams, all working in parallel) a task. It runs in the background; the result reaches you as an event. One super-team run at a time; use ask_team or ask_agent for more at once.', { message: S }),
  tool('report_to_coo', `Report on an initiative to the COO, in the fixed form. Code applies it: stage, confidence, evidence, build requests; proposals go to the gate. ${P.proposal.reportRule} ${P.prompts.report}`, { initiativeId: S, ...REPORT.properties, attempts: { type: 'array', description: 'for a kill: the distinct approaches tried, each with its result (at least three)', items: { type: 'object', properties: { approach: S, result: S }, required: ['approach', 'result'] } }, exempt: { type: 'string', enum: ['duplicate', 'superseded', 'owner-asked', 'out-of-scope'] }, challenge: { type: 'string', description: 'id of a finished rescue challenge, to proceed with the kill after reading it' } }, ['initiativeId', ...REPORT.required]),
]

export function toolsFor(kind, departments) {
  const fill = t => (t.inputSchema.properties.department ? { ...t, inputSchema: { ...t.inputSchema, properties: { ...t.inputSchema.properties, department: { type: 'string', enum: departments } } } } : t)
  return (kind === 'coo' ? COO_TOOLS : kind === 'dept' ? DEPT_TOOLS : []).map(fill)
}

/** Whether the COO and the department heads run as leaders now. */
export function companyLeadersOn(sa, s) {
  try { return s.settings.leaders?.company !== false && sa.co.continuous() } catch { return false }
}

const members = (registry, teams) => [...new Set(teams.flatMap(t => { try { return registry.getTeam(t).members } catch { return [] } }))]

/** Keep a leader record for the COO and each department head, matching the company's organisation. Cheap; safe to repeat. */
export function seedLeaders(sa) {
  const s = sa.store.read()
  const c = sa.co.read()
  const root = s.agents.find(a => !a.parent && kindOf(a) === 'super')
  if (!root || !c.ceo) return
  const on = companyLeadersOn(sa, s)
  const { registry } = sa.forge
  const want = [{
    id: COO_ID, kind: 'coo', title: 'COO', agent: c.ceo, parent: root.id,
    mission: 'Run the company day to day: keep every department working on the initiatives that most raise the odds of the north star, decide build requests, and brief the owner.',
    reports: { superTeams: c.departments.map(d => d.superTeamId).filter(Boolean), teams: c.departments.flatMap(d => d.teams), agents: [...new Set([...c.departments.map(d => d.lead), ...members(registry, c.departments.flatMap(d => d.teams))])] },
  }, ...c.departments.map(d => ({
    id: deptLeaderId(d.id), kind: 'dept', dept: d.id, title: d.name, agent: d.lead, parent: COO_ID, mission: d.mission,
    // the People head is the coach: it may improve any of the company's agents
    reports: { superTeams: d.superTeamId ? [d.superTeamId] : [], teams: [...d.teams], agents: d.id === 'people' ? registry.listAgents().filter(x => !x.invalid && P.isOurs(x.name)).map(x => x.name) : members(registry, d.teams) },
  }))]
  const sig = JSON.stringify([on, want.map(w => [w.id, w.agent, w.parent, w.reports])])
  if (sa.leadersSig === sig) return
  sa.leadersSig = sig
  sa.store.update(st => {
    for (const w of want) {
      const a = st.agents.find(x => x.id === w.id)
      if (a) Object.assign(a, { ...w, plan: a.plan, planHistory: a.planHistory, createdAt: a.createdAt, paused: !on })
      else st.agents.push({ ...w, createdAt: now(), paused: !on })
    }
    // a department that no longer exists
    for (const a of st.agents) if (kindOf(a) === 'dept' && !c.departments.some(d => deptLeaderId(d.id) === a.id)) a.paused = true
  })
}

/** Deterministic facts of the profile, at most every 5 minutes (they read the engine's files). */
function facts(sa) {
  if (sa.factsCache && Date.now() - sa.factsCache.at < 5 * 60_000) return sa.factsCache.v
  let v = {}
  try { v = gatherFacts(sa.co, () => {}) } catch (e) { v = { error: e.message } }
  sa.factsCache = { at: Date.now(), v }
  return v
}

// ---------------------------------------------------------------- context
export function companyContext(sa, me) {
  const c = sa.co.read()
  const s = sa.store.read()
  const lead = id => s.agents.find(a => a.id === id)
  const evalsOf = id => s.evals.filter(e => e.agent === id && e.status === 'running').length
  if (kindOf(me) === 'coo') {
    return [
      `# Departments (their heads work in the background and report to you)\n${c.departments.map(d => { const l = lead(deptLeaderId(d.id)); return `- ${d.id} "${d.name}", head ${d.lead}${evalsOf(deptLeaderId(d.id)) ? ' (thinking now)' : ''}; open initiatives ${c.initiatives.filter(i => i.department === d.id && !['killed', P.gatedStage].includes(i.stage)).length}; super team ${d.superTeamId ?? '-'}${d.superTeamId && sa.co.supers.list().find(x => x.id === d.superTeamId)?.busy ? ' (busy)' : ''}; its plan: ${clip(l?.plan?.focus ?? '(none)', 200)}` }).join('\n')}`,
      `# Initiatives\n${c.initiatives.filter(i => i.stage !== 'killed').map(initiativeLine).join('\n') || '(none yet)'}\nKilled so far: ${c.initiatives.filter(i => i.stage === 'killed').slice(-8).map(i => i.title).join('; ') || 'none'}`,
      `# ${P.text.ordersTitle} so far\n${c.orders.map(P.orderLine).join('\n') || '(none)'}`,
      `# Build requests waiting for your decision (decide_build)\n${c.builds.filter(b => b.status === 'requested').map(b => `- ${b.id} ${b.title} (${b.department}): ${clip(b.spec, 300)} Expected value: ${clip(b.expectedValue, 160)}`).join('\n') || '(none)'}`,
      `# Facts measured by code\n${clip(JSON.stringify(facts(sa), null, 1), 6000)}`,
      `# Rules for decisions\n${DECISION_RULE}`,
    ].join('\n\n')
  }
  const d = c.departments.find(x => x.id === me.dept)
  if (!d) return '# Department\n(this department no longer exists)'
  const { registry } = sa.forge
  return [
    `# Your department: ${d.name}\nMission: ${d.mission}\nYou are its head (${d.lead}); you report to the COO.\nTeams:\n${d.teams.map(t => { try { const x = registry.getTeam(t); return `- ${t}: ${x.description ?? ''} [${x.members.join(', ')}]` } catch { return `- ${t} (missing)` } }).join('\n')}\nSuper team: ${d.superTeamId ?? '(none: use ask_team and ask_agent)'}${d.superTeamId && sa.co.supers.list().find(x => x.id === d.superTeamId)?.busy ? ' (running now)' : ''}`,
    `# Your initiatives\n${c.initiatives.filter(i => i.department === d.id && i.stage !== 'killed').map(initiativeLine).join('\n') || '(none: wait for a directive from the COO, or plan what you would propose)'}`,
    `# How to report\nReport with report_to_coo when you have evidence, not before. Evidence: one line per claim with its source file or data and its strength (measured, simulated, argued). Confidence: ${P.prompts.confidence}. ${P.proposal.reportRule}`,
    `# Facts measured by code\n${clip(JSON.stringify(facts(sa), null, 1), 4000)}\n${P.prompts.deptExtra(facts(sa))}`,
  ].join('\n\n')
}

// ---------------------------------------------------------------- tools
/** The COO's and the department heads' own tools. Returns undefined for a tool that is not theirs. */
export async function companyAct(sa, me, name, a, ctx) {
  const co = sa.co
  const kind = kindOf(me)
  if (kind === 'coo') {
    switch (name) {
      case 'direct_department': {
        const c = co.read()
        const d = c.departments.find(x => x.id === a.department)
        if (!d) throw new Error(`no department ${a.department}`)
        const brief = str(a.brief, 8000).trim()
        if (brief.length < 60) throw new Error('give a self-contained brief (60+ characters)')
        const ini = co.update(s => {
          let i = a.initiativeId ? s.initiatives.find(x => x.id === a.initiativeId && x.stage !== 'killed') : null
          if (a.initiativeId && !i) throw new Error(`no open initiative ${a.initiativeId}`)
          if (!i) {
            const n = a.newInitiative ?? {}
            i = { id: newId('i'), title: str(n.title || brief, 120).split('\n')[0], thesis: str(n.thesis || brief, 1500), kind: P.initiativeKinds.includes(n.kind) ? n.kind : P.initiativeKinds[0], department: d.id, stage: P.stages[0], confidence: null, createdAt: now(), history: [{ ts: now(), cycle: me.id, stage: P.stages[0], note: 'started by the COO' }] }
            s.initiatives.push(i)
          }
          i.directive = { ts: now(), by: me.id, brief: str(brief, 2000), proof: str(a.proof, 1000) }
          return { id: i.id, title: i.title }
        })
        sa.trigger({ source: 'coo', kind: 'directive', to: deptLeaderId(d.id), lane: `ini:${ini.id}`, text: `Directive from the COO for initiative "${ini.title}" (${ini.id}):\n${brief}\n\nProof the COO expects: ${str(a.proof, 2000)}\n\nWork it with your teams (run_super_team, ask_team, ask_agent), plan the steps in your plan, and report with report_to_coo (initiativeId ${ini.id}) when you have evidence.` })
        return `Directed ${d.name} on initiative ${ini.id} "${ini.title}". Its report reaches you as an event.`
      }
      case 'set_initiative': {
        if (!P.agentStages.includes(a.stage)) throw new Error(`stage must be one of ${P.agentStages.join(', ')}`)
        if (a.stage === 'killed') {
          const ini = co.read().initiatives.find(x => x.id === a.id)
          const wait = sa.growth?.guard(me, { action: 'kill the initiative', ref: a.id, title: ini?.title ?? a.id, attempts: a.attempts, exempt: a.exempt, challenge: a.challenge })
          if (wait) return wait
        }
        co.update(s => {
          const i = s.initiatives.find(x => x.id === a.id)
          if (!i) throw new Error(`no initiative ${a.id}`)
          if (i.stage === P.gatedStage || i.awaitingOwner) throw new Error('the gate decided this one; it cannot be moved')
          i.stage = a.stage
          if (Number.isFinite(Number(a.confidence))) { i.confidence = Math.round(1000 * Math.min(1, Math.max(0, Number(a.confidence)))) / 1000; i.confidenceBasis = 'COO estimate' }
          i.note = str(a.note, 800)
          i.history.push({ ts: now(), cycle: me.id, stage: i.stage, note: i.note })
        })
        return `Initiative ${a.id} is now ${a.stage}.`
      }
      case 'decide_build': {
        const b = co.read().builds.find(x => x.id === a.id)
        if (!b) throw new Error(`no build request ${a.id}`)
        if (b.status !== 'requested') throw new Error(`build ${a.id} is already ${b.status}`)
        const reason = str(a.reason, 800).trim()
        if (reason.length < 10) throw new Error('give the reason')
        if (a.decision === 'drop') { co.setBuild(b.id, 'dropped'); return `Dropped build ${b.id}.` }
        if (a.decision === 'forward') {
          const root = sa.store.read().agents.find(x => !x.parent)
          co.setBuild(b.id, 'accepted')
          sa.trigger({ source: 'coo', kind: 'build-request', to: root?.id ?? 'ceo', text: `The COO forwards build ${b.id} from ${b.department}: ${b.title}\nSpec: ${b.spec}\nExpected value: ${b.expectedValue}\nWhy the COO forwards it: ${reason}\nPass build: "${b.id}" to open_ticket when you take it.` })
          return `Forwarded build ${b.id} to the CEO.`
        }
        return sa.openTicketFor(me, { title: a.title || b.title, brief: a.brief || `${b.spec}\n\nExpected value: ${b.expectedValue}\n\nWhy now: ${reason}`, doneWhen: a.doneWhen || 'The spec above is built and verified, with the evidence in the folder.', build: b.id, workstream: a.workstream }, ctx)
      }
      case 'hire': {
        const h = { department: String(a.department), team: str(a.team, 60), need: str(a.need, 400), why: str(a.why, 600) }
        return sa.startJob(me, 'hire', `${h.department}/${h.team}`, `${h.need} (${h.why})`, ctx.lane, async api => {
          const r = await hire(co, api, h, me.id)
          return r ? `Hire result: ${r}` : 'No hire was made (limits, HR review or a name clash; see the company log).'
        })
      }
      case 'write_brief': {
        const md = str(a.markdown, 60000).trim()
        if (md.length < 200) throw new Error('the brief is too short to be useful to the owner')
        const r = co.recordReview({ by: me.id, markdown: `# COO brief ${now().slice(0, 10)}\n\n${md}`, summary: str(a.summary, 600) })
        sa.say({ from: me.id, kind: 'message', text: `New COO brief: ${str(a.summary, 600)} (${path.join(co.reports, r.report)})` })
        return `Filed as ${r.report}. The CEO is told.`
      }
    }
  }
  if (kind === 'dept') {
    const d = co.read().departments.find(x => x.id === me.dept)
    if (!d) throw new Error('this department no longer exists')
    switch (name) {
      case 'run_super_team': {
        if (!d.superTeamId) throw new Error('your department has no super team: use ask_team or ask_agent')
        const msg = `${str(a.message, 12000)}\n\nCompany charter:\n${charterText(co.read().charter)}\n\n${P.prompts.deptExtra(facts(sa))}`
        return sa.startJob(me, 'super-team', d.superTeamId, msg, ctx.lane)
      }
      case 'report_to_coo': {
        const c = co.read()
        const ini = c.initiatives.find(x => x.id === a.initiativeId && x.department === d.id)
        if (!ini) throw new Error(`no initiative ${a.initiativeId} in your department`)
        const report = Object.fromEntries(REPORT.required.map(k => [k, a[k]]))
        if (report.recommendedStage === 'killed') {
          const wait = sa.growth?.guard(me, { action: 'recommend killing the initiative', ref: ini.id, title: ini.title, attempts: a.attempts, exempt: a.exempt, challenge: a.challenge })
          if (wait) return wait
        }
        if (str(report.summary, 4000).trim().length < 40) throw new Error('the summary is too short')
        applyReports(co, [{ department: d.id, initiativeId: ini.id, report }], me.id)
        try { sa.perf?.judge({ key: `dep:${d.id}`, gapWho: d.lead, task: ini.directive?.brief ?? ini.title, result: `${report.summary}\nEvidence:\n${(report.evidence ?? []).map(e => `- (${e.strength}) ${e.claim} [${e.source}]`).join('\n')}\nRecommended: ${report.recommendedStage}, confidence ${report.confidence}`, by: me.id }) } catch {}
        const props = (report.proposals ?? []).filter(p => P.proposal.has(p)).slice(0, 2)
        for (const p of props) runGate(sa, me, ini, p)
        sa.trigger({ source: 'department', kind: 'department-report', to: COO_ID, lane: `ini:${ini.id}`, text: `${d.name} reports on "${ini.title}" (${ini.id}): recommended stage ${report.recommendedStage}, confidence ${report.confidence}.\n${clip(report.summary, 3000)}\nEvidence:\n${(report.evidence ?? []).slice(0, 12).map(e => `- (${e.strength}) ${clip(e.claim, 200)} [${clip(e.source, 120)}]`).join('\n') || '-'}\nBlockers: ${(report.blockers ?? []).join('; ') || '-'}\nBuild requests: ${(report.buildSpecs ?? []).map(b => b.title).join('; ') || '-'}\nProposals sent to the gate: ${props.map(p => p.name).join(', ') || 'none'}\nDecide what follows: the next directive, a stage change, a kill, or nothing.` })
        return `Reported. Code applied it to ${ini.id}${props.length ? `; ${props.length} proposal(s) went to the gate, the result reaches you and the COO` : ''}.`
      }
    }
  }
  return undefined
}

/** A department proposal through the company gate, in the background. Limited per day like ticket proposals. */
function runGate(sa, me, ini, p) {
  const s = sa.store.read()
  const charter = sa.co.read().charter
  if (sa.store.day(s).gates >= charter.gate.maxProposalsPerCycle) {
    sa.trigger({ source: 'gate', kind: 'gate', to: me.id, lane: `ini:${ini.id}`, text: `The proposal "${p.name}" was not sent to the gate: the limit of ${charter.gate.maxProposalsPerCycle} gate runs a day is reached.` })
    return
  }
  sa.store.update(x => { sa.store.day(x).gates++ })
  const { done } = sa.forge.engine.startCustom(`gate: ${slug(p.name, 40)}`, async api => gate(sa.co, api, { ...p, initiativeId: ini.id, department: me.dept }, { cycleId: me.id, charter, facts: facts(sa) }), { proposal: p.name, initiative: ini.id }, { cwd: P.projectDir, meta: { superGate: ini.id } })
  done.then(st => {
    sa.co.charge(st.costUsd, `gate ${p.name}`)
    const g = st.result
    const text = g ? (g.passed ? `PASSED (${P.text.scoreLabel} ${g.order.pImprove}, required ${g.order.required})${g.order.status === 'awaiting-owner' ? '; the owner is asked to approve it' : ''}.` : `failed: ${g.reasons.join('; ')}`) : `the gate run ${st.status}`
    sa.say({ from: 'gate', kind: 'gate', text: `Gate result for "${p.name}" (${ini.title}): ${text}` })
    for (const to of [me.id, COO_ID]) sa.trigger({ source: 'gate', kind: 'gate', to, lane: `ini:${ini.id}`, text: `Gate result for proposal "${p.name}" on initiative ${ini.id}: ${text}` })
  }).catch(e => sa.log(`gate ${p.name}: ${e.message}`))
}

