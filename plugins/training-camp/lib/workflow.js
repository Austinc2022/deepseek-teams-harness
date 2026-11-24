/**
 * The workflow of a camp: what the architect proposes, what the owner changes, and what gets published.
 *
 *   { summary, rationale, alternatives: [..],
 *     stages: [{ id, title, purpose, kind, role, reviewer, reviewRounds, inputs, deliverable, acceptance, notes, group }],
 *     roles:  [{ name, description, kind: 'analyst' | 'builder', base, role, skills }],
 *     teams:  [{ name, description, members }] }
 *
 * A role is one agent. `base` names an existing forge agent to start from; a role whose name is an existing agent
 * trains that agent in place (the old file is backed up when the camp publishes).
 */
import fs from 'node:fs'
import path from 'node:path'
import { hash, slug } from './store.js'

const NAME = /^[a-z][a-z0-9-]{0,47}$/
const STAGE_ID = /^[a-z][a-z0-9-]{0,31}$/
export const KINDS = ['analyst', 'builder']
const str = (v, max) => String(v ?? '').trim().slice(0, max)
const list = (v, max, each) => (Array.isArray(v) ? v : []).map(x => str(x, each)).filter(Boolean).slice(0, max)

export const WORKFLOW_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'the workflow in two or three sentences' },
    rationale: { type: 'string', description: 'why these stages, in this order, give the best chance of reaching the goal' },
    alternatives: { type: 'array', items: { type: 'string' }, description: 'other workflow shapes you considered and why you did not choose them' },
    changes: { type: 'array', items: { type: 'string' }, description: 'on a revision: what you changed and what you did not change, and why' },
    stages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'short lowercase id with dashes, e.g. demand-evaluation' },
          title: { type: 'string' },
          purpose: { type: 'string', description: 'what this stage must find out or produce, and why the workflow needs it' },
          kind: { type: 'string', enum: ['work', 'decision'], description: 'decision = a go / stop gate that can end the workflow' },
          role: { type: 'string', description: 'name of the role (agent) that does this stage' },
          reviewer: { type: 'string', description: 'optional: name of a role that reviews the result against the acceptance criteria' },
          reviewRounds: { type: 'number', description: '0 to 2 review-and-revise rounds when there is a reviewer' },
          inputs: { type: 'array', items: { type: 'string' }, description: 'ids of earlier stages whose results this stage reads' },
          deliverable: { type: 'string', description: 'exactly what the stage hands over' },
          acceptance: { type: 'array', items: { type: 'string' }, description: '3 to 6 criteria a reviewer can check' },
          group: { type: 'string', description: 'optional: consecutive stages with the same group run in parallel' },
        },
        required: ['id'],
      },
    },
    roles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'lowercase letters, digits and dashes, at most 48 characters' },
          description: { type: 'string', description: 'one line' },
          kind: { type: 'string', enum: KINDS, description: 'analyst = read-only research, judgement and writing; builder = writes and runs files in a sandbox' },
          base: { type: 'string', description: 'optional: an existing agent to start from' },
          role: { type: 'string', description: 'the role text: what the agent does, what it must deliver, what evidence it must give, what it must not do' },
          skills: { type: 'array', items: { type: 'string' }, description: 'names of installed skills that fit' },
        },
        required: ['name'],
      },
    },
    teams: {
      type: 'array',
      items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, members: { type: 'array', items: { type: 'string' } } }, required: ['name', 'members'] },
    },
  },
  required: ['summary', 'stages', 'roles'],
}

