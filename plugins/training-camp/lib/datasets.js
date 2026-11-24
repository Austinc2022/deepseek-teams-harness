/**
 * Datasets: generated practice tasks (train, dev) and a sealed verification set (holdout) for every role, and
 * small end-to-end goals for the whole team.
 *
 * - train: where the coach reads failures and where new candidates are tried first
 * - dev: decides whether a candidate replaces the current best
 * - holdout: written by a different staff member (the sealer, by default a different model), stored under
 *   sealed/, used once at verification. The coach never sees its tasks or its results.
 *
 * When an existing agent is trained, real tasks it received in past runs are shown to the examiner as examples
 * of the job, so the practice tasks look like its real work.
 */
import fs from 'node:fs'
import path from 'node:path'
import { clip, hash } from './store.js'
import { TEAM } from './evaluate.js'

const CHECK_TYPES = ['contains', 'not-contains', 'regex', 'min-chars', 'max-chars', 'file-exists', 'file-contains', 'file-regex']

const TASKS = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'short and unique' },
          stage: { type: 'string', description: 'id of the workflow stage this task exercises (one of the ids listed in the request)' },
          input: { type: 'string', description: 'the complete task as the agent receives it: self-contained, with every fact it needs' },
          fixtures: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }, description: 'optional small input files placed in the agent\'s working folder (relative paths, under 4000 characters each)' },
          rubric: { type: 'array', items: { type: 'object', properties: { criterion: { type: 'string' }, weight: { type: 'number' } }, required: ['criterion', 'weight'] }, description: '3 to 5 criteria; each says what good work shows, concretely enough to grade' },
          checks: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: CHECK_TYPES }, value: { type: 'string' }, path: { type: 'string' }, must: { type: 'boolean' } }, required: ['type'] }, description: 'optional objective checks; only what is certain for every correct answer' },
        },
        required: ['title', 'input', 'rubric'],
      },
    },
  },
  required: ['tasks'],
}

