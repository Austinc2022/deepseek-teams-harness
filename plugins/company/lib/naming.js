/**
 * Names say what a thing is for. Enforced on everything created from now on (existing names are left alone).
 *   agent        <prefix><specialty>-<function>     quant-funding-researcher, quant-listing-scout
 *   instance     <agent>@<purpose>                  quant-researcher@ini-funding-basis-ab12
 *   team         <prefix><mission>                  quant-funding-alpha
 *   super team   a title of 2+ words naming its programme
 *   super agent  an id naming its area             research, risk-assurance
 */
export const FUNCTION_WORDS = ['researcher', 'scout', 'analyst', 'builder', 'reviewer', 'auditor', 'lead', 'head', 'strategist', 'officer', 'engineer', 'evaluator', 'hunter', 'watchdog', 'designer', 'writer', 'critic', 'verifier', 'recruiter', 'desk', 'planner', 'curator', 'trader', 'modeler', 'modeller', 'tester', 'monitor', 'chief', 'coo', 'ceo', 'worker', 'dreamer', 'architect', 'economist', 'statistician', 'scientist', 'editor', 'checker', 'operator', 'manager', 'coordinator', 'investigator', 'simulator', 'forecaster', 'quant', 'red-team', 'redteam']
const GENERIC = new Set(['agent', 'agents', 'helper', 'bot', 'assistant', 'new', 'test', 'temp', 'tmp', 'misc', 'general', 'thing', 'stuff', 'team', 'default', 'x', 'my', 'one', 'two', 'super', 'main', 'other', 'extra', 'generic', 'basic', 'simple', 'v2', 'copy', 'clone'])

const parts = (name, prefix = '') => String(name ?? '').replace(new RegExp(`^${prefix}`), '').split('-').filter(Boolean)
const isFunction = w => !GENERIC.has(w) && (FUNCTION_WORDS.includes(w) || /(er|or|ist|ian|ant)$/.test(w))

/** null when the name is fine, else what is wrong with it. */
export function agentNameProblem(name, prefix = '') {
  const p = parts(name, prefix)
  if (p.some(w => GENERIC.has(w))) return `"${name}" contains a word that says nothing (${p.filter(w => GENERIC.has(w)).join(', ')})`
  if (p.length < 2) return `"${name}" names only one thing; use <specialty>-<function>, e.g. ${prefix}funding-researcher`
  if (!p.some(isFunction)) return `"${name}" does not say what the agent does; end with a function word (researcher, scout, analyst, reviewer, builder, strategist ...)`
  if (!p.some(w => !isFunction(w) && !GENERIC.has(w) && w.length >= 3)) return `"${name}" does not say what it specialises in; add the subject, e.g. ${prefix}listing-${p.find(isFunction) ?? 'analyst'}`
  return null
}

export function teamNameProblem(name, prefix = '') {
  const p = parts(name, prefix)
  const meaningful = p.filter(w => !GENERIC.has(w) && w.length >= 3)
  if (!meaningful.length) return `"${name}" does not say what the team is for; name its mission, e.g. ${prefix}funding-alpha`
  return null
}

export function titleProblem(title, what = 'title') {
  const w = String(title ?? '').trim().split(/\s+/).filter(x => x.length >= 2)
  if (w.length < 2 || String(title).trim().length < 8) return `the ${what} "${title}" is too vague; name the programme or area in 2+ words`
  if (w.every(x => GENERIC.has(x.toLowerCase()))) return `the ${what} "${title}" says nothing about its purpose`
  return null
}

export const assertName = (problem) => { if (problem) throw new Error(problem) }
