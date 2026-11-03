/**
 * An agent's content folder (forge/agent-homes/<name>/files): reference docs,
 * notes and data the agent reads and maintains. All paths are relative to that
 * folder; anything resolving outside it (.., absolute paths, symlinks) is refused.
 */
import fs from 'node:fs'
import path from 'node:path'

const MAX_READ = 2 * 1024 * 1024
const MAX_WRITE = 25 * 1024 * 1024
const MAX_LIST = 2000

function inside(root, rel) {
  if (typeof rel !== 'string' || !rel.trim()) throw new Error('path is required')
  if (path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) throw new Error(`path must stay inside the content folder: ${rel}`)
  const full = path.resolve(root, rel)
  const realRoot = fs.realpathSync(root)
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`path escapes the content folder: ${rel}`)
  // refuse symlinks that point outside (check the nearest existing ancestor)
  let probe = full
  while (!fs.existsSync(probe)) probe = path.dirname(probe)
  const real = fs.realpathSync(probe)
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new Error(`path escapes the content folder: ${rel}`)
  return full
}

export function listFiles(root) {
  const out = []
  const walk = (dir, prefix) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= MAX_LIST) return
      if (ent.name === '.DS_Store') continue
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(full, rel)
      else if (ent.isFile()) { const st = fs.statSync(full); out.push({ path: rel, size: st.size, mtime: st.mtime.toISOString() }) }
    }
  }
  walk(root, '')
  return out
}

const looksBinary = buf => buf.subarray(0, 8000).includes(0)

export function readFile(root, rel) {
  const full = inside(root, rel)
  const st = fs.statSync(full)
  if (!st.isFile()) throw new Error(`not a file: ${rel}`)
  if (st.size > MAX_READ) return { path: rel, size: st.size, binary: true, content: null, note: 'too large to show' }
  const buf = fs.readFileSync(full)
  if (looksBinary(buf)) return { path: rel, size: st.size, binary: true, content: null }
  return { path: rel, size: st.size, binary: false, content: buf.toString('utf8') }
}

export function writeFile(root, rel, content, encoding = 'utf8') {
  const full = inside(root, rel)
  const buf = encoding === 'base64' ? Buffer.from(String(content ?? ''), 'base64') : Buffer.from(String(content ?? ''), 'utf8')
  if (buf.length > MAX_WRITE) throw new Error('file too large (max 25 MB)')
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, buf)
  return { path: rel, size: buf.length }
}

export function deleteFile(root, rel) {
  const full = inside(root, rel)
  fs.rmSync(full, { force: true })
  // tidy empty parent folders up to the root
  let dir = path.dirname(full)
  while (dir.startsWith(root + path.sep) && fs.readdirSync(dir).length === 0) { fs.rmdirSync(dir); dir = path.dirname(dir) }
}

/** Short listing for the agent's system prompt. */
export function filesSummary(root, limit = 60) {
  const files = listFiles(root)
  if (!files.length) return '(empty)'
  const kb = n => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`)
  const lines = files.slice(0, limit).map(f => `- files/${f.path} (${kb(f.size)})`)
  if (files.length > limit) lines.push(`- … and ${files.length - limit} more`)
  return lines.join('\n')
}
