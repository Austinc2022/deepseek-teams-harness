/** The one SuperAgent of this process, on the shared Agent Forge engine and the Company (charter, budget, gate). */
import { boot as bootCompany } from '../../company/lib/boot.js'
import { superAgent } from './super.js'

export function boot({ log = () => {} } = {}) {
  const co = bootCompany({ log })
  return superAgent(co.forge, co, { log })
}
