/**
 * Skill library: forge/skills/<name>/SKILL.md (Claude Code / Agent Skills format).
 * Agents select skills by name; at run time the selected skills are packaged as a
 * per-agent local Claude Code plugin so each agent only sees its own skills.
 *
 * Install sources:
 *   ./path/to/skill-dir                       local directory containing SKILL.md
 *   github:owner/repo/path/to/skill[@ref]     a directory inside a GitHub repo
 *   https://github.com/owner/repo/tree/<ref>/path/to/skill
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { assertName } from './registry.js'

export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  const out = {}
  if (!m) return out
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/)
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
  }
  return out
}

export function listSkills(skillsDir) {
  if (!fs.existsSync(skillsDir)) return []
  return fs.readdirSync(skillsDir).filter(n => fs.existsSync(path.join(skillsDir, n, 'SKILL.md'))).sort().map(n => {
    const fm = parseFrontmatter(fs.readFileSync(path.join(skillsDir, n, 'SKILL.md'), 'utf8'))
    const src = path.join(skillsDir, n, '.forge-source')
    return { name: n, description: fm.description ?? '', source: fs.existsSync(src) ? fs.readFileSync(src, 'utf8').trim() : 'local' }
  })
}

function parseGithub(source) {
  let m = source.match(/^github:([^/]+)\/([^/@]+)\/?([^@]*)(?:@(.+))?$/)
  if (m) return { owner: m[1], repo: m[2], sub: m[3], ref: m[4] ?? 'HEAD' }
  m = source.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/?(.*)$/)
  if (m) return { owner: m[1], repo: m[2], ref: m[3], sub: m[4] }
  return null
}

/** Install a skill into the library; returns { name, path }. */
export async function installSkill(skillsDir, source, { name, overwrite = false } = {}) {
  const gh = parseGithub(source)
  let srcDir
  let tmp
  if (gh) {
    // Downloaded content is untrusted data: extract into a fresh, empty directory and only copy files.
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-skill-'))
    const tarball = path.join(tmp, 'src.tar.gz')
    const url = `https://codeload.github.com/${gh.owner}/${gh.repo}/tar.gz/${gh.ref}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`)
    fs.writeFileSync(tarball, Buffer.from(await res.arrayBuffer()))
    const out = path.join(tmp, 'x')
    fs.mkdirSync(out)
    execFileSync('tar', ['-xzf', tarball, '-C', out, '--strip-components=1'])
    srcDir = path.join(out, gh.sub ?? '')
  } else {
    srcDir = path.resolve(source)
  }
  try {
    if (!fs.existsSync(path.join(srcDir, 'SKILL.md'))) throw new Error(`no SKILL.md found at ${gh ? `${source}` : srcDir}`)
    const fm = parseFrontmatter(fs.readFileSync(path.join(srcDir, 'SKILL.md'), 'utf8'))
    const skillName = assertName(name ?? (fm.name ?? path.basename(srcDir)).toLowerCase().replace(/[^a-z0-9-]/g, '-'), 'skill name')
    const dest = path.join(skillsDir, skillName)
    if (fs.existsSync(dest)) {
      if (!overwrite) throw new Error(`skill "${skillName}" already installed (pass overwrite to replace)`)
      fs.rmSync(dest, { recursive: true, force: true })
    }
    fs.cpSync(srcDir, dest, { recursive: true, dereference: false, filter: p => !p.split(path.sep).includes('.git') })
    fs.writeFileSync(path.join(dest, '.forge-source'), `${source}\n`)
    return { name: skillName, path: dest, description: fm.description ?? '' }
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
  }
}

export function removeSkill(skillsDir, name) {
  fs.rmSync(path.join(skillsDir, assertName(name, 'skill name')), { recursive: true, force: true })
}

/** Build (or reuse) a local plugin dir exposing exactly the selected skills. */
export function buildSkillPlugin(cacheDir, skillsDir, agentName, skills) {
  if (!skills?.length) return null
  for (const s of skills) if (!fs.existsSync(path.join(skillsDir, s, 'SKILL.md'))) throw new Error(`agent ${agentName}: skill "${s}" is not installed (forge skill install ...)`)
  const key = crypto.createHash('sha1').update(`${agentName}:${skills.join(',')}`).digest('hex').slice(0, 10)
  const dir = path.join(cacheDir, 'skill-plugins', `${agentName}-${key}`)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'skills'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: `forge-${agentName}`, version: '1.0.0', description: `Skills selected for forge agent ${agentName}` }, null, 2))
  for (const s of skills) fs.symlinkSync(path.join(skillsDir, s), path.join(dir, 'skills', s), 'dir')
  return dir
}