/** Clean and check a workflow from the architect or from the owner's own edit. Throws with a plain message. */
export function normalizeWorkflow(w, { agentExists = () => false, skillExists = () => true } = {}) {
  if (!w || typeof w !== 'object') throw new Error('the workflow must be an object')
  const roles = (Array.isArray(w.roles) ? w.roles : []).map(r => {
    const name = slug(r?.name, 48)
    if (!NAME.test(name)) throw new Error(`role name "${r?.name}" is not valid: use lowercase letters, digits and dashes, starting with a letter`)
    const base = r.base ? slug(r.base, 48) : undefined
    return {
      name, description: str(r.description, 300), kind: KINDS.includes(r.kind) ? r.kind : 'analyst',
      ...(base && agentExists(base) ? { base } : {}),
      role: str(r.role, 8000), skills: list(r.skills, 12, 48).filter(s => NAME.test(s) && skillExists(s)),
    }
  })
  if (!roles.length) throw new Error('the workflow needs at least one role')
  if (new Set(roles.map(r => r.name)).size !== roles.length) throw new Error('two roles have the same name')
  const has = n => roles.some(r => r.name === n)
  const seen = []
  const stages = (Array.isArray(w.stages) ? w.stages : []).map(s => {
    const id = slug(s?.id ?? s?.title, 32)
    if (!STAGE_ID.test(id)) throw new Error(`stage id "${s?.id}" is not valid`)
    if (seen.includes(id)) throw new Error(`two stages have the id "${id}"`)
    const role = slug(s.role, 48)
    if (!has(role)) throw new Error(`stage "${id}" names the role "${s.role}", which is not in the list of roles`)
    const reviewer = s.reviewer ? slug(s.reviewer, 48) : undefined
    if (reviewer && !has(reviewer)) throw new Error(`stage "${id}" names the reviewer "${s.reviewer}", which is not in the list of roles`)
    const kind = s.kind === 'decision' ? 'decision' : 'work'
    const out = {
      id, title: str(s.title, 120) || id, purpose: str(s.purpose, 2000), kind, role,
      ...(reviewer && reviewer !== role && kind === 'work' ? { reviewer, reviewRounds: Math.max(0, Math.min(2, Math.round(Number(s.reviewRounds ?? 1)) || 0)) } : {}),
      inputs: list(s.inputs, 12, 32).map(i => slug(i, 32)).filter(i => seen.includes(i)),
      deliverable: str(s.deliverable, 2000), acceptance: list(s.acceptance, 8, 400),
      ...(s.notes ? { notes: str(s.notes, 2000) } : {}), ...(s.group ? { group: slug(s.group, 24) } : {}),
    }
    seen.push(id)
    return out
  })
  if (!stages.length) throw new Error('the workflow needs at least one stage')
  // stages in one parallel group cannot read each other
  for (const s of stages) if (s.group) s.inputs = s.inputs.filter(i => stages.find(x => x.id === i)?.group !== s.group)
  const used = new Set(stages.flatMap(s => [s.role, s.reviewer].filter(Boolean)))
  const kept = roles.filter(r => used.has(r.name))
  const teams = (Array.isArray(w.teams) ? w.teams : []).map(t => ({ name: slug(t?.name, 48), description: str(t?.description, 300), members: [...new Set(list(t?.members, 30, 48).map(m => slug(m, 48)).filter(m => kept.some(r => r.name === m)))] }))
    .filter(t => NAME.test(t.name) && t.members.length)
  return { summary: str(w.summary, 2000), rationale: str(w.rationale, 4000), alternatives: list(w.alternatives, 6, 600), stages, roles: kept, teams }
}

/**
 * Merge the architect's answer to a change request into the current workflow: a stage given only by its id and a
 * role that is not mentioned are taken from the current workflow.
 */
export function mergeRevision(current, answer) {
  const bare = o => Object.keys(o ?? {}).filter(k => o[k] != null && o[k] !== '' && !(Array.isArray(o[k]) && !o[k].length)).length <= 1
  const oldStage = Object.fromEntries(current.stages.map(s => [s.id, s]))
  const stages = (Array.isArray(answer.stages) ? answer.stages : []).map(s => {
    const id = slug(s?.id ?? s?.title, 32)
    return bare(s) && oldStage[id] ? oldStage[id] : oldStage[id] ? { ...oldStage[id], ...s, id } : s
  })
  const named = new Map((Array.isArray(answer.roles) ? answer.roles : []).map(r => [slug(r?.name, 48), r]))
  const roles = current.roles.map(r => { const n = named.get(r.name); named.delete(r.name); return n && !bare(n) ? { ...r, ...n, name: r.name } : r })
  for (const r of named.values()) if (!bare(r)) roles.push(r)
  return { ...answer, stages: stages.length ? stages : current.stages, roles, teams: Array.isArray(answer.teams) && answer.teams.length ? answer.teams : current.teams }
}

/** What a role is asked to do: when this changes, its datasets and scores are stale. */
export function roleContract(wf, name) {
  const r = wf.roles.find(x => x.name === name)
  const stages = wf.stages.filter(s => s.role === name || s.reviewer === name).map(s => ({ id: s.id, as: s.role === name ? 'owner' : 'reviewer', kind: s.kind, purpose: s.purpose, deliverable: s.deliverable, acceptance: s.acceptance }))
  return hash({ kind: r?.kind, stages })
}

export function workflowText(wf) {
  return [
    wf.summary,
    '', 'Stages:',
    ...wf.stages.map((s, i) => `  ${i + 1}. ${s.title} [${s.id}${s.kind === 'decision' ? ', go/stop decision' : ''}${s.group ? `, parallel group ${s.group}` : ''}] by ${s.role}${s.reviewer ? `, reviewed by ${s.reviewer} (${s.reviewRounds} round${s.reviewRounds === 1 ? '' : 's'})` : ''}\n     ${s.purpose}\n     Deliverable: ${s.deliverable}${s.inputs.length ? `\n     Reads: ${s.inputs.join(', ')}` : ''}`),
    '', 'Roles:',
    ...wf.roles.map(r => `  - ${r.name} (${r.kind}${r.base ? `, starts from ${r.base}` : ''}): ${r.description}`),
    ...(wf.teams.length ? ['', 'Teams:', ...wf.teams.map(t => `  - ${t.name}: ${t.members.join(', ')}`)] : []),
    ...(wf.alternatives?.length ? ['', 'Alternatives considered:', ...wf.alternatives.map(a => `  - ${a}`)] : []),
  ].join('\n')
}

