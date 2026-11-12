/**
 * Company isolation. Every company has its own forge home: the main company uses <repo>/forge, every other company
 * <repo>/companies/<id>/ (docs/COMPANIES.md). An agent may never read another company's home, so every run gets
 * read-deny rules (permission rules, and the sandbox's denyRead for sandboxed builders) for all of them.
 * Computed per run, so a company created after this process started is covered too, and agents saved before this
 * existed need no rewrite.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const REPO = path.resolve(here, '../../..')
export const MAIN_HOME = path.resolve(process.env.FORGE_MAIN_HOME ?? path.join(REPO, 'forge'))
export const COMPANIES_DIR = path.resolve(process.env.FORGE_COMPANIES_DIR ?? path.join(REPO, 'companies'))

/** Folders that belong to other companies than the one whose forge home is `home`. */
export function otherCompanyDirs(home) {
  const me = path.resolve(home)
  if (me === MAIN_HOME) return [COMPANIES_DIR]
  const out = [MAIN_HOME]
  try {
    for (const d of fs.readdirSync(COMPANIES_DIR, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const p = path.join(COMPANIES_DIR, d.name)
      if (p !== me && !me.startsWith(p + path.sep)) out.push(p)
    }
  } catch { /* no other companies yet */ }
  // a forge home outside both places (tests, AGENT_FORGE_HOME pointed elsewhere): still keep it out of the others
  if (!me.startsWith(COMPANIES_DIR + path.sep) && me !== MAIN_HOME && !out.includes(COMPANIES_DIR)) out.push(COMPANIES_DIR)
  return out
}

/** Claude Code permission deny rules for those folders (`Read(//abs/path/**)`; Read rules also cover Grep and Glob). */
export const denyRules = home => otherCompanyDirs(home).flatMap(d => [`Read(/${d})`, `Read(/${d}/**)`])
