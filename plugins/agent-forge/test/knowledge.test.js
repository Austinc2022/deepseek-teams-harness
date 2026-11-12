// Deterministic tests of the knowledge store and the two-layer memory. Run: node --test plugins/agent-forge/test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Knowledge } from '../lib/knowledge.js'
import { openMemory, ensureInstance, listInstances, agentKind } from '../lib/memory.js'
import { normalizeAgent } from '../lib/registry.js'

const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kb-test-'))

test('trust is capped by the source tier, never raised by confident wording', () => {
  const kb = new Knowledge(home())
  const a = kb.add({ claim: 'Funding carry on BTC perps returns 0.4% a day after fees', strength: 'measured', tier: 'agent', area: 'quant' })
  assert.equal(kb.get(a.id).trust, 0.6)
  const c = kb.add({ claim: 'Engine holdout mean active day is -0.0016', strength: 'measured', tier: 'code', area: 'quant' })
  assert.equal(kb.get(c.id).trust, 0.95)
  const h = kb.add({ claim: 'Reportedly the listing edge works on Bybit', strength: 'hearsay', tier: 'code', area: 'quant' })
  assert.equal(kb.get(h.id).trust, 0.25)
})

test('the same claim from a second source is a corroboration, not a new fact', () => {
  const kb = new Knowledge(home())
  const a = kb.add({ claim: 'Taker CVD order flow has no out-of-sample edge', tier: 'agent', sourceRef: 'run:1', area: 'quant' })
  const b = kb.add({ claim: 'Taker CVD order flow has no out-of-sample edge', tier: 'agent', sourceRef: 'run:2', area: 'quant' })
  assert.equal(b.id, a.id)
  assert.equal(b.duplicate, true)
  assert.equal(kb.get(a.id).corroborations, 2)
  assert.equal(kb.loadBearing(a.id), true)
})

test('a newer fact with the same key supersedes the older one; a lower tier only disputes it', () => {
  const kb = new Knowledge(home())
  const old = kb.add({ key: 'validator.trialsSoFar', claim: 'Validator trials so far: 1', tier: 'code', strength: 'measured', area: 'quant' })
  const neu = kb.add({ key: 'validator.trialsSoFar', claim: 'Validator trials so far: 2', tier: 'code', strength: 'measured', area: 'quant' })
  assert.equal(neu.superseded, old.id)
  assert.equal(kb.get(old.id).status, 'invalid')
  assert.equal(kb.get(old.id).superseded_by, neu.id)
  const low = kb.add({ key: 'validator.trialsSoFar', claim: 'Validator trials so far: 7', tier: 'agent', area: 'quant' })
  assert.equal(low.status, 'conflict')
  assert.equal(kb.get(neu.id).status, 'active')
})

test('a wrong fact quarantines everything derived from it and names the affected initiative', () => {
  const kb = new Knowledge(home())
  const ev = kb.add({ claim: 'The announcement edge loses on the 2026-02-24 holdout (-0.156% per active day)', tier: 'agent', strength: 'measured', area: 'quant' })
  const kill = kb.add({ claim: 'Initiative "announcement edge" was killed: no out-of-sample alpha', kind: 'constraint', tier: 'agent', derivedFrom: [ev.id], area: 'quant' })
  kb.link('initiative:i6ad49a2222', kill.id)
  const r = kb.invalidate(ev.id, { reason: 'the holdout was contaminated (minute-low fill bug)', by: 'dreamer' })
  assert.equal(kb.get(ev.id).status, 'invalid')
  assert.equal(kb.get(kill.id).status, 'quarantined')
  assert.ok(r.affected.includes('initiative:i6ad49a2222'))
  const ev2 = kb.events(0, ['affected']).at(-1)
  assert.ok(ev2.data.affected.includes(`fact:${kill.id}`))
})

test('superseded (not wrong) sources make dependents suspect, not quarantined', () => {
  const kb = new Knowledge(home())
  const a = kb.add({ key: 'x', claim: 'Collector heartbeat is fresh at 12:00', tier: 'code', strength: 'measured' })
  const d = kb.add({ claim: 'Data pipeline is healthy, based on the collector heartbeat', tier: 'agent', derivedFrom: [a.id] })
  kb.add({ key: 'x', claim: 'Collector heartbeat is 40 minutes old', tier: 'code', strength: 'measured' })
  assert.equal(kb.get(d.id).status, 'suspect')
})

