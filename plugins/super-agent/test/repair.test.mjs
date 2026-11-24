// The harness repair sequence against a throwaway git repository and scripted agents (no model calls, no network).
// Run: node plugins/super-agent/test/repair.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { Repair, changeProblems, findSecret, ENGINEER, REVIEWER } from '../lib/repair.js'

const f = (p, added = 3, removed = 1, status = 'M') => ({ path: p, added, removed, status })

test('what a repair may change', () => {
  assert.deepEqual(changeProblems([f('plugins/company/lib/cycle.js'), f('forge/skills/x/SKILL.md'), f('README.md'), f('docs/GROWTH.md')]), [])
  assert.match(changeProblems([])[0], /nothing was changed/)
  for (const p of ['package.json', 'plugins/company/package-lock.json', '.dsh-home/x.json', 'forge/company/company.json', 'forge/super-agent/state.json', 'forge/mcp/github.yaml', 'plugins/x/node_modules/y/index.js', '.github/workflows/ci.yml', 'plugins/our-free-model/index.js', 'plugins/x/.env'])
    assert.match(changeProblems([f(p)])[0], /never changed by a repair/, p)
  for (const p of ['plugins/super-agent/lib/repair.js', 'plugins/super-agent/bin/restart-guard.mjs', 'plugins/agent-forge/lib/tools.js'])
    assert.match(changeProblems([f(p)])[0], /repair machinery and the sandbox/, p)
  assert.match(changeProblems([f('dsh')])[0], /outside what a repair may change/)
  assert.match(changeProblems([f('plugins/x/test/a.test.mjs', 0, 40, 'D')])[0], /does not delete tests/)
  assert.match(changeProblems([f('plugins/a.js', 700, 200)])[0], /900 lines changed/)
  assert.match(changeProblems(Array.from({ length: 26 }, (_, i) => f(`plugins/a${i}.js`)))[0], /26 files/)
})

test('secrets in added lines are found; removed lines and ordinary code are not', () => {
  assert.ok(findSecret('+const k = "sk-abcdefghijklmnopqrstuvwxyz012345"'))
  assert.ok(findSecret('+  apiKey: "A1b2C3d4E5f6G7h8I9j0K1l2"'))
  assert.ok(findSecret('+-----BEGIN RSA PRIVATE KEY-----'))
  assert.ok(findSecret('+x = "zzzz-local-forward-key-1234"', ['zzzz-local-forward-key-1234']))
  assert.equal(findSecret('-const k = "sk-abcdefghijklmnopqrstuvwxyz012345"\n+const token = process.env.TOKEN\n+const maxTokens = 32768'), null)
})

const sandbox = process.platform === 'darwin' && fs.existsSync('/usr/bin/sandbox-exec') && process.env.FORGE_SANDBOX !== 'off'

