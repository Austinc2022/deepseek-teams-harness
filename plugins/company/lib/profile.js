/**
 * The active company profile: everything that makes a company a particular company (its organisation, charter,
 * rules, pipeline stages, skills, models, deterministic facts and the gate). The engine in company.js, cycle.js
 * and the super agent is the same for every profile.
 *
 * Which profile is active, first match wins:
 *   1. the COMPANY_PROFILE environment variable
 *   2. forge/company/profile.json  {"profile": "vr-studio", ...overrides}
 *   3. "generic"
 *
 * Profiles live in plugins/company/profiles/<id>.js and export a profile built with makeProfile (generic.js).
 * profile.json may also override plain fields of the profile, e.g. {"projectDir": "~/games/studio"}.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FORGE_HOME } from './paths.js'

export const SELECT_FILE = path.join(FORGE_HOME, 'company', 'profile.json')

function selection() {
  let file = {}
  try { file = JSON.parse(fs.readFileSync(SELECT_FILE, 'utf8')) } catch { /* no selection yet */ }
  const id = String(process.env.COMPANY_PROFILE || file.profile || 'generic')
  if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new Error(`company profile "${id}" is not a valid name`)
  return { id, overrides: file.overrides ?? {} }
}

const { id, overrides } = selection()
let mod
try { mod = await import(`../profiles/${id}.js`) } catch (e) { throw new Error(`cannot load company profile "${id}" (plugins/company/profiles/${id}.js): ${e.message}`) }

const expand = p => (typeof p === 'string' && p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p)
const base = mod.default
for (const k of ['projectDir', 'label', 'companyName']) if (typeof overrides[k] === 'string') base[k] = expand(overrides[k])
if (Array.isArray(overrides.folders)) base.folders = overrides.folders.map(expand)

/** The active profile (see generic.js for its shape). */
export const profile = base
export const PROFILE_ID = id

/** Write the selection file (used by `company-cli profile <id>`); takes effect on the next start. */
export function selectProfile(next, extra = {}) {
  if (!/^[a-z0-9-]{2,40}$/.test(next)) throw new Error('bad profile name')
  const dir = path.dirname(SELECT_FILE)
  fs.mkdirSync(dir, { recursive: true })
  let cur = {}
  try { cur = JSON.parse(fs.readFileSync(SELECT_FILE, 'utf8')) } catch {}
  fs.writeFileSync(SELECT_FILE, JSON.stringify({ ...cur, profile: next, ...extra }, null, 2))
}

export function listProfiles() {
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../profiles')
  return fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort()
}
