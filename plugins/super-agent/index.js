/**
 * Super agent: host half. Builds the one SuperAgent of this process and runs its loop (sources, evaluation,
 * tickets). Only one process runs the loop at a time (forge/super-agent/loop.lock); the page and the API are
 * served by plugins/company-dashboard.
 */
import { boot } from './lib/boot.js'

export const name = 'super-agent'
export const inject = []

export function apply(ctx) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('super-agent') : null
  const log = m => (logger ? logger.info(m) : console.error(`[super-agent] ${m}`))
  const sa = boot({ log })
  ctx.effect(() => sa.start(), 'super-agent: loop')
  const s = sa.store.read()
  log(`Super agent ready: ${s.agents.length} super agent(s), ${s.tickets.filter(t => t.status === 'open').length} open ticket(s), proactive mode ${s.enabled ? 'on' : 'off'}`)
}
