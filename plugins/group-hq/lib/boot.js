/** The one headquarters of this process: store, public listener, group CEO and review team, and their timer. */
import { shared } from '../../agent-forge/lib/shared.js'
import { HQ } from './hq.js'
import { Listener } from './listener.js'
import { People } from './team.js'

const KEY = Symbol.for('group-hq.shared')

export function boot({ log = () => {} } = {}) {
  if (globalThis[KEY]) return globalThis[KEY]
  const forge = shared({ log })
  const hq = new HQ(forge.registry.home, { log })
  const listener = new Listener(hq, { log })
  const people = new People(hq, forge, { log })
  // a company's answer or a new company is an event for the group CEO right away
  hq.onChange = () => { people.tick().catch(e => log(`group CEO: ${e.message}`)) }
  let timer = null
  const start = () => {
    listener.apply()
    try { const m = people.seed(); if (m.length) log(`headquarters agents created: ${m.join(', ')}`) } catch (e) { log(`headquarters seed: ${e.message}`) }
    clearInterval(timer)
    timer = setInterval(() => { listener.apply(); people.tick().catch(e => log(`headquarters: ${e.message}`)) }, 60_000)
    timer.unref?.()
    return () => { clearInterval(timer); listener.stop() }
  }
  return (globalThis[KEY] = { forge, hq, listener, people, start })
}
