/** The one Company of this process, built on the shared Agent Forge registry/engine and the super-team engine. */
import { shared } from '../../agent-forge/lib/shared.js'
import { SuperTeams } from '../../super-team/lib/super.js'
import { company } from './company.js'

const SUPER_KEY = Symbol.for('super-team.shared')

export function boot({ log = () => {} } = {}) {
  const forge = shared({ log })
  const supers = (globalThis[SUPER_KEY] ??= new SuperTeams(forge, { log }))
  return company(forge, supers, { log })
}
