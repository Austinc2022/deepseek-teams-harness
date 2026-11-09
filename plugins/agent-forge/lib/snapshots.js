/**
 * Working-tree snapshots for the chat Files tab.
 *
 * snapshot(cwd) records the whole working tree (tracked + untracked, honouring
 * .gitignore) as a git tree object without touching the user's index, HEAD or
 * files: it copies the real index (to keep its stat cache, so unchanged files
 * are not re-hashed) to a temp file, runs `git add -A` against the copy and
 * `git write-tree`. Diffing two snapshots shows every file a step changed,
 * including changes made through shell commands.
 *
 * Worktree helpers create and merge per-worker git worktrees for the
 * supervisor mode.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'

const git = (cwd, args, { env, input, allowFail = false } = {}) => new Promise((resolve, reject) => {
  const child = execFile('git', ['-C', cwd, ...args], { env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err && !allowFail) return reject(new Error(`git ${args[0]}: ${String(stderr || err.message).trim().slice(0, 600)}`))
    resolve({ ok: !err, out: String(stdout), err: String(stderr) })
  })
  if (input != null) child.stdin.end(input)
})

const SHA = /^[0-9a-f]{40,64}$/

/** The repo root containing cwd, or null when cwd is not inside a git work tree. */
export async function repoRoot(cwd) {
  if (!cwd || !fs.existsSync(cwd)) return null
  const r = await git(cwd, ['rev-parse', '--show-toplevel'], { allowFail: true })
  return r.ok ? r.out.trim() : null
}

/** Snapshot cwd's repo working tree; returns { root, tree } or null (not a git repo, or git failed). */
export async function snapshot(cwd) {
  const root = await repoRoot(cwd)
  if (!root) return null
  const tmp = path.join(os.tmpdir(), `forge-index-${process.pid}-${crypto.randomBytes(4).toString('hex')}`)
  try {
    const idx = (await git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'index'])).out.trim()
    if (fs.existsSync(idx)) fs.copyFileSync(idx, tmp)
    else await git(root, ['read-tree', '--empty'], { env: { GIT_INDEX_FILE: tmp } })
    const env = { GIT_INDEX_FILE: tmp }
    await git(root, ['add', '-A'], { env })
    const tree = (await git(root, ['write-tree'], { env })).out.trim()
    return SHA.test(tree) ? { root, tree } : null
  } catch {
    return null
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

/** Files that differ between two snapshot trees: [{ path, status: A|M|D|R, add, del }]. */
export async function changedFiles(root, a, b) {
  if (!SHA.test(a) || !SHA.test(b) || a === b) return []
  const [ns, st] = await Promise.all([
    git(root, ['diff-tree', '-r', '--no-renames', '--numstat', a, b]),
    git(root, ['diff-tree', '-r', '--no-renames', '--name-status', a, b]),
  ])
  const status = new Map(st.out.trim().split('\n').filter(Boolean).map(l => { const [s, ...p] = l.split('\t'); return [p.join('\t'), s[0]] }))
  return ns.out.trim().split('\n').filter(Boolean).map(l => {
    const [add, del, ...p] = l.split('\t')
    const file = p.join('\t')
    return { path: file, status: status.get(file) ?? 'M', add: add === '-' ? null : Number(add), del: del === '-' ? null : Number(del) }
  })
}

/** Unified diff of one file between two snapshot trees. */
export async function fileDiff(root, a, b, file) {
  if (!SHA.test(a) || !SHA.test(b)) throw new Error('bad snapshot id')
  if (typeof file !== 'string' || !file || file.startsWith('-')) throw new Error('bad path')
  return (await git(root, ['diff', '--no-color', a, b, '--', file])).out
}

// ---------------- worktrees (supervisor workers)

/** Create a worktree on a new branch from base's HEAD. Returns { cwd, branch, base }. */
export async function addWorktree(baseCwd, dir, branch) {
  const root = await repoRoot(baseCwd)
  if (!root) throw new Error(`worktree isolation needs a git repository; ${baseCwd} is not one (use isolation "shared")`)
  const head = await git(root, ['rev-parse', '--verify', 'HEAD'], { allowFail: true })
  if (!head.ok) throw new Error('worktree isolation needs at least one commit in the repository')
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  await git(root, ['worktree', 'add', '-b', branch, dir, 'HEAD'])
  // keep the worker in the same sub-folder of the repo as the room folder
  const rel = path.relative(root, path.resolve(baseCwd))
  return { cwd: rel ? path.join(dir, rel) : dir, dir, branch, base: root, head: head.out.trim() }
}

/** Commit anything the worker left uncommitted, then return the branch's diff stat against where it started. */
export async function finishWorktree(w) {
  await git(w.dir, ['add', '-A'])
  const dirty = await git(w.dir, ['diff', '--cached', '--quiet'], { allowFail: true })
  if (!dirty.ok) await git(w.dir, ['-c', 'user.name=Agent Forge', '-c', 'user.email=agent-forge@localhost', 'commit', '-m', `${w.id}: uncommitted work`])
  return (await git(w.base, ['diff', '--stat', `${w.head}..${w.branch}`], { allowFail: true })).out.trim()
}

/** Merge a worker branch into the base repo's current branch; on conflict the merge is aborted. Removes the worktree after a clean merge. */
export async function mergeWorktree(w) {
  const r = await git(w.base, ['-c', 'user.name=Agent Forge', '-c', 'user.email=agent-forge@localhost', 'merge', '--no-ff', '-m', `Merge ${w.branch}`, w.branch], { allowFail: true })
  if (!r.ok) {
    await git(w.base, ['merge', '--abort'], { allowFail: true })
    return { ok: false, output: `${r.out}\n${r.err}`.trim() }
  }
  await git(w.base, ['worktree', 'remove', '--force', w.dir], { allowFail: true })
  return { ok: true, output: r.out.trim() }
}

export async function removeWorktree(w) {
  await git(w.base, ['worktree', 'remove', '--force', w.dir], { allowFail: true })
}
