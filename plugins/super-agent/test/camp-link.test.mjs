// The link between the leaders and the training camp, against a scripted camp service (no model calls).
// Run: node plugins/super-agent/test/camp-link.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { CampLink, CAMP_TOOLS } from '../lib/camp-link.js'

const ago = min => new Date(Date.now() - min * 60_000).toISOString()

function world(camp) {
  const state = { sourceState: {} }
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
    revise: () => { calls.push('revise'); return { done: Promise.resolve() } },
    approve: () => { calls.push('approve'); c.status = 'approved'; c.approvedVersion = c.workflowVersion },
    train: () => { calls.push('train'); c.status = 'training'; delete c.pause; busy = true; return { done: new Promise(() => {}) } },
    cancel: (_id, o) => { calls.push(`cancel:${o.by}`); busy = false; c.status = 'paused'; c.pause = { reason: 'you paused it', ts: ago(0), by: o.by }; return { ok: true } },
    redo: (_id, part) => calls.push(`redo:${part}`),
    updateSettings: (_id, p) => calls.push(`set:${JSON.stringify(p)}`),
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
  assert.match(await w.link.act(coo, 'camp_set', { id: 'c1', key: 'dataset.train', value: 3 }), /now 3/)
  assert.deepEqual(w.calls, ['set:{"dataset":{"train":3}}'])
  await assert.rejects(w.link.act(coo, 'camp_set', { id: 'c1', key: 'budgetUsd', value: 500 }), /you can set/)
  await assert.rejects(w.link.act(coo, 'camp_set', { id: 'c1', key: 'parallelAgents', value: 50 }), /between 1 and 8/)
  assert.ok(CAMP_TOOLS.every(t => t.inputSchema.type === 'object'))
})
