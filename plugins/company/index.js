/**
 * Company: host half. Builds the one Company of this process and runs the autopilot timer
 * (a COO cycle every charter.autopilot.everyHours while autopilot is on and the budget allows).
 * The page and the API are served by plugins/company-dashboard.
 */
import { boot } from './lib/boot.js'

export const name = 'company'
export const inject = []

export function apply(ctx) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('company') : null
  const log = m => (logger ? logger.info(m) : console.error(`[company] ${m}`))
  const co = boot({ log })
  ctx.effect(() => {
    const stop = co.schedule()
    // first check shortly after start, so a due cycle does not wait for the first interval
    const t = setTimeout(() => co.tick().catch(e => log(`autopilot: ${e.message}`)), 60_000)
    return () => { stop(); clearTimeout(t) }
  }, 'company: autopilot timer')
  const s = co.read()
  log(`Company ready: ${s.departments.length} departments, autopilot ${s.charter.autopilot.enabled ? `on (every ${s.charter.autopilot.everyHours} h)` : 'off'}`)
}
