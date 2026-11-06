/**
 * One Registry / Engine / ChatStore per process and forge home, so the harness
 * tools, the standalone console and the DSH web mount see the same live runs
 * and chats. Both the agent-forge and agent-forge-web plugins import this file.
 */
import { Registry, forgeHome } from './registry.js'
import { Engine } from './engine.js'
import { ChatStore } from './chat.js'

const KEY = Symbol.for('agent-forge.shared')

export function shared({ maxParallel, log } = {}) {
  const home = forgeHome()
  const all = (globalThis[KEY] ??= new Map())
  let s = all.get(home)
  if (!s) {
    const registry = new Registry(home)
    const engine = new Engine(registry, { ...(maxParallel != null ? { maxParallel } : {}), log: log ?? (() => {}) })
    s = { registry, engine, chats: new ChatStore(registry, { log: log ?? (() => {}), engine }) }
    all.set(home, s)
  }
  return s
}
