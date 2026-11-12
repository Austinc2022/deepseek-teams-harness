/**
 * Execution targets: named places where an agent's Claude Code session runs, set up once by the owner and chosen
 * by name from an agent, a team, a super team or the company (docs/EXECUTION-TARGETS.md).
 *
 * A target is a YAML file in forge/targets/<name>.yaml:
 *
 *   kind: ssh                  host | sandbox | docker | ssh
 *   description: GPU box in the office
 *   host: devbox               ssh host (an alias from ~/.ssh/config, or user@host)
 *   port: 22                   optional
 *   identityFile: ~/.ssh/id_ed25519   optional
 *   remoteRoot: ~/agent-forge-work    where work folders are synced on the remote side
 *   claudePath: claude         the claude CLI on the remote side
 *   network: open              open | none (docker only: none adds --network none)
 *   sync: auto                 auto (rsync the work folder up before and back after each run) | shared (same path
 *                              exists on both sides, e.g. a network share) | none
 *   fallback: sandbox          sandbox (run in the local OS sandbox when the target is down) | none (fail the run)
 *   allowAgents: true          super agents may choose this target for their tickets (false: only the owner's
 *                              explicit settings use it)
 *   # docker only
 *   image: agent-forge-claude:latest
 *   runtime: docker            docker | podman
 *   runArgs: []                extra arguments for `docker run`
 *   ssh: devbox                optional: run docker on this ssh host (the folder is synced there first)
 *
 * What never leaves this machine: files matching SYNC_EXCLUDE (keys, .env files, tokens, ssh and cloud credentials).
 * The login for remote sessions is CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`), sent in a file readable only
 * by the remote user that is deleted when the session starts, never on a command line.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import YAML from 'yaml'
import { spawn, spawnSync } from 'node:child_process'
import { AsyncLocalStorage } from 'node:async_hooks'
import { secret } from './providers.js'

export const TARGET_KINDS = ['host', 'sandbox', 'docker', 'ssh']
const NAME = /^[a-z][a-z0-9-]{0,47}$/
export const SYNC_EXCLUDE = ['.env', '.env.*', '*.pem', '*.key', '*credentials*', '*-token', '*.token', '.ssh/', '.aws/', '.gnupg/', '.dsh-home/', '.git/objects/pack/*.pack']

const expand = p => (typeof p === 'string' && p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p)
const shq = s => `'${String(s).replace(/'/g, `'\\''`)}'`

export function targetsDir(home) { return path.join(home, 'targets') }

/** Check and fill in a target definition. Throws on anything that cannot work. */
export function normalizeTarget(t, name = t?.name) {
  if (!t || typeof t !== 'object') throw new Error('a target must be an object')
  if (!NAME.test(String(name ?? ''))) throw new Error(`invalid target name "${name}": lowercase letters, digits and dashes`)
  const d = { ...t, name }
  if (!TARGET_KINDS.includes(d.kind)) throw new Error(`target ${name}: kind must be one of ${TARGET_KINDS.join(', ')}`)
  d.description = String(d.description ?? '').slice(0, 300)
  d.sync = d.sync ?? (d.kind === 'ssh' || (d.kind === 'docker' && d.ssh) ? 'auto' : 'none')
  if (!['auto', 'shared', 'none'].includes(d.sync)) throw new Error(`target ${name}: sync must be auto, shared or none`)
  d.fallback = d.fallback ?? 'sandbox'
  if (!['sandbox', 'none'].includes(d.fallback)) throw new Error(`target ${name}: fallback must be sandbox or none`)
  d.network = d.network ?? 'open'
  if (!['open', 'none'].includes(d.network)) throw new Error(`target ${name}: network must be open or none`)
  d.allowAgents = d.allowAgents !== false
  if (d.kind === 'ssh' && !d.host) throw new Error(`target ${name}: an ssh target needs host`)
  if (d.kind === 'docker') { d.image ??= 'agent-forge-claude:latest'; d.runtime ??= 'docker'; if (!['docker', 'podman'].includes(d.runtime)) throw new Error(`target ${name}: runtime must be docker or podman`) }
  if (d.port !== undefined && !(Number.isInteger(Number(d.port)) && Number(d.port) > 0 && Number(d.port) < 65536)) throw new Error(`target ${name}: bad port`)
  for (const k of ['host', 'ssh']) if (d[k] !== undefined && !/^[\w.@-]+$/.test(String(d[k]))) throw new Error(`target ${name}: ${k} may contain letters, digits, dots, dashes, underscores and @ only`)
  d.remoteRoot = d.remoteRoot ?? '~/agent-forge-work'
  if (/['"`$\\;&|<>\n]/.test(d.remoteRoot)) throw new Error(`target ${name}: remoteRoot has characters that are not allowed`)
  d.claudePath = d.claudePath ?? 'claude'
  if (!Array.isArray(d.runArgs ?? [])) throw new Error(`target ${name}: runArgs must be a list`)
  return d
}

export class Targets {
  constructor(home) { this.dir = targetsDir(home); fs.mkdirSync(this.dir, { recursive: true }); this.health = new Map() }
  file(name) { if (!NAME.test(String(name))) throw new Error(`invalid target name "${name}"`); return path.join(this.dir, `${name}.yaml`) }
  list() {
    let files = []
    try { files = fs.readdirSync(this.dir).filter(f => f.endsWith('.yaml')).sort() } catch {}
    return files.map(f => {
      const name = f.slice(0, -5)
      try { return normalizeTarget(YAML.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')) ?? {}, name) } catch (e) { return { name, invalid: e.message } }
    })
  }
  get(name) {
    if (name === 'host') return normalizeTarget({ kind: 'host', description: 'This machine, no sandbox' }, 'host')
    if (name === 'sandbox') return normalizeTarget({ kind: 'sandbox', description: 'This machine, in the OS sandbox' }, 'sandbox')
    const f = this.file(name)
    if (!fs.existsSync(f)) throw new Error(`unknown execution target "${name}"`)
    return normalizeTarget(YAML.parse(fs.readFileSync(f, 'utf8')) ?? {}, name)
  }
  save(t) {
    const d = normalizeTarget(t, t.name)
    if (['host', 'sandbox'].includes(d.name)) throw new Error(`"${d.name}" is built in`)
    const { name, ...rest } = d
    fs.writeFileSync(this.file(name), YAML.stringify(rest))
    this.health.delete(name)
    return d
  }
  remove(name) { fs.rmSync(this.file(name), { force: true }); this.health.delete(name); return { ok: true } }
  /** Names super agents may pick (allowAgents and loadable). */
  choices() { return ['sandbox', ...this.list().filter(t => !t.invalid && t.allowAgents && t.kind !== 'host').map(t => t.name)] }

  /** Is the target reachable now? Cached for a minute. { ok, detail, ms } */
  check(t, { fresh = false } = {}) {
    const c = this.health.get(t.name)
    if (!fresh && c && Date.now() - c.at < 60_000) return c
    const t0 = Date.now()
    let r
    if (t.kind === 'host' || t.kind === 'sandbox') r = { ok: true, detail: 'this machine' }
    else {
      const [cmd, ...args] = t.kind === 'ssh' || t.ssh ? [...sshPrefix(t), t.kind === 'docker' ? `${t.runtime} version --format '{{.Server.Version}}' && command -v rsync >/dev/null` : `command -v ${shq(t.claudePath)} >/dev/null && command -v rsync >/dev/null && echo ok`] : [t.runtime, 'version', '--format', '{{.Server.Version}}']
      const p = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20_000 })
      r = p.status === 0 ? { ok: true, detail: (p.stdout || 'ok').trim().split('\n').at(-1).slice(0, 120) } : { ok: false, detail: (p.error?.message ?? p.stderr ?? `exit ${p.status}`).toString().trim().split('\n').slice(-2).join(' ').slice(0, 300) || `exit ${p.status}` }
    }
    const out = { ...r, ms: Date.now() - t0, at: Date.now() }
    this.health.set(t.name, out)
    return out
  }
}

/** The ssh command (as argv) for a target: ssh [-p port] [-i key] -o BatchMode=yes host */
export function sshPrefix(t) {
  if (Array.isArray(t.sshCommand) && t.sshCommand.length) return [...t.sshCommand, t.ssh ?? t.host] // tests and custom wrappers
  const args = ['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10']
  if (t.port) args.push('-p', String(t.port))
  if (t.identityFile) args.push('-i', expand(t.identityFile))
  args.push(t.ssh ?? t.host)
  return args
}
/** The -e argument rsync needs to use the same ssh settings. */
function rsyncShell(t) {
  const p = sshPrefix(t)
  return p.slice(0, -1).map(shq).join(' ')
}

const remoteDirFor = (t, local) => `${t.remoteRoot.replace(/\/+$/, '')}/${path.basename(local).replace(/[^\w.-]/g, '_').slice(0, 40)}-${crypto.createHash('sha1').update(local).digest('hex').slice(0, 10)}`
// a remote path that starts with ~/ is resolved by the remote shell
const rq = p => (p.startsWith('~/') ? `"$HOME"/${shq(p.slice(2))}` : shq(p))

function rsync(t, from, to, { del = false } = {}) {
  const host = t.ssh ?? t.host
  const args = ['-a', '--partial', ...(del ? ['--delete'] : []), ...SYNC_EXCLUDE.map(x => `--exclude=${x}`), '-e', rsyncShell(t)]
  // rsync expands ~ on the remote side itself; keep remote paths unquoted for it
  const r = spawnSync('rsync', [...args, from.remote ? `${host}:${from.path}/` : `${from.path}/`, to.remote ? `${host}:${to.path}/` : `${to.path}/`], { encoding: 'utf8', timeout: 30 * 60_000 })
  if (r.status !== 0) throw new Error(`rsync ${from.remote ? 'down' : 'up'} failed: ${(r.stderr || r.error?.message || `exit ${r.status}`).toString().trim().slice(0, 300)}`)
}

function sshRun(t, line, input) {
  const [cmd, ...args] = sshPrefix(t)
  const r = spawnSync(cmd, [...args, line], { encoding: 'utf8', input, timeout: 60_000 })
  if (r.status !== 0) throw new Error(`ssh ${t.ssh ?? t.host}: ${(r.stderr || r.error?.message || `exit ${r.status}`).toString().trim().slice(0, 300)}`)
  return r.stdout
}

const FORWARD_ENV = /^(CLAUDE_CODE_OAUTH_TOKEN$|ANTHROPIC_|CLAUDE_CODE_(ENTRYPOINT|ENABLE_|DISABLE_|MAX_|USE_)|CLAUDE_AGENT_SDK_|MCP_|ENABLE_|DISABLE_|MAX_|BASH_|HTTPS?_PROXY$|NO_PROXY$)/

/**
 * Prepare a remote run: sync the work folder up, and return a spawner for the Agent SDK and a finish() that syncs
 * the results back. Local docker needs neither sync nor ssh.
 *   paths: { cwd, extraDirs }  local folders the session uses; only cwd is synced (extra folders stay local and are
 *                              dropped from the remote session)
 */
export function prepareRemote(t, { cwd, extraDirs = [] }) {
  const remote = t.kind === 'ssh' || (t.kind === 'docker' && t.ssh)
  const rdir = remote ? (t.sync === 'shared' ? cwd : remoteDirFor(t, cwd)) : cwd
  if (remote && t.sync === 'auto') {
    sshRun(t, `mkdir -p ${rq(rdir)}`)
    rsync(t, { path: cwd }, { remote: true, path: rdir }, { del: true })
  }
  const envFile = `${t.remoteRoot.replace(/\/+$/, '')}/.env-${crypto.randomBytes(6).toString('hex')}`
  const spawner = opts => {
    const env = Object.entries(opts.env ?? {}).filter(([k, v]) => v !== undefined && v !== '' && FORWARD_ENV.test(k))
    const token = secret('CLAUDE_CODE_OAUTH_TOKEN')
    if (token && !env.some(([k]) => k === 'CLAUDE_CODE_OAUTH_TOKEN')) env.push(['CLAUDE_CODE_OAUTH_TOKEN', token])
    // local folders the remote side does not have: drop them; the work folder maps to its remote copy
    const args = opts.args.filter(a => !(a.startsWith('--add-dir=') && t.sync !== 'shared' && remote)).map(a => (remote && t.kind === 'ssh' ? a.split(cwd).join(rdir) : a))
    if (t.kind === 'docker' && !remote) {
      const dargs = ['run', '-i', '--rm', '-v', `${cwd}:${cwd}`, '-w', cwd]
      for (const d of extraDirs) dargs.push('-v', `${d}:${d}:ro`)
      for (const [k] of env) dargs.push('-e', k)
      if (t.network === 'none') dargs.push('--network', 'none')
      dargs.push(...(t.runArgs ?? []), t.image, t.claudePath, ...args)
      return spawn(t.runtime, dargs, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...Object.fromEntries(env) }, signal: opts.signal })
    }
    // remote: write the environment to a private file first (never on a command line), then start the session
    const envText = env.map(([k, v]) => `${k}=${shq(v)}`).join('\n') + '\n'
    sshRun(t, `umask 077 && mkdir -p ${rq(t.remoteRoot)} && cat > ${rq(envFile)}`, envText)
    let line
    if (t.kind === 'ssh') {
      line = `cd ${rq(rdir)} && set -a && . ${rq(envFile)} && rm -f ${rq(envFile)} && set +a && exec ${shq(t.claudePath)} ${args.map(shq).join(' ')}`
    } else {
      // docker on the ssh host: the synced folder is mounted at the same path the session was told (cwd)
      const d = ['run', '-i', '--rm', '-v', `"$D":${shq(cwd)}`, '-w', shq(cwd), '--env-file', '"$E"']
      if (t.network === 'none') d.push('--network', 'none')
      d.push(...(t.runArgs ?? []).map(shq), shq(t.image), shq(t.claudePath), ...args.map(shq))
      line = `D=$(cd ${rq(rdir)} && pwd) && E=$(mktemp) && sed -e "s/^\\([A-Z0-9_]*\\)='\\(.*\\)'$/\\1=\\2/" ${rq(envFile)} > "$E" && rm -f ${rq(envFile)} && trap 'rm -f "$E"' EXIT && ${t.runtime} ${d.join(' ')}`
    }
    const [cmd, ...pre] = sshPrefix(t)
    return spawn(cmd, [...pre, line], { stdio: ['pipe', 'pipe', 'pipe'], signal: opts.signal })
  }
  const finish = () => {
    if (!remote) return
    try { sshRun(t, `rm -f ${rq(envFile)}`) } catch {}
    if (t.sync === 'auto') rsync(t, { remote: true, path: rdir }, { path: cwd })
  }
  return { spawner, finish, remoteDir: rdir, remote }
}

