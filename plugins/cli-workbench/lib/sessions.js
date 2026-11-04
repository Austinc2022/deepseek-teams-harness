/**
 * CLI Workbench sessions: interactive Claude Code / Codex / OpenCode terminals,
 * each in a PTY and (for a git repo) its own git worktree on its own branch.
 *
 * Sessions live in this server process. The browser streams output over a
 * long-lived HTTP response and sends keystrokes with small POSTs, so it works
 * on any plain HTTP route. A replay buffer lets a reloaded page reattach.
 * Session metadata is saved so worktrees are remembered across restarts.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pty = require('node-pty')

/**
 * accountEnv: the variable that points a CLI at a separate config/login folder,
 * so several logins (e.g. different subscription plans) can run side by side.
 * loginArgs: how to start that CLI's login flow in a terminal.
 */
export const CLIS = {
  claude: { label: 'Claude Code', bin: 'claude', envVar: 'FORGE_CLAUDE_BIN', skipFlag: '--dangerously-skip-permissions', accountEnv: 'CLAUDE_CONFIG_DIR', loginArgs: [] },
  codex: { label: 'Codex', bin: 'codex', envVar: 'FORGE_CODEX_BIN', skipFlag: '--dangerously-bypass-approvals-and-sandbox', accountEnv: 'CODEX_HOME', loginArgs: ['login'] },
  opencode: { label: 'OpenCode', bin: 'opencode', envVar: 'FORGE_OPENCODE_BIN', accountEnv: 'XDG_DATA_HOME', loginArgs: ['auth', 'login'] },
}
const ACCOUNT_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/
const REPLAY_BYTES = 256 * 1024
export const MAX_SESSIONS = Number(process.env.WORKBENCH_MAX_SESSIONS ?? 32)

const expand = p => (p?.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p)
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

function resolveBin(cmd) {
  if (cmd.includes('/')) return fs.existsSync(cmd) ? cmd : null
  for (const d of [...(process.env.PATH ?? '').split(':'), path.join(os.homedir(), '.local/node/bin'), '/opt/homebrew/bin', '/usr/local/bin']) {
    const f = path.join(d, cmd)
    try { fs.accessSync(f, fs.constants.X_OK); return f } catch {}
  }
  return null
}

/** Parent env minus variables of any Claude Code process that launched the harness. */
function cleanEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE$|CLAUDE_CODE_ENTRYPOINT$|CLAUDE_CODE_SSE_PORT$|CLAUDE_PID$|CLAUDE_AGENT_SDK_|CLAUDE_BRIDGE_TOKEN$)/.test(k)))
  env.PATH = `${path.join(os.homedir(), '.local/node/bin')}:${env.PATH ?? ''}`
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  return env
}