function world() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repair-test-')))
  const root = path.join(base, 'repo'), remote = path.join(base, 'remote.git'), home = path.join(root, 'forge')
  const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  fs.mkdirSync(path.join(root, 'plugins/demo/lib'), { recursive: true })
  fs.mkdirSync(path.join(root, 'plugins/demo/test'), { recursive: true })
  fs.mkdirSync(path.join(home, 'super-agent'), { recursive: true })
  fs.mkdirSync(path.join(home, 'agents'), { recursive: true })
  // installed dependencies, ignored the usual way (a pattern that matches folders, not the links a working copy gets)
  fs.mkdirSync(path.join(root, 'node_modules/dep'), { recursive: true })
  fs.mkdirSync(path.join(root, 'plugins/node_modules/dep'), { recursive: true })
  fs.writeFileSync(path.join(root, 'node_modules/dep/index.js'), 'export default 1\n')
  fs.writeFileSync(path.join(root, '.gitignore'), 'forge/super-agent/\nnode_modules/\n')
  fs.writeFileSync(path.join(root, 'plugins/demo/lib/sum.js'), 'export const sum = (a, b) => a - b\n')
  fs.writeFileSync(path.join(root, 'plugins/demo/test/sum.test.mjs'), `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { sum } from '../lib/sum.js'\ntest('sum', () => assert.equal(sum(2, 3), 5))\n`)
  fs.writeFileSync(path.join(home, 'agents/a.yaml'), 'name: a\nmodel: sonnet\n')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  git(['init', '-q', '-b', 'main']); git(['config', 'user.email', 'test@example.invalid']); git(['config', 'user.name', 'Test'])
  git(['add', '-A']); git(['commit', '-q', '-m', 'start']); git(['remote', 'add', 'origin', remote]); git(['push', '-q', 'origin', 'main'])
  const state = { settings: { repair: { restart: false, push: true } } }
  const said = [], agents = new Map()
  const sa = {
    log: () => {}, say: m => said.push(m.text), trigger: () => {},
    store: { read: () => state, update: fn => fn(state) },
    forge: { registry: { home, listAgents: () => [...agents.values()], saveAgent: d => agents.set(d.name, d) } },
    startJob: async (_me, _kind, _id, _msg, _lane, fn) => { sa.result = await fn(sa.api); return 'started' },
  }
  const rep = new Repair(sa, { root })
  // scripted engineer and reviewer
  sa.script = { fix: wt => fs.writeFileSync(path.join(wt, 'plugins/demo/lib/sum.js'), 'export const sum = (a, b) => a + b\n'), approve: true }
  sa.api = { agent: async (name, _prompt, o) => {
    if (name === ENGINEER) { sa.script.fix(o.cwd); return { ok: true, structured: { fixed: true, summary: 'Fix sum: add instead of subtract', cause: 'the operator was a minus', tested: 'node plugins/demo/test/sum.test.mjs: 1 pass' } } }
    if (name === REVIEWER) { sa.reviewed = _prompt; return { ok: true, structured: { approve: sa.script.approve, reason: sa.script.approve ? 'one operator changed; it fixes the stated cause' : 'it also changes an unrelated limit' } } }
  } }
  const ask = () => rep.act({ id: 'coo', title: 'COO' }, 'repair_harness', { problem: 'sum(2, 3) returns -1; every total on the dashboard is wrong', evidence: 'plugins/demo/test/sum.test.mjs fails: expected 5, got -1' })
  return { root, remote, home, git, sa, rep, said, ask, agents }
}

test('a repair: snapshot, fix in a copy, limits, sandboxed tests, review, commit, fast-forward, push', { skip: !sandbox }, async () => {
  const w = world()
  // configuration the company changed while running is committed first; runtime state is not
  fs.appendFileSync(path.join(w.home, 'agents/a.yaml'), 'skills:\n  - learned-x\n')
  fs.writeFileSync(path.join(w.home, 'super-agent/state.json'), '{}')
  fs.writeFileSync(path.join(w.root, 'notes.txt'), 'not ours to commit')
  assert.match(await w.ask(), /Repair r\w+ is running/)
  assert.match(w.sa.result, /applied: "Fix sum: add instead of subtract"[\s\S]*plugins\/demo\/lib\/sum\.js[\s\S]*pushed to origin main/)
  const log = w.git(['log', '--format=%s']).split('\n')
  assert.deepEqual(log, ['Fix sum: add instead of subtract', 'State before a repair: agents, teams, skills and workflows as they are now', 'start'])
  assert.match(w.git(['log', '-1', '--format=%b']), /Problem \(reported by COO\)[\s\S]*Cause: the operator was a minus[\s\S]*reviewed by .*harness-reviewer/)
  assert.equal(fs.readFileSync(path.join(w.root, 'plugins/demo/lib/sum.js'), 'utf8'), 'export const sum = (a, b) => a + b\n', 'main has the fix')
  assert.equal(execFileSync('git', ['rev-parse', 'main'], { cwd: w.remote, encoding: 'utf8' }).trim(), w.git(['rev-parse', 'HEAD']), 'and so has origin')
  assert.deepEqual(w.git(['status', '--porcelain']).split('\n'), ['?? notes.txt'], 'a file outside the allowed paths is left alone')
  assert.deepEqual(w.git(['worktree', 'list']).split('\n').length, 1, 'the working copy is gone')
  assert.equal(w.git(['branch', '--list', 'repair/*']), '')
  assert.doesNotMatch(w.git(['show', '--stat', '--format=', 'HEAD']), /node_modules/, 'the links to the installed dependencies are not part of the commit')
  assert.match(w.sa.reviewed, /1 test files pass in the sandbox[\s\S]*-export const sum = \(a, b\) => a - b/)
  assert.ok(w.agents.get(ENGINEER).execution?.mode === 'sandbox' && w.agents.get(REVIEWER).tools.every(t => ['Read', 'Grep', 'Glob'].includes(t)))
  assert.match(await w.rep.act({ id: 'coo' }, 'repair_log', {}), /\[applied\][\s\S]*pushed/)
})