/** Test a target end to end: reachability, the claude CLI, and (for sync targets) a round trip of a small folder. */
export async function testTarget(targets, name) {
  const t = targets.get(name)
  const steps = []
  const c = targets.check(t, { fresh: true })
  steps.push({ step: 'reachable', ok: c.ok, detail: c.detail })
  if (!c.ok || t.kind === 'host' || t.kind === 'sandbox') return { ok: c.ok, target: name, steps }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-target-'))
  try {
    fs.writeFileSync(path.join(dir, 'probe.txt'), 'up')
    fs.writeFileSync(path.join(dir, '.env'), 'SECRET=must-not-leave')
    const r = prepareRemote(t, { cwd: dir })
    if (r.remote && t.sync === 'auto') {
      const listed = sshRun(t, `ls -a ${rq(r.remoteDir)}`)
      steps.push({ step: 'sync up', ok: listed.includes('probe.txt'), detail: listed.includes('probe.txt') ? 'work folder copied' : 'probe file missing on the remote side' })
      steps.push({ step: 'secrets stay local', ok: !listed.split('\n').includes('.env'), detail: listed.split('\n').includes('.env') ? '.env reached the remote side' : '.env was not copied' })
      sshRun(t, `echo down > ${rq(r.remoteDir)}/result.txt`)
      r.finish()
      const ok = fs.existsSync(path.join(dir, 'result.txt'))
      steps.push({ step: 'sync back', ok, detail: ok ? 'result copied back' : 'result file did not come back' })
      try { sshRun(t, `rm -rf ${rq(r.remoteDir)}`) } catch {}
    }
    const ver = t.kind === 'ssh' ? (() => { try { return sshRun(t, `${shq(t.claudePath)} --version`).trim() } catch (e) { return `error: ${e.message}` } })() : null
    if (ver) steps.push({ step: 'claude CLI', ok: !ver.startsWith('error'), detail: ver.slice(0, 160) })
    const token = !!secret('CLAUDE_CODE_OAUTH_TOKEN')
    steps.push({ step: 'login', ok: token || t.kind !== 'ssh', detail: token ? 'CLAUDE_CODE_OAUTH_TOKEN is set and is sent per session' : 'CLAUDE_CODE_OAUTH_TOKEN is not set here: the remote side must already be logged in (run `claude setup-token` and set it in .dsh-home/.env)' })
  } catch (e) {
    steps.push({ step: 'error', ok: false, detail: e.message })
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  return { ok: steps.every(s => s.ok || s.step === 'login'), target: name, steps }
}

// ---------------------------------------------------------------- which target a run uses
const als = (globalThis[Symbol.for('agent-forge.targetctx')] ??= new AsyncLocalStorage())
/**
 * Run fn with a default execution target for the sandboxed builders it starts. Callers nest: the company default
 * wraps a super team's, which wraps a team's; the innermost wins. null or '' leaves the current default.
 */
export const withTarget = (name, fn) => (name ? als.run({ target: String(name) }, fn) : fn())
export const currentTarget = () => als.getStore()?.target ?? null

/** Builders run in the OS sandbox (or an old container / vm mode); only they take an inherited target. */
export const takesInheritedTarget = def => ['sandbox', 'container', 'vm'].includes(def.execution?.mode)

/**
 * The execution a run uses: { execution, target, note }. An agent's own execution.target always wins; otherwise a
 * sandboxed builder takes, first match: the run's explicit target (a ticket), its team's execution.target, then the
 * default its callers set with withTarget (a super team inside the company default). A
 * target that is down falls back to the local sandbox unless it says fallback: none.
 */
export function resolveExecution(home, def, explicit, teamTarget) {
  const own = def.execution?.target
  const name = own ?? (takesInheritedTarget(def) ? (explicit || teamTarget || currentTarget()) : null)
  if (!name) return { execution: def.execution, target: null, note: null }
  const targets = (globalThis[Symbol.for('agent-forge.targets')] ??= new Map())
  const reg = targets.get(home) ?? new Targets(home)
  targets.set(home, reg)
  const t = reg.get(name)
  const sandbox = def.execution?.mode === 'sandbox' ? def.execution : { mode: 'sandbox' }
  // an inherited "host" never takes a builder out of its sandbox
  if (t.kind === 'host') return own ? { execution: { ...def.execution, mode: 'host' }, target: t, note: null } : { execution: sandbox, target: null, note: 'an inherited host target is ignored for a sandboxed builder' }
  if (t.kind === 'sandbox') return { execution: sandbox, target: t, note: null }
  const c = reg.check(t)
  if (!c.ok) {
    if (t.fallback === 'none') throw new Error(`execution target ${name} is not reachable (${c.detail}) and has fallback: none`)
    return { execution: sandbox, target: null, note: `execution target ${name} is not reachable (${c.detail}); ran in the local sandbox instead` }
  }
  return { execution: { ...def.execution, mode: 'target' }, target: t, note: null }
}
