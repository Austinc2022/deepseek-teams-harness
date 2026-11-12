/**
 * Staffing: one decision path for "this work needs someone", used by the super agents (the staff tool) and by COO
 * hiring. Cheapest rung first; capability decides the definition, purpose decides the memory:
 *
 *   reuse      capability fits and this purpose already has its memory          -> same agent, same memory
 *   instance   capability fits, new purpose                                      -> same definition, new memory now
 *   fork       capability fits, purpose close to one it already has             -> new memory seeded from that one
 *   fresh      the purpose is to challenge earlier conclusions                   -> new memory, measured facts only
 *   update     a change would make the agent better for ALL its uses             -> improve it, then an instance
 *   clone      capability almost fits; the change is for this purpose only       -> new definition (clonedFrom)
 *   create     nothing fits                                                      -> new definition from the template
 * Judges are never instanced, forked or cloned. The HR reviewer (a judge) chooses the rung from the candidates
 * code found; code checks the choice and carries it out. Every decision is recorded with its reason.
 */
import { listInstances, ensureInstance, purposeSlug, score, tokens, agentKind, memoryDir } from '../../agent-forge/lib/memory.js'
import { profile as P } from './profile.js'
import { FORGE_HOME, now, str } from './paths.js'
import { kb } from './knowledge-hooks.js'
import { agentNameProblem, teamNameProblem } from './naming.js'

export const ACTIONS = ['reuse', 'instance', 'fork', 'fresh', 'update', 'clone', 'create']
const S = { type: 'string' }
const DECISION = {
  type: 'object', additionalProperties: false,
  required: ['action', 'agent', 'forkFrom', 'cloneName', 'change', 'reason', 'overlap'],
  properties: {
    action: { type: 'string', enum: ACTIONS },
    agent: { type: 'string', description: 'the existing agent the decision is about; empty for create' },
    forkFrom: { type: 'string', description: 'for fork: the purpose of that agent to start from; else empty' },
    cloneName: { type: 'string', description: `for clone: the new name, ${P.prefix}<specialty>-<function>; else empty` },
    change: { type: 'string', description: 'for update or clone: the role text to add (what is different and why); else empty' },
    reason: { type: 'string', description: 'one or two sentences the owner can follow' },
    overlap: { type: 'number', description: '0..1: how much the best existing agent already covers the need' },
  },
}