const RULES = `Rules for the workflow:
- 4 to 10 stages for a small team, up to 24 when the owner asks for a large organisation. Every stage has one owner role, a concrete deliverable and acceptance criteria that someone else can check.
- Put a decision stage (kind "decision") after each evaluation, so weak work is stopped early instead of carried forward.
- Cheap evidence comes before expensive work: find and test demand before building, build small demos before a full product.
- One role can own several stages, and one role can review another role's stage. Prefer few, sharp roles over many vague ones, unless the owner asks for many specialists.
- Specialists work side by side: give each specialist its own stage with its own deliverable, and give consecutive stages the same "group" so they run in parallel (stages in one group cannot read each other; a later integration stage reads them all). Up to 30 roles.
- Keep it compact: a role's "role" text under 120 words, a stage's purpose and deliverable under 60 words each.
- Role kind "analyst" is read-only (research, judgement, writing; it answers in text). Role kind "builder" writes and runs files in a sandbox. Use a builder only where files must be built.
- Reuse an existing agent when one fits, as a starting point: give the role a NEW name and set "base" to that agent. The existing agent then stays as it is, and the trained copy is published beside it. Give a role the name of an existing agent only when the owner asks to retrain that agent itself; publishing then replaces it.
- Nothing in the workflow publishes, sells, spends money or contacts people; those are the owner's decisions. A stage may prepare them.
- Group roles into teams by the part of the workflow they serve.`

export function proposePrompt({ goal, hint, catalog }) {
  return [
    `Design the workflow that a team of AI agents should follow to reach this goal:\n\n${goal}`,
    hint ? `The owner's first idea of the workflow (treat it as a starting point; keep what is sound, fix what is weak and say what you changed in "alternatives"):\n${hint}` : '',
    RULES,
    `Existing agents:\n${catalog.agents || '(none)'}`,
    `Installed skills:\n${catalog.skills || '(none)'}`,
    'Be honest in "rationale" about what this workflow cannot guarantee.',
  ].filter(Boolean).join('\n\n')
}

export function revisePrompt({ goal, workflow, feedback, history, catalog }) {
  return [
    `Goal:\n${goal}`,
    `Current workflow (JSON):\n${JSON.stringify(workflow, null, 2)}`,
    history?.length ? `Earlier change requests from the owner, already applied:\n${history.map(h => `- ${h}`).join('\n')}` : '',
    `The owner asks for this change:\n${feedback}`,
    `Apply the request faithfully and change nothing else unless the request forces it. If the request would weaken the workflow, apply it anyway and say so in "changes".

How to answer, so that a large workflow fits in one answer:
- "stages" is the complete list of stages in their final order. For a stage you do NOT change, give only {"id": "<its id>"}; it is kept exactly as it is. For a stage you add or change, give all of its fields. A stage that is missing from the list is removed.
- "roles" lists only the roles you ADD or CHANGE, with all of their fields. Existing roles you do not mention are kept as they are (a role that no stage uses any more is dropped by itself).
- "teams" is the complete list of teams, since it is short.
- Keep a new role's "role" text under 120 words, a stage's "purpose" and "deliverable" under 60 words each, and 3 or 4 acceptance criteria per stage.`,
    RULES,
    `Existing agents:\n${catalog.agents || '(none)'}`,
    `Installed skills:\n${catalog.skills || '(none)'}`,
  ].filter(Boolean).join('\n\n')
}

/** Source of the orchestration a camp publishes. It imports runflow.js from this plugin. */
export function orchestrationSource({ name, camp, workflow, orchestrationsDir, team }) {
  // both sides resolved, because Node resolves a module's own path through symlinks before a relative import
  const lib = path.relative(fs.realpathSync(orchestrationsDir), fs.realpathSync(path.join(import.meta.dirname, 'runflow.js'))).split(path.sep).join('/')
  const meta = {
    name, description: `${clipLine(workflow.summary, 220)} (trained by training camp ${camp.id}, workflow v${camp.workflowVersion})`,
    ...(team ? { team } : {}),
    args: { goal: 'What to achieve (required)', cwd: 'Absolute folder to work in (default: a new folder under forge/workspaces)' },
  }
  return `// Published by training camp ${camp.id} ("${camp.name}"), workflow v${camp.workflowVersion}.
// Do not edit by hand: change the workflow in the camp and publish again.
export const meta = ${JSON.stringify(meta, null, 2)}

import path from 'node:path'
import { runWorkflow, workflowReport } from '${lib.startsWith('.') ? lib : `./${lib}`}'

const WORKFLOW = ${JSON.stringify({ stages: workflow.stages }, null, 2)}

export default async function (api) {
  const goal = String(api.args.goal ?? '').trim()
  if (!goal) throw new Error('goal is required')
  const cwd = api.args.cwd ? path.resolve(String(api.args.cwd)) : path.join(api.run.cwd, '${name}-' + api.run.id)
  api.log('working folder: ' + cwd)
  const full = { ...api, agent: (n, p, o = {}) => api.agent(n, p, { ...o, full: true }) }
  const out = await runWorkflow(full, WORKFLOW, { goal, cwd })
  const report = workflowReport(WORKFLOW, out, 12000)
  api.save('report.md', report)
  return report
}
`
}

const clipLine = (s, n) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n)