/** Real tasks an existing agent received in past runs (from the run transcripts), newest first. */
export function pastTasks(registry, agent, max = 5) {
  const out = []
  let ids = []
  try { ids = fs.readdirSync(registry.d.runs).sort().reverse().slice(0, 200) } catch {}
  for (const id of ids) {
    if (out.length >= max) break
    let run
    try { run = JSON.parse(fs.readFileSync(path.join(registry.d.runs, id, 'run.json'), 'utf8')) } catch { continue }
    for (const a of run.agents ?? []) {
      if (out.length >= max) break
      if (a.agent !== agent || a.status !== 'completed' || !a.file) continue
      let t
      try { t = fs.readFileSync(path.join(registry.d.runs, id, a.file), 'utf8') } catch { continue }
      const m = t.match(/\n## Task\n\n([\s\S]*?)\n\n## Transcript\n/)
      if (m && m[1].trim().length > 80 && !out.some(x => x.slice(0, 200) === m[1].slice(0, 200))) out.push(clip(m[1].trim(), 1500))
    }
  }
  return out
}

function clean(rows, split, taken, stageIds = []) {
  const out = []
  for (const t of rows ?? []) {
    const title = String(t?.title ?? '').trim().slice(0, 160)
    const input = String(t?.input ?? '').trim()
    if (!title || input.length < 40 || taken.has(title.toLowerCase())) continue
    taken.add(title.toLowerCase())
    out.push({
      id: `${split[0]}-${hash(`${title}:${input}`, 8)}`, title, input: input.slice(0, 20000),
      ...(stageIds.includes(String(t.stage)) ? { stage: String(t.stage) } : stageIds.length === 1 ? { stage: stageIds[0] } : {}),
      fixtures: (Array.isArray(t.fixtures) ? t.fixtures : []).filter(f => f?.path && !String(f.path).includes('..') && !path.isAbsolute(String(f.path))).slice(0, 8).map(f => ({ path: String(f.path).slice(0, 200), content: String(f.content ?? '').slice(0, 12000) })),
      rubric: (Array.isArray(t.rubric) ? t.rubric : []).filter(r => r?.criterion).slice(0, 6).map(r => ({ criterion: String(r.criterion).slice(0, 500), weight: Number(r.weight) > 0 ? Number(r.weight) : 1 })),
      checks: (Array.isArray(t.checks) ? t.checks : []).filter(c => CHECK_TYPES.includes(c?.type)).slice(0, 8)
        // a file-exists check often comes with its file in "value"; a file check that names no file cannot be checked
        .map(c => (c.type === 'file-exists' && !c.path && c.value ? { ...c, path: c.value, value: '' } : c)).filter(c => !String(c.type).startsWith('file-') || c.path)
        .map(c => ({ type: c.type, value: String(c.value ?? '').slice(0, 300), ...(c.path ? { path: String(c.path).slice(0, 200) } : {}), must: c.must === true })),
    })
  }
  return out
}

function rolePrompt(ctx, wf, role, n, split, taken, examples, only) {
  const owns = wf.stages.filter(s => s.role === role.name && (!only || s.id === only))
  const reviews = wf.stages.filter(s => s.reviewer === role.name && (!only || s.id === only))
  return [
    `Write ${n} ${split === 'holdout' ? 'verification' : 'practice'} tasks for the agent "${role.name}": ${role.description}`,
    `The agent works in a team whose goal is:\n${ctx.camp.goal}`,
    owns.length ? `Stages it owns:\n${owns.map(s => `- [stage id: ${s.id}] ${s.title}${s.kind === 'decision' ? ' (a go / stop decision)' : ''}: ${s.purpose}\n  Deliverable: ${s.deliverable}\n  Acceptance: ${s.acceptance.join('; ')}`).join('\n')}` : '',
    reviews.length ? `Stages it reviews (it must find the defects in another agent's result against the acceptance criteria):\n${reviews.map(s => `- [stage id: ${s.id}] ${s.title}: ${s.acceptance.join('; ')}`).join('\n')}` : '',
    role.kind === 'builder'
      ? 'The agent is a builder: it works in an empty folder (plus your fixture files), writes and runs files there, and has no internet beyond package registries. Keep each task small enough to build and verify in about ten minutes. Use file-exists, file-contains and file-regex checks for what must exist.'
      : `The agent is read-only: it judges and writes, and answers in its final message. It cannot write files, so ask for the result in its answer and use only checks on the answer (contains, regex, min-chars), never file checks. ${ctx.settings.trial?.web !== false ? 'Put the material it needs in the task or in fixture files; it may also search the web.' : 'It has no web access: put every fact and source it needs in the task or in fixture files.'}`,
    examples.length ? `Real tasks this agent received in past runs (match their form and level of detail, do not copy them):\n${examples.map((e, i) => `--- example ${i + 1} ---\n${e}`).join('\n')}` : '',
    `Rules:
- Each task stands on its own: the agent sees only the task text and the fixture files.
- Keep it compact: a task text of at most 500 words, at most 2 fixture files of at most 1500 characters each, a rubric of 3 to 5 short criteria. Your whole answer must stay well under 6000 words.
- Set "stage" on every task to the id of the stage it exercises. Every stage listed above gets at least one task.
- Cover every stage above, including the reviews. For a stage that reads earlier stages, include a realistic earlier result in the task (some good, some flawed).
- Vary the subject, the difficulty and the trap. Do not make every task about the team's exact goal: use neighbouring products, markets and situations, so the agent learns the job and not one case. Include cases where the right answer is "no" or "not enough evidence".
- The rubric must separate good work from plausible-looking weak work: name the evidence, the numbers, the decisions or the behaviour that must be there.
- Checks are optional and must hold for every correct answer, however it is worded: prefer a number or a name that must appear over a pattern of phrasing. Mark a check "must" only for a file a builder has to deliver.`,
    taken.size ? `These titles exist already. Write different tasks, on different subjects:\n${[...taken].map(t => `- ${t}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

function teamPrompt(ctx, wf, n, split, taken) {
  return [
    `Write ${n} ${split === 'holdout' ? 'verification' : 'practice'} goals for a whole team of AI agents.`,
    `The team's real goal is:\n${ctx.camp.goal}`,
    `The team follows this workflow:\n${wf.stages.map((s, i) => `${i + 1}. ${s.title}${s.kind === 'decision' ? ' (go / stop decision)' : ''}: ${s.deliverable}`).join('\n')}`,
    `Rules:
- Each task is a goal of the same kind as the real one, but small: the whole workflow must be able to finish it in one sitting, so scope every build to a tiny demo.
- Vary the product, the audience and the difficulty. Include at least one goal where the honest outcome is to stop at a decision stage.
- "input" is the goal as the team receives it, with the constraints that keep it small. At most 300 words.
- The rubric judges the end result and the chain: does each stage build on the one before, are the decisions supported by evidence, is the final deliverable usable, is anything invented.`,
    taken.size ? `These titles exist already. Write different goals:\n${[...taken].map(t => `- ${t}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

/** The stages a role works on: the ones it owns and the ones it reviews. */
export const roleStages = (wf, name) => wf.stages.filter(s => s.role === name || s.reviewer === name).map(s => s.id)

/** Tasks are asked for a few at a time: a whole set in one answer can exceed the model's output limit. */
const BATCH = 2

async function fill(ctx, key, split, want, taken, prompt, stageIds = []) {
  const who = split === 'holdout' ? 'sealer' : 'examiner'
  const have = ctx.store.tasks(ctx.id, key, split)
  for (const t of have) taken.add(t.title.toLowerCase())
  let rows = have
  let size = BATCH, misses = 0, last = ''
  while (rows.length < want && misses < 4) {
    const n = Math.min(size, want - rows.length)
    let got = []
    try {
      const v = await ctx.ask(who, prompt(n), TASKS, `${who}:${key}:${split}`)
      got = clean(v.tasks, split, taken, stageIds)
    } catch (e) {
      if (e?.pause) throw e
      last = e.message // an answer that was too long or not valid: ask again, for one task
    }
    if (!got.length) { misses++; size = 1; continue }
    misses = 0
    rows = [...rows, ...got].slice(0, want)
    ctx.store.saveTasks(ctx.id, key, split, rows)
  }
  if (rows.length < Math.min(want, 2)) throw new Error(`could not write enough ${split} tasks for ${key} (${rows.length} of ${want})${last ? `: ${last}` : ''}`)
  if (rows.length < want) ctx.log(`${key}: only ${rows.length} of ${want} ${split === 'train' ? 'practice' : split === 'holdout' ? 'sealed' : split} tasks could be written; training continues with those`)
  // every step gets at least one task in every set (sets written before tasks carried a step are left as they are)
  if (stageIds.length > 1 && rows.some(t => t.stage)) {
    for (const sid of stageIds.filter(x => !rows.some(t => t.stage === x))) {
      try {
        const v = await ctx.ask(who, prompt(1, sid), TASKS, `${who}:${key}:${split}:${sid}`)
        const extra = clean(v.tasks, split, taken, [sid]).slice(0, 1)
        if (extra.length) { rows = [...rows, ...extra]; ctx.store.saveTasks(ctx.id, key, split, rows) }
      } catch (e) { if (e?.pause) throw e; ctx.log(`${key}: no ${split} task could be written for step ${sid}: ${e.message}`) }
    }
  }
  return rows
}

/** Make sure a role has its three sets. Safe to call again: existing tasks are kept. */
export async function ensureRoleSets(ctx, role) {
  const wf = ctx.camp.workflow
  const size = ctx.settings.dataset
  const taken = new Set()
  const examples = pastTasks(ctx.registry, role.base ?? role.name)
  for (const split of ['train', 'dev', 'holdout']) {
    await fill(ctx, role.name, split, size[split], taken, (n, only) => rolePrompt(ctx, wf, role, n, split, taken, split === 'holdout' ? [] : examples, only), roleStages(wf, role.name))
  }
}

export async function ensureTeamSets(ctx) {
  const wf = ctx.camp.workflow
  const size = ctx.settings.team
  const taken = new Set()
  for (const split of ['dev', 'holdout']) await fill(ctx, TEAM, split, size[split], taken, n => teamPrompt(ctx, wf, n, split, taken))
}
