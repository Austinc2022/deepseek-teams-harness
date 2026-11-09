/**
 * Venture automation: registers the venture studio's recurring work as DSH Automation tasks.
 *
 * On Host start it makes sure that
 *  - one dedicated conversation ("Venture studio autopilot") exists, and
 *  - every task in tasks.json exists exactly once as an Automation task delivering to it.
 * When a task fires, the lead agent of that conversation calls forge_run (Agent Forge) to
 * start the orchestration. Tasks show up on the Automation tasks page, where you can pause,
 * edit, run now or delete them. A task you delete is not re-created (tracked in the state file);
 * delete forge/.cache/venture-automation.json to reset everything.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'venture-automation'
export const inject = ['schedule', 'sessionController']

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const STATE = path.join(process.env.AGENT_FORGE_HOME ?? path.join(ROOT, 'forge'), '.cache', 'venture-automation.json')

const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return { tasks: {} } } }
const writeState = s => { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)) }

export async function apply(ctx, config = {}) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('venture-automation') : null
  const log = m => (logger ? logger.info(m) : console.error(`[venture-automation] ${m}`))
  const zone = config.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
  const specs = JSON.parse(fs.readFileSync(path.join(HERE, 'tasks.json'), 'utf8'))

  const sync = async () => {
    const state = readState()
    state.tasks ??= {}

    // 1. the dedicated conversation that receives the deliveries
    let sessionId = state.sessionId
    if (sessionId) {
      try { await ctx.sessionController.inspect(sessionId) } catch { log(`stored conversation ${sessionId} is gone; creating a new one`); sessionId = null; state.tasks = {} }
    }
    if (!sessionId) {
      const created = await ctx.sessionController.create({ cwd: ROOT })
      sessionId = created.sessionId
      try { await ctx.sessionController.rename({ sessionId, title: 'Venture studio autopilot' }) } catch (e) { log(`rename failed: ${e.message}`) }
      state.sessionId = sessionId
      writeState(state)
      log(`created conversation ${sessionId}`)
    }

    // 2. one task per spec; never duplicate, never resurrect a task the user deleted
    const catalog = await ctx.schedule.catalog()
    for (const spec of specs) {
      const known = state.tasks[spec.key]
      if (known?.id) {
        if (!catalog.some(t => t.id === known.id) && !known.deletedNoticed) { known.deletedNoticed = true; log(`task "${spec.title}" was deleted by the user; leaving it deleted`) }
        continue
      }
      const existing = catalog.find(t => t.title === spec.title && t.sessionId === sessionId)
      if (existing) { state.tasks[spec.key] = { id: existing.id }; continue }
      const request = { title: spec.title, prompt: spec.prompt }
      if (spec.daily) request.daily = { time: spec.daily.time, time_zone: zone }
      if (spec.weekly) request.weekly = { time: spec.weekly.time, weekdays: spec.weekly.weekdays, time_zone: zone }
      if (spec.cron) request.cron = { expression: spec.cron, time_zone: zone }
      const rec = await ctx.schedule.create(sessionId, request)
      state.tasks[spec.key] = { id: rec.id }
      log(`registered automation task "${spec.title}" (${rec.id}), next ${rec.scheduledAt}`)
    }
    writeState(state)
  }

  // Register shortly after start (Session persistence and the schedule domain must be ready); retry a few times.
  ctx.effect(() => {
    let timer
    let attempt = 0
    const tick = () => {
      sync().catch(e => {
        log(`sync attempt ${++attempt} failed: ${e?.message ?? e}`)
        if (attempt < 6) timer = setTimeout(tick, 10_000 * attempt)
      })
    }
    timer = setTimeout(tick, 5_000)
    return () => clearTimeout(timer)
  })
}