test('expired facts go stale; constraints are checked first; verify never raises tier or strength', () => {
  const kb = new Knowledge(home())
  const f = kb.add({ claim: 'BTC funding is positive on most venues', tier: 'tool', strength: 'measured', volatility: 'market', reviewDays: -1 })
  const k = kb.add({ claim: 'Never trade the listing edge: killed for latency', kind: 'constraint', tier: 'agent', reviewDays: -1 })
  assert.equal(kb.expire(), 2)
  const due = kb.due(5)
  assert.equal(due[0].id, k.id)
  kb.verify(f.id, { note: 'checked against run 20261112' })
  const g = kb.get(f.id)
  assert.equal(g.status, 'active'); assert.equal(g.tier, 'tool'); assert.equal(g.strength, 'measured')
  assert.ok(g.review_at > new Date().toISOString())
})

test('search ranks by relevance, trust and purpose; measuredOnly hides agent opinions', () => {
  const kb = new Knowledge(home())
  kb.add({ claim: 'Funding basis spread averages 3 bps on Binance', tier: 'code', strength: 'measured', area: 'quant' })
  kb.add({ claim: 'Funding basis is probably exhausted as an edge', tier: 'agent', strength: 'argued', area: 'quant', purpose: 'ini-funding-1234' })
  kb.add({ claim: 'The web build uses vite', tier: 'agent', area: 'web' })
  const all = kb.search('funding basis edge', { areas: ['quant'] })
  assert.equal(all.length, 2)
  const own = kb.search('funding', { areas: ['quant'], purpose: 'ini-funding-1234' })
  assert.equal(own[0].purpose, 'ini-funding-1234')
  const judge = kb.search('funding basis', { areas: ['quant'], measuredOnly: true })
  assert.equal(judge.length, 1); assert.equal(judge[0].tier, 'code')
  const c = kb.context({ query: 'funding basis', areas: ['quant'], budget: 2000, runId: 'r1', label: 'test' })
  assert.match(c.text, /single source/)
  assert.equal(kb.contextOf('r1')[0].facts.length, c.ids.length)
})

test('flagging by an agent disputes; by the owner it invalidates at once', () => {
  const kb = new Knowledge(home())
  const f = kb.add({ claim: 'Latency to Binance is 180 ms from this host', tier: 'tool', strength: 'measured' })
  kb.flag(f.id, { by: 'quant-desk', note: 'ping today shows 40 ms (run 20261112-1)' })
  assert.equal(kb.get(f.id).status, 'conflict')
  kb.flag(f.id, { owner: true, note: 'we moved the server to Tokyo' })
  assert.equal(kb.get(f.id).status, 'invalid')
})

test('transcripts are indexed and searchable', () => {
  const h = home()
  const dir = path.join(h, 'runs', '20261112-000000-abcd', 'agents')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '001-report_research.md'), '# report\nThe holdout mean active day was -0.0016 on 44 active days.')
  const kb = new Knowledge(h)
  assert.equal(kb.indexTranscripts(path.join(h, 'runs')), 1)
  assert.equal(kb.indexTranscripts(path.join(h, 'runs')), 0)
  const r = kb.searchTranscripts('holdout active days')
  assert.equal(r[0].run_id, '20261112-000000-abcd')
  assert.ok(kb.transcriptExists('20261112-000000-abcd'))
})

const agent = (extra = {}) => normalizeAgent({ name: 'quant-alpha-hunter', description: 'finds edges', tags: ['quant'], memory: { mode: 'hybrid', scope: 'team' }, ...extra })

test('judges and builders are stateless whatever their file says', () => {
  const h = home()
  assert.equal(agentKind(agent({ tags: ['quant', 'judge'] })), 'judge')
  assert.equal(openMemory(h, agent({ tags: ['quant', 'judge'] })).mode, 'none')
  assert.equal(openMemory(h, agent({ tags: ['builder'] })).mode, 'none')
})

test('a team-scoped agent outside a team uses its own folder, never a shared default bucket', () => {
  const h = home()
  const m = openMemory(h, agent())
  assert.equal(m.dir, path.join(h, 'memory', 'agents', 'quant-alpha-hunter'))
  assert.ok(!fs.existsSync(path.join(h, 'memory', 'teams', 'default')))
})

