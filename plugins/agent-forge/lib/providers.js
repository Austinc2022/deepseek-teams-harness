/**
 * Model providers for the claude-code backend.
 *
 * An agent with `provider: deepseek` runs as a normal Claude Code session (so it keeps forge memory, skills,
 * sub-agents and MCP tools), but its model calls go to DeepSeek's Anthropic-compatible API with the user's
 * DeepSeek API key instead of the Claude subscription.
 *
 * The key is never stored in an agent file. It is read from the environment (DEEPSEEK_API_KEY) or from
 * `$DSH_HOME/.env` (default `<repo>/.dsh-home/.env`, git-ignored, mode 600).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '../../..')

export const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek API',
    baseURL: 'https://api.deepseek.com/anthropic',
    apiRoot: 'https://api.deepseek.com',
    keyEnv: 'DEEPSEEK_API_KEY',
    models: ['deepseek-v4-pro', 'deepseek-flash'],
    defaultModel: 'deepseek-v4-pro',
    fastModel: 'deepseek-flash',
  },
}

function envFiles() {
  const home = process.env.DSH_HOME ?? path.join(ROOT, '.dsh-home')
  return [path.join(home, '.env'), path.join(ROOT, '.env')]
}

/** A value from the process environment, else from the harness-home or repo `.env` file. */
export function secret(name) {
  if (process.env[name]) return process.env[name]
  for (const f of envFiles()) {
    let text
    try { text = fs.readFileSync(f, 'utf8') } catch { continue }
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && m[1] === name) return m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return undefined
}

/** Environment variables that point a Claude Code session at the agent's provider; {} for the default (subscription). */
export function providerEnv(def) {
  const name = def.provider
  if (!name || name === 'claude-code') return {}
  const p = PROVIDERS[name]
  if (!p) throw new Error(`agent ${def.name}: unknown provider "${name}" (known: ${Object.keys(PROVIDERS).join(', ')})`)
  const key = secret(p.keyEnv)
  if (!key) throw new Error(`agent ${def.name}: provider ${name} needs ${p.keyEnv} (set it in the environment or in .dsh-home/.env)`)
  return {
    ANTHROPIC_BASE_URL: p.baseURL,
    ANTHROPIC_AUTH_TOKEN: key,
    ANTHROPIC_API_KEY: '',
    // Claude Code's own background calls (titles, summaries) must use a model this provider has
    ANTHROPIC_SMALL_FAST_MODEL: p.fastModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: p.fastModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: p.defaultModel,
    ANTHROPIC_DEFAULT_OPUS_MODEL: p.defaultModel,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  }
}

/** Account balance of a provider, in USD, or null when it cannot be read. */
export async function providerBalance(name = 'deepseek') {
  const p = PROVIDERS[name]
  const key = p && secret(p.keyEnv)
  if (!key) return null
  try {
    const r = await fetch(`${p.apiRoot}/user/balance`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) })
    if (!r.ok) return null
    const j = await r.json()
    const usd = (j.balance_infos ?? []).find(b => b.currency === 'USD') ?? (j.balance_infos ?? [])[0]
    return usd ? { usd: Number(usd.total_balance), currency: usd.currency, available: j.is_available !== false } : null
  } catch { return null }
}