/** Agents that could do the work, with capability fit and the purposes they already remember. */
export function candidates(registry, need, { limit = 6 } = {}) {
  const q = tokens(`${need.capability} ${need.purpose ?? ''}`)
  const insts = listInstances(FORGE_HOME)
  const pq = tokens(need.purpose ?? '')
  // leads coordinate (COO, department heads, HR): they are not staffed onto work themselves
  const leads = new Set([P.name?.('ceo'), P.recruiterName, P.peopleLeadName, ...(P.departments ?? []).map(d => d.lead), ...(need.excludeLeads ?? [])].filter(Boolean))
  return registry.listAgents().filter(a => !a.invalid && P.isOurs(a.name) && !leads.has(a.name)).map(a => { try { return registry.getAgent(a.name) } catch { return null } }).filter(Boolean)
    .filter(d => !(d.tags ?? []).includes('super-agent') || (d.tags ?? []).includes('builder'))
    .filter(d => agentKind(d) !== 'judge' && agentKind(d) !== 'dreamer')
    // the advisory team works for the owner, not for the company's work
    .filter(d => !P.advisoryNames?.has(d.name))
    .filter(d => (need.kind === 'builder') === (agentKind(d) === 'builder'))
    .map(d => {
      const fit = score(q, `${d.name.replace(/-/g, ' ')} ${d.description} ${d.description} ${String(d.role ?? '').slice(0, 2000)}`)
      const mine = insts.filter(i => i.agent === d.name || i.owner === d.name)
      const related = mine.map(i => ({ purpose: i.purpose, s: score(pq, String(i.purpose).replace(/-/g, ' ')) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s)
      const facts = need.purpose ? kb().search(need.purpose, { areas: P.tags, limit: 30 }).filter(f => f.by === d.name).length : 0
      return { name: d.name, description: d.description, model: d.model, fit: Math.round(fit * 100) / 100, purposes: mine.map(i => i.purpose).slice(0, 8), related: related.slice(0, 3).map(x => x.purpose), exact: mine.some(i => i.slug === purposeSlug(need.purpose ?? '')), factsByIt: facts }
    })
    .sort((a, b) => b.fit - a.fit).slice(0, limit)
}

/**
 * Decide. need: { capability, purpose, kind: analyst|builder, fresh?, parallel?, name?, description?, role? }
 * api: an engine run api (for the HR reviewer). Returns { action, agent, forkFrom, cloneName, change, reason, candidates }.
 */
export async function decide(registry, api, need) {
  if (str(need.capability, 2000).trim().length < 20) throw new Error('describe the capability needed (20+ characters): what the work is and what a good result looks like')
  if (!str(need.purpose, 200).trim()) throw new Error('name the purpose (the initiative, workstream or question this is for)')
  const cands = candidates(registry, need)
  const best = cands[0]
  const fallback = () => {
    if (!best || best.fit < 1.2) return { action: 'create', agent: '', reason: best ? `the best existing agent (${best.name}) fits weakly (${best.fit})` : 'no existing agent of this kind' }
    if (best.exact) return { action: 'reuse', agent: best.name, reason: `${best.name} fits (${best.fit}) and already works on this purpose` }
    if (need.fresh) return { action: 'fresh', agent: best.name, reason: `${best.name} fits (${best.fit}); fresh eyes were asked for` }
    if (best.related.length) return { action: 'fork', agent: best.name, forkFrom: best.related[0], reason: `${best.name} fits (${best.fit}) and works on a related purpose (${best.related[0]})` }
    return { action: 'instance', agent: best.name, reason: `${best.name} fits (${best.fit}); this purpose gets its own memory` }
  }
  let d = null
  try {
    if (api && registry.getAgent(P.reviewerName)) {
      d = await api.agent(P.reviewerName, [
        'A unit of the company needs someone for a piece of work. Choose how to staff it, cheapest rung first:',
        ACTIONS.map(a => `- ${a}`).join('\n'),
        'Rules: reuse when an agent fits and already has this purpose (exact = true). instance when an agent fits and the purpose is new. fork when it fits and has a related purpose worth starting from (name it in forkFrom). fresh when the work must challenge earlier conclusions. update when the agent fits except for something that would improve it for every use. clone when it almost fits but the change is for this purpose only. create only when nothing fits; then say what no existing agent covers.',
        `# The need\nCapability: ${str(need.capability, 2000)}\nPurpose: ${str(need.purpose, 200)}\nKind: ${need.kind ?? 'analyst'}${need.fresh ? '\nFresh eyes asked for: yes' : ''}${need.parallel ? '\nRuns in parallel with other work: yes' : ''}`,
        `# Candidates (fit is keyword overlap with the role; purposes are what each already remembers)\n${cands.map(c => `- ${c.name} (fit ${c.fit}, ${c.model}): ${c.description}\n  purposes: ${c.purposes.join(', ') || 'none'}; related: ${c.related.join(', ') || 'none'}; exact: ${c.exact}`).join('\n') || '(none of this kind)'}`,
      ].join('\n\n'), { schema: DECISION, label: 'hr:staffing' })
    }
  } catch { d = null }
  if (!d || !ACTIONS.includes(d.action)) d = { ...fallback(), source: 'code' }
  else d.source = 'hr-reviewer'
  // code checks the choice
  const known = cands.find(c => c.name === d.agent)
  if (d.action !== 'create' && !known) d = { ...fallback(), source: 'code', note: `the reviewer named "${d.agent}", which is not a candidate` }
  if (d.action === 'fork' && !(known?.purposes ?? []).includes(d.forkFrom)) d = { ...d, action: known?.related?.[0] ? 'fork' : 'instance', forkFrom: known?.related?.[0] ?? '' }
  if (need.fresh && ['reuse', 'instance', 'fork'].includes(d.action)) d = { ...d, action: 'fresh', forkFrom: '' }
  if (d.action === 'clone' && agentNameProblem(d.cloneName, P.prefix)) d = { ...d, cloneName: need.name ?? '' }
  return { ...d, candidates: cands }
}

/** The handle other tools use for an agent working on a purpose. */
export const handleOf = (agent, purpose) => `${agent}@${purposeSlug(purpose)}`

/**
 * Carry out a decision for an agent. create is done by the caller (the super agent's createAgent or HR hiring),
 * because each has its own template and limits; it passes createFn. Returns { handle, agent, text }.
 */
export async function apply(registry, d, need, { createFn, updateFn, by } = {}) {
  const purpose = need.purpose
  let agent = d.agent
  if (d.action === 'create') {
    agent = await createFn(need, d)
  } else if (d.action === 'clone') {
    const name = d.cloneName || need.name
    const problem = agentNameProblem(name, P.prefix)
    if (problem) throw new Error(`clone needs a name that says its purpose: ${problem}`)
    const src = registry.getAgent(d.agent)
    registry.cloneAgent(d.agent, name, {
      description: str(need.description || `${src.description} (specialised: ${str(d.change, 120)})`, 300),
      role: `${src.role}\n\n# Specialisation (cloned from ${d.agent} on ${now().slice(0, 10)})\n${str(d.change || need.capability, 2000)}`,
      tags: [...new Set([...(src.tags ?? []), 'hired', 'cloned'])],
    })
    agent = name
  } else if (d.action === 'update' && d.change) {
    await updateFn?.(d.agent, d.change)
  }
  const def = registry.getAgent(agent)
  const kind = agentKind(def)
  let dir = null
  if (kind === 'stateful' && def.memory?.mode !== 'none') {
    dir = ensureInstance(FORGE_HOME, def, { purpose, team: need.team, fresh: d.action === 'fresh', forkFrom: d.action === 'fork' ? d.forkFrom : undefined, brief: need.capability, reason: `${d.action}: ${d.reason}` })
  }
  const handle = handleOf(agent, purpose)
  try { kb().add({ claim: `Staffing for "${purpose}": ${d.action} ${agent}${d.forkFrom ? ` (from ${d.forkFrom})` : ''}. ${str(d.reason, 400)}`, kind: 'decision', strength: 'argued', tier: 'agent', area: P.tags?.[0], purpose: String(purpose).startsWith('ini-') ? purpose : null, by: by ?? d.source, sourceKind: 'staffing', sourceRef: `staff:${handle}:${now()}`, volatility: 'org' }) } catch {}
  const memoryNote = kind !== 'stateful' ? `${agent} is stateless (${kind}): every run starts clean.` : dir ? `Its memory for this purpose: ${dir}${d.action === 'fresh' ? ' (fresh eyes: measured facts only)' : d.action === 'fork' ? ` (seeded from ${d.forkFrom})` : ''}.` : ''
  return { handle, agent, dir, text: `${d.action.toUpperCase()}: ${agent} for "${purpose}". ${d.reason}\n${memoryNote}\nUse it with ask_agent agent "${handle}".` }
}

/** Teams: reuse a team that fits (its memory for this purpose is made at once), or create one from existing agents. */
export function teamCandidates(registry, need) {
  const q = tokens(`${need.capability} ${need.purpose ?? ''}`)
  return registry.listTeams().filter(t => P.isOurs(t.name)).map(t => {
    const members = t.members.map(m => { try { return registry.getAgent(m) } catch { return null } }).filter(Boolean)
    const fit = score(q, `${t.name.replace(/-/g, ' ')} ${t.description ?? ''} ${t.description ?? ''} ${members.map(m => m.description).join(' ')}`)
    return { name: t.name, description: t.description, members: t.members, fit: Math.round(fit * 100) / 100 }
  }).sort((a, b) => b.fit - a.fit).slice(0, 6)
}

export function teamInstance(registry, team, need) {
  const t = registry.getTeam(team)
  const def = { name: team, description: t.description ?? '', tags: P.tags, memory: { mode: 'hybrid', scope: 'team' } }
  return ensureInstance(FORGE_HOME, def, { purpose: need.purpose, team, fresh: !!need.fresh, brief: need.capability, reason: 'team staffing' })
}

export { agentNameProblem, teamNameProblem, memoryDir }
