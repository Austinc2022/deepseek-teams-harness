#!/usr/bin/env node
/**
 * Keep the OpenRouter provider of the our-free-model plugin on OpenRouter's current free models, and only those.
 *
 *   node scripts/openrouter-free-refresh.mjs            compare the configured list with OpenRouter's and report
 *   node scripts/openrouter-free-refresh.mjs --apply    also write the new list (only while dsh web is stopped)
 *
 * A model counts as free when its id ends in ":free" and its listed prompt and completion prices are zero; the
 * auto-router "openrouter/free" is kept while OpenRouter lists it. Retired models are removed from the provider's
 * list and from every chain (combo). New free models are added to the provider's list only: which of them go into a
 * chain stays a decision, because a new free model can be tiny or poor at tool use.
 *
 * The plugin holds its settings in memory and writes them over the file, so --apply refuses while the local gateway
 * answers. `./dsh web` runs --apply before it starts; the weekly check (a super agent schedule with the job
 * "openrouter-free-check") only reports.
 *
 * The listing is public: no key is sent. Exit code 0 unless the settings file cannot be written.
 */
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(ROOT, '.dsh-home')
const FILE = path.join(HOME, 'our-free-model', 'settings.json')
const LISTING = 'https://openrouter.ai/api/v1/models'
const PROVIDER = 'open_router'
const ROUTER = 'openrouter/free'
const apply = process.argv.includes('--apply')
const quiet = process.argv.includes('--quiet')
const say = (...a) => console.log(...a)

const zero = v => v === undefined || v === null || Number(v) === 0
export const isFree = m => typeof m?.id === 'string'
  && (m.id === ROUTER || (m.id.endsWith(':free') && zero(m.pricing?.prompt) && zero(m.pricing?.completion)))

function portOpen(host, port) {
  return new Promise(resolve => {
    const s = net.connect({ host, port })
    const done = v => { s.destroy(); resolve(v) }
    s.setTimeout(1500, () => done(false)); s.once('connect', () => done(true)); s.once('error', () => done(false))
  })
}

async function main() {
  let settings
  try { settings = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { if (!quiet) say('OpenRouter free list: the our-free-model settings file is missing; nothing to do.'); return }
  const provider = settings.aggregate?.providers?.[PROVIDER]
  if (!provider?.apiKey) { if (!quiet) say('OpenRouter free list: the OpenRouter provider is not configured; nothing to do.'); return }

  let listed
  try {
    const r = await fetch(LISTING, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    listed = (await r.json()).data
    if (!Array.isArray(listed)) throw new Error('unexpected answer')
  } catch (e) { say(`OpenRouter free list: could not read OpenRouter's model listing (${e.message}); nothing changed.`); return }

  const free = listed.filter(isFree).map(m => m.id)
  // An empty or tiny answer is far more likely a bad listing than OpenRouter ending its free tier: do not wipe the list.
  if (free.filter(id => id !== ROUTER).length < 2) { say(`OpenRouter free list: the listing shows ${free.length} free models, which looks wrong; nothing changed.`); return }

  const current = Array.isArray(provider.models) ? provider.models : []
  const freeSet = new Set(free)
  const kept = current.filter(id => freeSet.has(id))
  const removed = current.filter(id => !freeSet.has(id))
  const added = free.filter(id => !current.includes(id)).sort()
  // the router last, so it stays the catch-all of the list
  const next = [...kept, ...added].filter(id => id !== ROUTER).concat(freeSet.has(ROUTER) ? [ROUTER] : [])

  const combos = Array.isArray(settings.combos) ? settings.combos : []
  const dead = new Set(removed.map(id => `${PROVIDER}/${id}`))
  const inChains = combos.flatMap(c => (c.models ?? []).filter(id => dead.has(id)).map(id => `${id} (in ${c.id})`))
  const paidInChains = combos.flatMap(c => (c.models ?? []).filter(id => id.startsWith(`${PROVIDER}/`) && !freeSet.has(id.slice(PROVIDER.length + 1)) && !dead.has(id)).map(id => `${id} (in ${c.id})`))

  if (!removed.length && !added.length && !paidInChains.length) {
    if (!quiet) say(`OpenRouter free list: up to date (${current.length} free models configured, none paid).`)
    return
  }
  say(`OpenRouter free list: changed. OpenRouter lists ${free.length} free models; ${current.length} are configured.`)
  if (removed.length) say(`  No longer free or retired (to remove): ${removed.join(', ')}`)
  if (inChains.length) say(`  Of those, in a chain: ${inChains.join(', ')}`)
  if (paidInChains.length) say(`  Chain links that are not free models (to remove): ${paidInChains.join(', ')}`)
  if (added.length) say(`  New free models (to add to the provider's list, not to any chain): ${added.join(', ')}`)

  if (!apply) { say('  Not applied: this was a check. The change is applied the next time "./dsh web" starts.'); return }
  const fwd = settings.forward ?? {}
  if (await portOpen(fwd.host || '127.0.0.1', fwd.port || 18899)) { say('  Not applied: dsh web is running and would overwrite the file. It is applied at its next start.'); return }

  provider.models = next
  delete provider.discovered // a discovered roster would include paid models; the explicit list is the only one
  for (const c of combos) c.models = (c.models ?? []).filter(id => !id.startsWith(`${PROVIDER}/`) || freeSet.has(id.slice(PROVIDER.length + 1)))
  fs.copyFileSync(FILE, `${FILE}.bak-openrouter-refresh`)
  const tmp = `${FILE}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(settings, undefined, 2), { mode: 0o600 })
  fs.renameSync(tmp, FILE)
  say(`  Applied: ${next.length} free models configured.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(`OpenRouter free list: ${e.message}`); process.exit(1) })
}
