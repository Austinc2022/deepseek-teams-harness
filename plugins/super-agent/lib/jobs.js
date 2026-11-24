/**
 * Host jobs a schedule can carry (schedule.job): a fixed, named check the loop runs itself just before it wakes the
 * super agent the schedule is addressed to, so that agent starts from facts instead of having to fetch them (leaders
 * have no shell). The job's output is appended to the scheduled message.
 *
 * Only the names listed here can run: a schedule names a job, it never carries a command. Jobs report; they do not
 * change the running system.
 */
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const script = (file, args = []) => () => execFileSync(process.execPath, [path.join(ROOT, 'scripts', file), ...args],
  { cwd: ROOT, encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] })

export const JOBS = {
  /** Is the OpenRouter provider still on OpenRouter's current free models, and only those? */
  'openrouter-free-check': script('openrouter-free-refresh.mjs'),
}

export const isJob = name => typeof name === 'string' && Object.hasOwn(JOBS, name)

/** Run one job; never throws. Returns the text to hand to the agent. */
export function runJob(name) {
  if (!isJob(name)) return `(unknown job "${name}")`
  try { return String(JOBS[name]() ?? '').trim().slice(0, 3000) || '(the check printed nothing)' } catch (e) { return `The check could not run: ${String(e.message ?? e).split('\n')[0].slice(0, 300)}` }
}