test('a purpose gets its own memory immediately, with a starting pack; notes go to the purpose by default', () => {
  const h = home()
  const kb = new Knowledge(h)
  kb.add({ claim: 'Funding carry edge: mean active day +0.02% on 30 days (simulated)', tier: 'agent', strength: 'simulated', area: 'quant', purpose: 'ini-funding-carry-ab12' })
  kb.close()
  const def = agent()
  const m = openMemory(h, def, { team: 'quant-alpha', purpose: 'ini-funding-carry-ab12' })
  assert.equal(m.instance, path.join(h, 'memory', 'instances', 'team-quant-alpha', 'ini-funding-carry-ab12'))
  assert.match(fs.readFileSync(path.join(m.instance, 'genesis.md'), 'utf8'), /Funding carry edge/)
  assert.match(m.context, /Starting pack/)
  m.handle('memory_save', { title: 'carry works only on 8h funding', content: 'x' })
  assert.ok(fs.existsSync(path.join(m.instance, 'notes', 'carry-works-only-on-8h-funding.md')))
  m.handle('memory_save', { title: 'always check venue fees first', content: 'y', layer: 'role' })
  assert.ok(fs.existsSync(path.join(h, 'memory', 'teams', 'quant-alpha', 'notes', 'always-check-venue-fees-first.md')))
  m.afterRun({ task: 't', outcome: 'o', label: 'l', runId: 'r', ok: true })
  const inst = listInstances(h)[0]
  assert.equal(inst.runs, 1); assert.equal(inst.dirty, true)
})

test('fresh eyes start from measured facts only; a fork inherits the source state', () => {
  const h = home()
  const kb = new Knowledge(h)
  kb.add({ claim: 'Listing edge holdout loses 0.1% per trade', tier: 'code', strength: 'measured', area: 'quant' })
  kb.add({ claim: 'Listing edge is dead, do not revisit', tier: 'agent', strength: 'argued', area: 'quant', kind: 'constraint' })
  kb.close()
  const def = agent()
  const fresh = ensureInstance(h, def, { purpose: 'challenge listing edge', fresh: true })
  const g = fs.readFileSync(path.join(fresh, 'genesis.md'), 'utf8')
  assert.match(g, /loses 0.1%/); assert.doesNotMatch(g, /do not revisit/)
  const src = ensureInstance(h, def, { purpose: 'funding basis' })
  fs.writeFileSync(path.join(src, 'summary.md'), 'Basis tested on 3 venues; carry best on 8h funding.')
  const fork = ensureInstance(h, def, { purpose: 'funding carry', forkFrom: 'funding basis' })
  assert.match(fs.readFileSync(path.join(fork, 'genesis.md'), 'utf8'), /carry best on 8h funding/)
  assert.equal(JSON.parse(fs.readFileSync(path.join(fork, 'meta.json'), 'utf8')).forkedFrom, 'funding basis')
})

test('the injected index ranks notes newest first and says how many are hidden', () => {
  const h = home()
  const def = agent({ memory: { mode: 'markdown', scope: 'agent', injectChars: 900 } })
  const m = openMemory(h, def)
  for (let i = 0; i < 30; i++) m.handle('memory_save', { title: `note ${String(i).padStart(2, '0')} about something long enough`, content: 'body '.repeat(10) })
  const m2 = openMemory(h, def)
  assert.match(m2.context, /note 29/)
  assert.match(m2.context, /older notes not shown/)
})

test('names must say what an agent does and what it works on', async () => {
  const { agentNameProblem, teamNameProblem, titleProblem } = await import('../../company/lib/naming.js')
  assert.equal(agentNameProblem('quant-funding-researcher', 'quant-'), null)
  assert.equal(agentNameProblem('quant-listing-scout', 'quant-'), null)
  assert.match(agentNameProblem('quant-researcher', 'quant-'), /only one thing/)
  assert.match(agentNameProblem('quant-funding-basis', 'quant-'), /does not say what the agent does/)
  assert.match(agentNameProblem('quant-new-helper-analyst', 'quant-'), /says nothing/)
  assert.equal(teamNameProblem('quant-funding-alpha', 'quant-'), null)
  assert.match(teamNameProblem('quant-team', 'quant-'), /does not say/)
  assert.equal(titleProblem('Funding edges programme'), null)
  assert.match(titleProblem('Team'), /too vague/)
})
