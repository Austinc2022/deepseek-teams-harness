/**
 * Runs a camp workflow: the one implementation used by team trials inside a camp and by the orchestration a camp
 * publishes into forge/orchestrations/. It has no dependencies, so the published file can import it directly.
 *
 * workflow.stages, in order:
 *   { id, title, purpose, kind: 'work' | 'decision', role, reviewer?, reviewRounds?, inputs: [earlier stage ids],
 *     deliverable, acceptance: [..], notes?, group? }
 *   - consecutive stages with the same `group` run in parallel
 *   - a decision stage answers go / stop; "stop" ends the workflow (a cheap "no" is a good result)
 *   - a stage with a reviewer is reviewed against its acceptance criteria and revised up to reviewRounds times
 *
 * api.agent(name, prompt, opts) must return the full runner result ({ ok, text, structured, error }).
 */
import fs from 'node:fs'
import path from 'node:path'

const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n)}\n...[${s.length - n} more characters]` : s }

const DECISION = {
  type: 'object',
  properties: {
    go: { type: 'boolean', description: 'true = continue to the next stage; false = stop here' },
    summary: { type: 'string', description: 'the decision and the evidence for it' },
    reasons: { type: 'array', items: { type: 'string' } },
    conditions: { type: 'array', items: { type: 'string' }, description: 'what the next stages must respect or fix' },
  },
  required: ['go', 'summary', 'reasons'],
}
const REVIEW = {
  type: 'object',
  properties: { approved: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' }, description: 'concrete defects against the acceptance criteria; empty when approved' } },
  required: ['approved', 'issues'],
}

export function structured(res) {
  if (res?.structured && typeof res.structured === 'object') return res.structured
  const m = String(res?.text ?? '').match(/\{[\s\S]*\}/)
  try { return m ? JSON.parse(m[0]) : null } catch { return null }
}

function stagePrompt(wf, s, goal, outputs, cwd) {
  const prior = (s.inputs ?? []).filter(i => outputs[i] != null).map(i => {
    const st = wf.stages.find(x => x.id === i)
    return `## Result of stage "${st?.title ?? i}" (also in stages/${i}.md)\n${clip(outputs[i], 9000)}`
  })
  return [
    `# Goal\n${goal}`,
    `# Your stage: ${s.title}\n${s.purpose ?? ''}`,
    `# Deliverable\n${s.deliverable ?? 'A complete answer for this stage.'}`,
    s.acceptance?.length ? `# Acceptance criteria\n${s.acceptance.map(a => `- ${a}`).join('\n')}` : '',
    s.notes ? `# Notes\n${s.notes}` : '',
    prior.length ? `# What the earlier stages produced\n${prior.join('\n\n')}` : '',
    `# How to deliver\nWork in ${cwd}. Files you create belong there. Your final message is the stage result that the next stages read, so make it complete and self-contained: state what you found or built, the evidence, and what is still uncertain.${s.kind === 'decision' ? ' This stage is a decision: say plainly whether the work should continue.' : ''}`,
  ].filter(Boolean).join('\n\n')
}

async function runStage(api, wf, s, goal, outputs, cwd, opts) {
  const base = r => ({ ...(opts(r) ?? {}), cwd, full: true })
  const decision = s.kind === 'decision'
  const res = await api.agent(s.role, stagePrompt(wf, s, goal, outputs, cwd), { ...base(s.role), label: `${s.id}:${s.role}`, ...(decision ? { schema: DECISION } : {}) })
  if (!res?.ok) return { id: s.id, ok: false, error: res?.error ?? 'no result' }
  if (decision) {
    const d = structured(res)
    if (!d || typeof d.go !== 'boolean') return { id: s.id, ok: false, error: 'the decision stage gave no go / stop answer' }
    const text = `Decision: ${d.go ? 'GO' : 'STOP'}\n\n${d.summary ?? ''}\n\nReasons:\n${(d.reasons ?? []).map(r => `- ${r}`).join('\n')}${d.conditions?.length ? `\n\nConditions:\n${d.conditions.map(r => `- ${r}`).join('\n')}` : ''}`
    return { id: s.id, ok: true, text, stop: d.go === false }
  }
  let text = res.text ?? JSON.stringify(res.structured ?? '')
  let reviews = 0
  const rounds = s.reviewer ? Math.max(0, Math.min(3, s.reviewRounds ?? 1)) : 0
  for (let r = 1; r <= rounds; r++) {
    const rv = await api.agent(s.reviewer, [
      `# Goal\n${goal}`, `# Review the result of stage "${s.title}"`,
      `Acceptance criteria:\n${(s.acceptance ?? []).map(a => `- ${a}`).join('\n') || '- complete, correct and usable by the next stage'}`,
      `Files, if any, are in ${cwd}.`, `# The result\n${clip(text, 20000)}`,
      'Approve only when every criterion is met. Otherwise list the concrete defects.',
    ].join('\n\n'), { ...base(s.reviewer), schema: REVIEW, label: `${s.id}:review-${r}` })
    const v = rv?.ok ? structured(rv) : null
    if (!v || v.approved || !v.issues?.length) break
    reviews = r
    const fix = await api.agent(s.role, `${stagePrompt(wf, s, goal, outputs, cwd)}\n\n# Your previous result\n${clip(text, 20000)}\n\n# The reviewer found these defects. Fix every one and give the complete result again.\n${v.issues.map(i => `- ${i}`).join('\n')}`, { ...base(s.role), label: `${s.id}:revise-${r}` })
    if (!fix?.ok) break
    text = fix.text ?? text
  }
  return { id: s.id, ok: true, text, reviews }
}

/**
 * @returns {{ ok: boolean, stopped: string|null, failed: string|null, outputs: Record<string,string>, stages: object[] }}
 */
export async function runWorkflow(api, wf, { goal, cwd, opts = () => ({}), onStage } = {}) {
  fs.mkdirSync(path.join(cwd, 'stages'), { recursive: true })
  const outputs = {}
  const stages = []
  const groups = []
  for (const s of wf.stages) {
    const g = groups.at(-1)
    if (s.group && g && g[0].group === s.group) g.push(s); else groups.push([s])
  }
  for (const g of groups) {
    api.phase?.(g.map(s => s.title).join(' + '))
    const done = await Promise.all(g.map(s => runStage(api, wf, s, goal, outputs, cwd, opts).catch(e => { if (e?.pause) throw e; return { id: s.id, ok: false, error: e?.message ?? String(e) } })))
    for (const r of done) {
      stages.push(r)
      onStage?.(r)
      if (r.ok) { outputs[r.id] = r.text; fs.writeFileSync(path.join(cwd, 'stages', `${r.id}.md`), r.text) }
    }
    const failed = done.find(r => !r.ok)
    if (failed) return { ok: false, stopped: null, failed: failed.id, error: failed.error, outputs, stages }
    const stop = done.find(r => r.stop)
    if (stop) return { ok: true, stopped: stop.id, failed: null, outputs, stages }
  }
  return { ok: true, stopped: null, failed: null, outputs, stages }
}

/** The text a published orchestration returns, and what the team judge reads. */
export function workflowReport(wf, out, each = 6000) {
  const head = out.failed ? `Workflow FAILED at stage "${out.failed}": ${out.error}` : out.stopped ? `Workflow STOPPED by the decision at stage "${out.stopped}".` : 'Workflow completed every stage.'
  return `${head}\n\n${wf.stages.filter(s => out.outputs[s.id] != null).map(s => `## ${s.title} (${s.role})\n${clip(out.outputs[s.id], each)}`).join('\n\n')}`
}