test('a repair is refused when tests fail, the reviewer says no, or it leaves the allowed paths; main stays as it was', { skip: !sandbox }, async () => {
  const w = world()
  const head = () => w.git(['rev-parse', 'HEAD'])
  const start = head()
  w.sa.script.fix = wt => fs.writeFileSync(path.join(wt, 'plugins/demo/lib/sum.js'), 'export const sum = (a, b) => a * b\n')
  await w.ask()
  assert.match(w.sa.result, /Not applied: tests fail on the changed code: plugins\/demo\/test\/sum\.test\.mjs/)
  w.sa.script.fix = wt => { fs.writeFileSync(path.join(wt, 'plugins/demo/lib/sum.js'), 'export const sum = (a, b) => a + b\n'); fs.writeFileSync(path.join(wt, 'package.json'), '{"dependencies":{"left-pad":"*"}}') }
  await w.ask()
  assert.match(w.sa.result, /outside the limits: package\.json: dependencies, secrets and runtime data/)
  w.sa.script.fix = wt => fs.writeFileSync(path.join(wt, 'plugins/demo/lib/sum.js'), 'export const sum = (a, b) => a + b\nexport const key = "sk-abcdefghijklmnopqrstuvwxyz012345"\n')
  await w.ask()
  assert.match(w.sa.result, /looks like a secret/)
  w.sa.script.fix = wt => fs.writeFileSync(path.join(wt, 'plugins/demo/lib/sum.js'), 'export const sum = (a, b) => a + b\n')
  w.sa.script.approve = false
  await w.ask()
  assert.match(w.sa.result, /the reviewer rejected it: it also changes an unrelated limit/)
  assert.equal(head(), start, 'nothing was committed')
  assert.equal(w.git(['status', '--porcelain']), '')
  assert.equal(w.git(['branch', '--list', 'repair/*']), '')
  // the daily limit
  assert.match(await w.ask(), /limit of 4 repairs a day/)
  await assert.rejects(w.rep.act({ id: 'coo' }, 'repair_harness', { problem: 'broken', evidence: 'x' }), /say concretely/)
})

test('a snapshot refuses to commit a secret and commits nothing', async () => {
  const w = world()
  // pushing is off until the owner switches it on
  w.sa.store.read().settings.repair.push = undefined
  assert.match((await w.rep.push()).note, /switched off, the commit is local/)
  fs.appendFileSync(path.join(w.home, 'agents/a.yaml'), 'env:\n  token: "ghp_abcdefghijklmnopqrstuvwxyz0123456789"\n')
  await assert.rejects(w.rep.snapshot(), /looks like a secret/)
  assert.equal(w.git(['log', '--format=%s']), 'start')
  assert.equal(w.git(['diff', '--cached', '--name-only']), '')
  w.git(['checkout', '-q', '-b', 'side'])
  await assert.rejects(w.rep.snapshot(), /not main/)
})
