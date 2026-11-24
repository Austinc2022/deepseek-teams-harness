// The link between the leaders and the training camp, against a scripted camp service (no model calls).
// Run: node plugins/super-agent/test/camp-link.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { CampLink, CAMP_TOOLS } from '../lib/camp-link.js'

const ago = min => new Date(Date.now() - min * 60_000).toISOString()

function world(camp) {
  const state = { sourceState: {}, triggers: [] }
  const triggers = [], said = [], calls = []
  const company = { ceo: 'vr-ceo', superProject: 'p1', departments: [{ id: 'design', name: 'Design', lead: 'vr-head-design', teams: ['vr-design'], superTeamId: 'st0' }] }
  const agents = new Map([['vr-head-design', { name: 'vr-head-design', model: 'sonnet', tags: ['vr'] }]])
  const supers = new Map([['st0', { teams: [{ team: 'vr-design' }] }]])
  const sa = {
    log: () => {},
    company, agents, supers,
    co: {
      read: () => company, update: fn => fn(company), log: () => {},
      forge: { registry: { getTeam: n => { if (!['studio', 'vr-design'].includes(n)) throw new Error('no team'); return { name: n, members: [] } } } },
      supers: { get: id => { if (!supers.has(id)) throw new Error('none'); return supers.get(id) }, create: o => { const id = `st${supers.size}`; supers.set(id, { ...o, id }); return { id } }, update: (id, o) => Object.assign(supers.get(id), o) },
    },
    forge: { registry: { listAgents: () => [...agents.values()], getAgent: n => agents.get(n), saveAgent: d => agents.set(d.name, d) } },
    store: { read: () => state, update: fn => fn(state) },
    trigger: t => { if (t.key && triggers.some(x => x.key === t.key)) return null; triggers.push(t); return t },
    say: m => said.push(m),
  }
  const c = { id: 'c1', name: 'VR app', goal: 'Build a VR app people pay for every day', status: 'approved', workflowVersion: 1, approvedVersion: 1, spend: { calls: 0, usd: 0 }, runs: [], log: [], roles: {}, team: {}, workflow: { summary: 'a studio', stages: [{ title: 'Demand' }, { title: 'Build' }], roles: [{ name: 'tc-a' }, { name: 'tc-b' }], teams: [] }, ...camp }
  let busy = false
  const cs = {
    store: { update: (_id, fn) => fn(c) },
    list: () => [{ id: c.id, name: c.name, goal: c.goal, status: c.status, busy, spend: c.spend }],
    get: () => c,
    report: () => `Camp ${c.id}: ${c.status}`,
    create: ({ goal, name }) => { Object.assign(c, { goal, name: name ?? 'new', status: 'draft', workflow: null }); calls.push('create'); return c },
    propose: () => { calls.push('propose'); return { done: Promise.resolve().then(() => { c.workflow = { summary: 's', stages: [{ title: 'One' }], roles: [{ name: 'tc-a' }], teams: [] }; c.status = 'workflow' }) } },
    revise: () => { calls.push('revise'); return { done: Promise.resolve().then(() => { if (c.reviseTo) { c.versions = { ...(c.versions ?? {}), [c.workflowVersion]: c.workflow }; c.workflow = c.reviseTo; c.workflowVersion++; c.status = 'workflow' } }) } },
    restoreWorkflow: (_id, v) => { calls.push(`restore:${v}`); c.workflow = c.versions[v]; c.workflowVersion++; c.status = 'workflow' },
    approve: () => { calls.push('approve'); c.status = 'approved'; c.approvedVersion = c.workflowVersion },
    train: () => { calls.push('train'); c.status = 'training'; delete c.pause; busy = true; return { done: new Promise(() => {}) } },
    cancel: (_id, o) => { calls.push(`cancel:${o.by}`); busy = false; c.status = 'paused'; c.pause = { reason: 'you paused it', ts: ago(0), ...(o.by ? { by: o.by } : {}) }; return { ok: true } },
    redo: (_id, part) => calls.push(`redo:${part}`),
    updateSettings: (_id, p) => { calls.push(`set:${JSON.stringify(p)}`); Object.assign(c.settings ??= {}, p) },
    publish: (_id, o = {}) => { calls.push(`publish${o.force ? ':force' : ''}`); c.status = 'published'; c.published = { ts: ago(0), agents: ['tc-a', 'tc-b'], teams: ['studio'], orchestration: 'vr-app-workflow', skipped: [] } },
    rollback: () => calls.push('rollback'),
  }
  const link = new CampLink(sa, { camps: cs })
  const look = async () => { link.at = 0; await link.tick() }
  return { link, cs, c, triggers, said, calls, look, state, sa, setBusy: v => { busy = v } }
}
const coo = { id: 'coo', kind: 'coo', title: 'COO' }