export class Workbench {
  constructor(home) {
    this.dir = path.join(home, 'worktrees')
    this.accountsDir = path.join(home, '.cache', 'accounts')
    this.stateFile = path.join(home, '.cache', 'workbench.json')
    fs.mkdirSync(this.dir, { recursive: true })
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true })
    this.live = new Map() // id -> { meta, proc, buf, listeners:Set }
    this.saved = this.#load()
  }

  #load() {
    let st
    try { st = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) } catch { st = {} }
    st.sessions ??= {}
    st.accounts ??= {}
    st.lastRepo ??= ''
    return st
  }
  #persist() {
    fs.writeFileSync(`${this.stateFile}.tmp`, JSON.stringify(this.saved, null, 2))
    fs.renameSync(`${this.stateFile}.tmp`, this.stateFile)
  }

  status() {
    return Object.fromEntries(Object.entries(CLIS).map(([k, c]) => [k, { label: c.label, installed: !!resolveBin(process.env[c.envVar] ?? c.bin), canSkip: !!c.skipFlag }]))
  }

  list() {
    return {
      lastRepo: this.saved.lastRepo ?? '',
      accounts: this.listAccounts(),
      max: MAX_SESSIONS,
      sessions: Object.values(this.saved.sessions).map(m => ({ ...m, running: this.live.get(m.id)?.proc != null })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }
  }

  // ---------- accounts ----------
  listAccounts() {
    return Object.values(this.saved.accounts).map(a => ({ ...a, sessions: Object.values(this.saved.sessions).filter(s => s.account === a.id).length })).sort((a, b) => a.id.localeCompare(b.id))
  }

  /** Add a named login for a CLI. Its config folder is private (mode 700) and holds that login. */
  addAccount({ cli, name, copySettings = true }) {
    if (!CLIS[cli]) throw new Error(`unknown CLI ${cli}`)
    name = String(name ?? '').trim().toLowerCase()
    if (!ACCOUNT_NAME.test(name)) throw new Error('account name: lowercase letters, digits and hyphens (max 32)')
    const id = `${cli}-${name}`
    if (this.saved.accounts[id]) throw new Error(`account ${name} already exists for ${CLIS[cli].label}`)
    const dir = path.join(this.accountsDir, id)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    fs.chmodSync(this.accountsDir, 0o700)
    // carry over your Claude Code settings and personal CLAUDE.md (never credentials)
    if (cli === 'claude' && copySettings) {
      for (const f of ['settings.json', 'CLAUDE.md']) {
        const src = path.join(os.homedir(), '.claude', f)
        if (fs.existsSync(src) && !fs.existsSync(path.join(dir, f))) fs.copyFileSync(src, path.join(dir, f))
      }
    }
    this.saved.accounts[id] = { id, cli, name, dir, createdAt: new Date().toISOString() }
    this.#persist()
    return this.saved.accounts[id]
  }

  /** Remove an account and its config folder (its saved login). Refused while sessions use it. */
  removeAccount(id) {
    const a = this.saved.accounts[id]
    if (!a) throw new Error('unknown account')
    const using = Object.values(this.saved.sessions).filter(s => s.account === id)
    if (using.length) throw new Error(`close its ${using.length} session(s) first: ${using.map(s => s.title).join(', ')}`)
    if (path.dirname(a.dir) === this.accountsDir) fs.rmSync(a.dir, { recursive: true, force: true })
    delete this.saved.accounts[id]
    this.#persist()
    return { ok: true }
  }

  /** Open a terminal running the CLI's login flow for an account. */
  login(accountId) {
    const a = this.saved.accounts[accountId]
    if (!a) throw new Error('unknown account')
    return this.create({ cli: a.cli, account: a.id, repo: os.homedir(), worktree: false, title: `Log in: ${a.name}`, login: true })
  }

  /** Accounts to use for a launch of `count` sessions: one id, '' (your normal login) or '*' (spread over all of this CLI's accounts). */
  pickAccounts(cli, account, count) {
    if (account !== '*') return Array(count).fill(account || '')
    const all = this.listAccounts().filter(a => a.cli === cli)
    if (!all.length) return Array(count).fill('')
    // least-used first, then round-robin
    all.sort((a, b) => a.sessions - b.sessions)
    return Array.from({ length: count }, (_, i) => all[i % all.length].id)
  }

  /** Create a worktree (if repo is a git repo and worktree requested) and start the CLI in it. */
  create({ cli = 'claude', repo, worktree = true, base, title, skipPermissions = false, args = '', account = '', login = false }) {
    if (!CLIS[cli]) throw new Error(`unknown CLI ${cli}`)
    if (account && this.saved.accounts[account]?.cli !== cli) throw new Error(`unknown ${CLIS[cli].label} account ${account}`)
    if (this.live.size >= MAX_SESSIONS) throw new Error(`at most ${MAX_SESSIONS} sessions (set WORKBENCH_MAX_SESSIONS to change)`)
    const dir = path.resolve(expand(String(repo ?? '').trim()) || os.homedir())
    if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`folder not found: ${dir}`)
    const id = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`
    const meta = { id, cli, repo: dir, cwd: dir, title: String(title ?? '').trim().slice(0, 60) || `${CLIS[cli].label} ${Object.keys(this.saved.sessions).length + 1}`, skipPermissions: !login && !!skipPermissions && !!CLIS[cli].skipFlag, args: login ? '' : String(args ?? '').trim(), account: account || undefined, login: login || undefined, createdAt: new Date().toISOString() }

    if (worktree) {
      let top
      try { top = git(dir, 'rev-parse', '--show-toplevel') } catch { throw new Error(`${dir} is not a git repository. Untick "own worktree" to run in the folder directly, or run git init there first.`) }
      try { git(top, 'rev-parse', '--verify', 'HEAD') } catch { throw new Error(`${top} has no commits yet; make a first commit so worktrees have something to branch from.`) }
      const repoName = path.basename(top).replace(/[^\w.-]/g, '_')
      const branch = `wb/${id}`
      const wt = path.join(this.dir, repoName, id)
      fs.mkdirSync(path.dirname(wt), { recursive: true })
      git(top, 'worktree', 'add', '-b', branch, wt, ...(base ? [String(base)] : []))
      Object.assign(meta, { repo: top, cwd: wt, worktree: wt, branch, base: base || git(top, 'rev-parse', '--abbrev-ref', 'HEAD') })
    }
    this.saved.sessions[id] = meta
    if (!login) this.saved.lastRepo = String(repo ?? '').trim()
    this.#persist()
    this.start(id)
    return meta
  }

  /** (Re)start the CLI process for a saved session. Resumes the latest conversation when restarting Claude/Codex. */
  start(id, { resume = false } = {}) {
    const meta = this.saved.sessions[id]
    if (!meta) throw new Error('unknown session')
    const cur = this.live.get(id)
    if (cur?.proc) return meta
    if (!fs.existsSync(meta.cwd)) throw new Error(`working folder is gone: ${meta.cwd}`)
    const c = CLIS[meta.cli]
    const bin = resolveBin(process.env[c.envVar] ?? c.bin)
    if (!bin) throw new Error(`${c.bin} is not installed`)
    const args = meta.login ? [...c.loginArgs] : []
    if (meta.login) resume = false
    if (resume && meta.cli === 'claude') args.push('--continue')
    if (resume && meta.cli === 'codex') args.push('resume', '--last')
    if (resume && meta.cli === 'opencode') args.push('--continue')
    if (meta.skipPermissions) args.push(c.skipFlag)
    if (meta.args) args.push(...meta.args.match(/"[^"]*"|'[^']*'|\S+/g).map(a => a.replace(/^(["'])(.*)\1$/, '$2')))
    const s = cur ?? { meta, buf: '', listeners: new Set(), cols: 120, rows: 32 }
    const env = cleanEnv()
    // use the subscription login, never an API key that happens to be in the harness environment
    if (meta.cli === 'claude') { delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ANTHROPIC_BASE_URL }
    if (meta.account) {
      const a = this.saved.accounts[meta.account]
      if (!a) throw new Error(`account ${meta.account} was removed`)
      fs.mkdirSync(a.dir, { recursive: true, mode: 0o700 })
      env[c.accountEnv] = a.dir
      // a separate login must not be overridden by an API key from the harness environment
      if (meta.cli === 'claude') { delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.CLAUDE_CODE_OAUTH_TOKEN }
      if (meta.cli === 'codex') delete env.OPENAI_API_KEY
    }
    s.proc = pty.spawn(bin, args, { name: 'xterm-256color', cols: s.cols, rows: s.rows, cwd: meta.cwd, env })
    s.exitCode = undefined
    s.proc.onData(d => {
      s.buf += d
      if (s.buf.length > REPLAY_BYTES) s.buf = s.buf.slice(-REPLAY_BYTES)
      for (const l of s.listeners) l({ t: 'o', d })
    })
    s.proc.onExit(({ exitCode }) => {
      s.proc = null
      s.exitCode = exitCode
      const note = `\r\n\x1b[2m[${c.label} exited with code ${exitCode}. Press Restart to start it again.]\x1b[0m\r\n`
      s.buf += note
      for (const l of s.listeners) { l({ t: 'o', d: note }); l({ t: 'x', code: exitCode }) }
    })
    this.live.set(id, s)
    for (const l of s.listeners) l({ t: 's', running: true })
    return meta
  }

  /** Subscribe to output; replays the buffer first. Returns an unsubscribe function. */
  attach(id, fn) {
    let s = this.live.get(id)
    if (!s) {
      const meta = this.saved.sessions[id]
      if (!meta) throw new Error('unknown session')
      // a saved session from an earlier server run: offer a restart in the pane
      s = { meta, buf: `\x1b[2m[Not running. Press Restart to start ${CLIS[meta.cli].label} again in ${meta.cwd}.]\x1b[0m\r\n`, listeners: new Set(), cols: 120, rows: 32, proc: null }
      this.live.set(id, s)
    }
    fn({ t: 'o', d: s.buf })
    fn({ t: 's', running: !!s.proc })
    s.listeners.add(fn)
    return () => s.listeners.delete(fn)
  }

  input(id, data) {
    const s = this.live.get(id)
    if (!s?.proc) throw new Error('session is not running')
    s.proc.write(String(data))
  }

  resize(id, cols, rows) {
    const s = this.live.get(id)
    if (!s) return
    s.cols = Math.max(20, Math.min(500, cols | 0))
    s.rows = Math.max(5, Math.min(200, rows | 0))
    try { s.proc?.resize(s.cols, s.rows) } catch {}
  }

  /** Stop (waiting for the exit) and start again, continuing the last conversation. */
  async restart(id) {
    const s = this.live.get(id)
    if (s?.proc) {
      const gone = new Promise(r => { const t = setInterval(() => { if (!s.proc) { clearInterval(t); r() } }, 50); setTimeout(() => { clearInterval(t); r() }, 5000) })
      try { s.proc.kill() } catch {}
      await gone
      if (s.proc) { try { s.proc.kill('SIGKILL') } catch {} s.proc = null }
    }
    return this.start(id, { resume: true })
  }

  stop(id) {
    const s = this.live.get(id)
    try { s?.proc?.kill() } catch {}
  }

  rename(id, title) {
    const meta = this.saved.sessions[id]
    if (!meta) throw new Error('unknown session')
    meta.title = String(title ?? '').trim().slice(0, 60) || meta.title
    this.#persist()
    return meta
  }

  /** git status / diff summary of a session's worktree. */
  changes(id) {
    const meta = this.saved.sessions[id]
    if (!meta) throw new Error('unknown session')
    if (!meta.worktree) return { status: '(not a worktree)', ahead: '' }
    return {
      status: git(meta.cwd, 'status', '--short', '--branch'),
      ahead: meta.base ? git(meta.cwd, 'log', '--oneline', `${meta.base}..HEAD`) : '',
    }
  }

  /**
   * Close a session. With removeWorktree, the worktree is removed only when it
   * has no uncommitted changes (unless force); its branch is kept so commits are never lost.
   */
  close(id, { removeWorktree = false, force = false } = {}) {
    const meta = this.saved.sessions[id]
    if (!meta) throw new Error('unknown session')
    if (removeWorktree && meta.worktree && fs.existsSync(meta.worktree)) {
      const dirty = git(meta.worktree, 'status', '--porcelain')
      if (dirty && !force) throw new Error(`worktree has uncommitted changes:\n${dirty.split('\n').slice(0, 10).join('\n')}\nCommit them, or close with "discard changes".`)
      this.stop(id)
      git(meta.repo, 'worktree', 'remove', ...(force ? ['--force'] : []), meta.worktree)
    } else {
      this.stop(id)
    }
    this.live.get(id)?.listeners.forEach(l => l({ t: 'closed' }))
    this.live.delete(id)
    delete this.saved.sessions[id]
    this.#persist()
    return { ok: true, branch: meta.branch }
  }

  shutdown() {
    for (const s of this.live.values()) try { s.proc?.kill() } catch {}
  }
}
