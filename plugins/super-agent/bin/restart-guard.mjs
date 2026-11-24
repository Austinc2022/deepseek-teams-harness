#!/usr/bin/env node
// Restarts the harness after a repair changed its code, and undoes the repair when the harness does not come back.
// Started detached by repair.js; the harness process then exits. Never run it by hand while the harness is healthy.
//   node restart-guard.mjs <json: { root, port, oldPid, argv, sha, push, log }>
import fs from 'node:fs'
import net from 'node:net'
import { spawn, execFileSync } from 'node:child_process'

const o = JSON.parse(process.argv[2])
const say = m => { try { fs.appendFileSync(o.log, `${new Date().toISOString()} ${m}\n`) } catch {} }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const alive = pid => { try { process.kill(pid, 0); return true } catch { return false } }
const listening = () => new Promise(r => { const s = net.connect(o.port, '127.0.0.1'); s.once('connect', () => { s.destroy(); r(true) }); s.once('error', () => r(false)); s.setTimeout(1500, () => { s.destroy(); r(false) }) })
const git = (...a) => execFileSync('git', a, { cwd: o.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

async function up(seconds) {
  const out = fs.openSync(o.out, 'a')
  const child = spawn(process.execPath, o.argv, { cwd: o.root, detached: true, stdio: ['ignore', out, out] })
  child.unref()
  for (let i = 0; i < seconds; i++) { await sleep(1000); if (await listening()) { await sleep(8000); if (alive(child.pid) && await listening()) return child.pid } if (!alive(child.pid)) break }
  try { process.kill(child.pid, 'SIGKILL') } catch {}
  return null
}

say(`restart after repair ${o.sha.slice(0, 8)}: waiting for process ${o.oldPid} to end`)
for (let i = 0; i < 40 && alive(o.oldPid); i++) await sleep(500)
if (alive(o.oldPid)) { try { process.kill(o.oldPid, 'SIGKILL') } catch {} await sleep(1000) }
let pid = await up(90)
if (pid) { say(`the harness is back (process ${pid}) on the repaired code`); process.exit(0) }
say('the harness did not start on the repaired code: undoing the repair')
try {
  git('revert', '--no-edit', o.sha)
  say(`reverted ${o.sha.slice(0, 8)}`)
  if (o.push) { try { git('push', 'origin', 'HEAD:main'); say('pushed the revert') } catch (e) { say(`the revert was not pushed: ${String(e.stderr ?? e.message).slice(0, 200)}`) } }
} catch (e) { say(`the revert failed: ${String(e.stderr ?? e.message).slice(0, 300)}`) }
fs.writeFileSync(o.failed, JSON.stringify({ sha: o.sha, ts: new Date().toISOString() }))
pid = await up(90)
say(pid ? `the harness is back (process ${pid}) on the code before the repair` : 'the harness did not start after the revert either: it needs the owner (./dsh web)')