test('the COO opens a camp, gets the proposal as an event, approves it, and training starts', async () => {
  const w = world()
  assert.equal(await w.link.act(coo, 'open_ticket', {}), undefined, 'other tools are not ours')
  assert.match(await w.link.act(coo, 'camp_new', { goal: 'A studio team that can ship a paid WebXR game' }), /architect is proposing/)
  assert.equal(w.c.by, 'coo')
  await new Promise(r => setTimeout(r, 5))
  assert.equal(w.triggers.length, 1)
  assert.equal(w.triggers[0].to, 'coo')
  assert.match(w.triggers[0].text, /proposed workflow, version 1[\s\S]*Approving is yours, not the owner's/)
  await w.look()
  assert.equal(w.triggers.length, 1, 'the same proposal is announced once')
  assert.match(await w.link.act(coo, 'camp_approve', { id: 'c1' }), /training has started/)
  assert.deepEqual(w.calls, ['create', 'propose', 'approve', 'train'])
  assert.match(w.link.context(), /Training camps[\s\S]*c1 "new" \[training, working\]/)
})

test('a camp paused by a provider limit is resumed by code, waiting longer each time; the COO hears only when it keeps happening', async () => {
  const w = world({ status: 'paused', pause: { reason: 'API Error: Request rejected (429) Free usage limit reached', ts: ago(3) } })
  await w.look()
  assert.deepEqual(w.calls, [], 'a quota pause waits at least 10 minutes')
  w.c.pause.ts = ago(11)
  await w.look()
  assert.deepEqual(w.calls, ['train'])
  assert.match(w.c.log.at(-1).msg, /resumed automatically \(attempt 1\)/)
  for (const wait of [11, 21, 41]) {
    w.setBusy(false); w.c.status = 'paused'; w.c.pause = { reason: '429 quota', ts: ago(wait - 2) }
    await w.look()
    w.c.pause.ts = ago(wait)
    await w.look()
  }
  assert.equal(w.calls.filter(x => x === 'train').length, 4)
  assert.equal(w.triggers.length, 1)
  assert.match(w.triggers[0].text, /paused and been resumed 4 times[\s\S]*camp_set parallelAgents/)
  assert.equal(w.link.checks()[0]?.status, undefined, 'a camp that is training is not a health problem')
  w.setBusy(false); w.c.status = 'paused'; w.c.pause = { reason: '429 quota', ts: ago(1) }
  assert.equal(w.link.checks()[0].status, 'fail')
  // progress resets the count
  w.setBusy(true); w.c.status = 'training'; w.c.spend.calls = 80
  await w.look()
  assert.equal(w.state.sourceState.camps.c1.resumes, 0)
})

test('a deliberate pause and the budget limit are never resumed by code', async () => {
  const w = world({ status: 'training' })
  w.setBusy(true)
  assert.match(await w.link.act(coo, 'camp_pause', { id: 'c1', reason: 'the workflow needs a change first' }), /stays paused/)
  w.c.pause.ts = ago(600)
  await w.look()
  assert.deepEqual(w.calls, ['cancel:coo'])
  assert.deepEqual(w.link.checks(), [])
  const b = world({ status: 'paused', pause: { reason: 'the budget of $20 is used up', ts: ago(600) } })
  await b.look()
  assert.deepEqual(b.calls, [])
  assert.match(b.triggers[0].text, /paused at its own limit[\s\S]*the owner's settings/)
})

test('a camp that passed is published by code and the COO is told; one that did not pass goes to the COO', async () => {
  const w = world({ status: 'ready' })
  let deployed = null
  w.link.onPublished = c => { deployed = c.published.agents }
  await w.look()
  assert.deepEqual(w.calls, ['publish'])
  assert.deepEqual(deployed, ['tc-a', 'tc-b'])
  assert.match(w.triggers[0].text, /agents tc-a, tc-b; teams studio; workflow "vr-app-workflow"[\s\S]*published automatically/)
  assert.match(w.said[0].text, /Published from camp c1/)
  // the graduates become a department of the company, next to the ones that exist, with a head and a super team
  const dep = w.sa.company.departments.find(d => d.camp === 'c1')
  assert.deepEqual([dep.id, dep.lead, dep.teams, dep.workflow], ['camp-vr-app', 'vr-head-vr-app', ['studio'], 'vr-app-workflow'])
  assert.equal(w.sa.company.departments.length, 2)
  assert.equal(w.sa.supers.get(dep.superTeamId).supervisor, 'vr-head-vr-app')
  assert.ok(w.sa.agents.has('vr-head-vr-app'))
  assert.deepEqual(w.sa.company.adopted, ['tc-a', 'tc-b', 'studio'])
  const { profile: P } = await import('../../company/lib/profile.js')
  assert.ok(P.isOurs('tc-a') && P.isOurs('studio') && !P.isOurs('someone-else'), 'the company now knows them by name')
  await w.look()
  assert.deepEqual(w.calls, ['publish'], 'published once')

  const n = world({ status: 'not-passed', roles: { 'tc-a': { verify: { passed: true, score: 0.8 } }, 'tc-b': { verify: { passed: false, score: 0.41 } } } })
  await n.look()
  assert.deepEqual(n.calls, [])
  assert.match(n.triggers[0].text, /Did not pass: tc-b \(0.41\)/)
  assert.match(await n.link.act(coo, 'camp_publish', { id: 'c1', force: true }), /Published from camp/)
  assert.deepEqual(n.calls, ['publish:force'])
})

test('camp_set changes only how much is trained, within bounds', async () => {
  const w = world()
  assert.match(await w.link.act(coo, 'camp_set', { id: 'c1', key: 'dataset.train', value: 8 }), /now 8/)
  assert.deepEqual(w.calls, ['set:{"dataset":{"train":8}}'])
  // quality first: a leader can train more or slower, never less than the owner's depth
  await assert.rejects(w.link.act(coo, 'camp_set', { id: 'c1', key: 'dataset.train', value: 3 }), /cannot go below 5[\s\S]*quality first/)
  await assert.rejects(w.link.act(coo, 'camp_set', { id: 'c1', key: 'rounds', value: 1 }), /cannot go below 2/)
  assert.match(await w.link.act(coo, 'camp_set', { id: 'c1', key: 'parallelAgents', value: 1 }), /now 1/)
  w.c.protect = { floor: { rounds: 3 } }
  await assert.rejects(w.link.act(coo, 'camp_set', { id: 'c1', key: 'rounds', value: 2 }), /cannot go below 3/)
  await assert.rejects(w.link.act(coo, 'camp_set', { id: 'c1', key: 'budgetUsd', value: 500 }), /you can set/)
  await assert.rejects(w.link.act(coo, 'camp_set', { id: 'c1', key: 'parallelAgents', value: 50 }), /between 1 and 8/)
  assert.ok(CAMP_TOOLS.every(t => t.inputSchema.type === 'object'))
})

test('code fixes what needs no judgement: it slows a camp the provider keeps limiting, restarts a stuck run, and names a repeating error', async () => {
  // the provider's limit comes straight back: lowered to 1 agent and 2 calls, then resumed
  const w = world({ status: 'paused', settings: { parallelAgents: 4, parallelCalls: 8 }, pause: { reason: '429 quota', ts: ago(61) } })
  w.state.sourceState.camps = { c1: { resumes: 2, calls: 0 } }
  await w.look()
  assert.deepEqual(w.calls, ['set:{"parallelAgents":1,"parallelCalls":2}', 'train'])
  assert.match(w.triggers[0].text, /code lowered it to 1 agent and 2 calls at a time \(it was 4 and 8\)/)
  // a run that makes no model call for an hour is stopped by code, and resumed on the next looks
  const s = world({ status: 'training' })
  s.setBusy(true)
  s.state.sourceState.camps = { c1: { calls: 0, callsAt: ago(75) } }
  await s.look()
  assert.deepEqual(s.calls, ['cancel:'], 'stopped without marking it as a deliberate pause')
  assert.equal(s.triggers.length, 0, 'the first time, nobody is bothered')
  s.c.pause = { reason: 'you paused it: no model call for 75 minutes; restarted by code', ts: ago(3) }
  await s.look()
  assert.deepEqual(s.calls, ['cancel:', 'train'])
  // the same error three times is not the provider: the COO is told to have it fixed
  const e = world({ status: 'paused', runs: [{ id: 'run-9' }], pause: { reason: 'error: TypeError: x is not a function', ts: ago(5) } })
  for (let i = 0; i < 3; i++) { e.setBusy(false); e.c.status = 'paused'; e.c.pause = { reason: 'error: TypeError: x is not a function', ts: ago(61) }; await e.look() }
  assert.equal(e.calls.filter(x => x === 'train').length, 3, 'code keeps retrying')
  assert.equal(e.triggers.length, 1)
  assert.match(e.triggers[0].text, /stopped three times on the same error[\s\S]*TypeError: x is not a function[\s\S]*Run run-9[\s\S]*repair_harness/)
  // an event the COO's turn failed on goes to the CEO, once
  e.state.triggers = [{ ...e.triggers[0], status: 'failed', note: 'API Error 529' }]
  await e.look(); await e.look()
  const up = e.triggers.filter(t => t.to === 'ceo')
  assert.equal(up.length, 1)
  assert.match(up[0].text, /The COO could not handle this training-camp event/)
})

test('staffing\'s last rung opens a small camp for a lasting role, or names the camp that already trains for it', async () => {
  const w = world({ status: 'published' })
  const need = { capability: 'Build and tune WebXR hand-tracking interactions that feel right at 72 Hz, with comfort options', purpose: 'hand-tracking', name: 'vr-hand-tracking-engineer' }
  const a = await w.link.openFor(coo, need)
  assert.equal(a.existing, false)
  assert.deepEqual(w.calls, ['create', 'propose'])
  assert.match(w.c.goal, /does this reliably and to a high standard: Build and tune WebXR hand-tracking/)
  assert.match(w.c.log.at(-1).msg, /opened by COO through staffing/)
  await new Promise(r => setTimeout(r, 5))
  assert.match(w.triggers[0].text, /proposed workflow/)
  const b = await w.link.openFor(coo, need)
  assert.deepEqual([b.existing, b.id], [true, 'c1'], 'asked again while it trains: the same camp')
  assert.deepEqual(w.calls, ['create', 'propose'])
})

test('a leader\'s workflow change that removes roles is undone; one that adds roles stands', async () => {
  const w = world({ status: 'approved' })
  const full = w.c.workflow
  w.c.reviseTo = { ...full, roles: [{ name: 'tc-a' }] }
  assert.match(await w.link.act(coo, 'camp_change', { id: 'c1', request: 'cut to the core roles so it fits the quota' }), /architect is revising/)
  await new Promise(r => setTimeout(r, 5))
  assert.deepEqual(w.calls, ['revise', 'restore:1', 'approve'])
  assert.deepEqual(w.c.workflow.roles.map(r => r.name), ['tc-a', 'tc-b'], 'every role is back')
  assert.equal(w.triggers.length, 1)
  assert.match(w.triggers[0].text, /removed 1 role \(tc-b\), so code undid it[\s\S]*quality first/)
  // adding a role is a normal proposal to approve
  const n = world({ status: 'approved' })
  n.c.reviseTo = { ...n.c.workflow, roles: [...n.c.workflow.roles, { name: 'tc-c' }] }
  await n.link.act(coo, 'camp_change', { id: 'c1', request: 'add a playtest analyst' })
  await new Promise(r => setTimeout(r, 5))
  assert.deepEqual(n.calls, ['revise'])
  assert.match(n.triggers[0].text, /proposed workflow, version 2: 2 stages, 3 roles/)
})
