/**
 * API for the Advisory and Connections pages (company dashboard), under /api/super/:
 *   advisory/...   the independent advisory team (advisory.js)
 *   group/...      this company's link to a group headquarters (group-link.js)
 *   targets/...    execution targets: where sandboxed builders run (agent-forge/lib/targets.js)
 * Anything that starts model work or writes the super agent's triggers is queued for the loop process.
 */
import { Targets, testTarget } from '../../agent-forge/lib/targets.js'
import { secret } from '../../agent-forge/lib/providers.js'
import { profile as P } from '../../company/lib/profile.js'
import { str } from './store.js'

const NAME = /^[a-z][a-z0-9-]{0,47}$/

export async function handleConnect(sa, method, p, body) {
  let r
  // ---------------- advisory
  if (method === 'GET' && p === '/api/super/advisory') return sa.advisory.view()
  if (method === 'POST' && p === '/api/super/advisory/run') {
    const why = sa.advisory.blocked()
    if (why) throw new Error(`cannot start a review: ${why}`)
    return sa.store.command({ type: 'advisory-run', focus: str((await body()).focus, 600) || undefined })
  }
  if (method === 'PUT' && p === '/api/super/advisory/settings') return sa.advisory.setSettings(await body())
  if ((r = p.match(/^\/api\/super\/advisory\/recs\/(v[0-9a-f]{10})$/)) && method === 'POST') { const b = await body(); return sa.store.command({ type: 'advice-owner', id: r[1], decision: b.decision, note: str(b.note, 1000) }) }
  if ((r = p.match(/^\/api\/super\/advisory\/reports\/(r[0-9a-f]{10})$/)) && method === 'GET') return { text: sa.advisory.report(r[1]) }

  // ---------------- group headquarters link
  if (method === 'GET' && p === '/api/super/group') return sa.group.view()
  if (method === 'POST' && p === '/api/super/group/join') return sa.group.join(await body())
  if (method === 'PUT' && p === '/api/super/group/settings') return sa.group.setSettings(await body())
  if (method === 'POST' && p === '/api/super/group/leave') return sa.group.leave()
  if (method === 'POST' && p === '/api/super/group/sync') return sa.store.command({ type: 'group-sync' })
  if ((r = p.match(/^\/api\/super\/group\/directives\/([\w-]{4,40})$/)) && method === 'POST') { const b = await body(); return sa.group.ownerRespond(r[1], b) }

  // ---------------- execution targets
  const tg = new Targets(sa.forge.registry.home)
  if (method === 'GET' && p === '/api/super/targets') return targetsView(sa, tg)
  if ((r = p.match(/^\/api\/super\/targets\/([a-z][a-z0-9-]{0,47})$/))) {
    if (method === 'PUT') { const b = await body(); return tg.save({ ...cleanTarget(b), name: r[1] }) }
    if (method === 'DELETE') {
      const used = usage(sa).filter(u => u.target === r[1])
      if (used.length) throw new Error(`${r[1]} is in use by ${used.map(u => `${u.scope} ${u.id}`).join(', ')}; change those first`)
      return tg.remove(r[1])
    }
  }
  if ((r = p.match(/^\/api\/super\/targets\/([a-z][a-z0-9-]{0,47})\/test$/)) && method === 'POST') return testTarget(tg, r[1])
  if (method === 'PUT' && p === '/api/super/targets-assign') return assign(sa, tg, await body())
  return undefined
}

/** Only the fields a target may have; values are checked again by normalizeTarget. */
function cleanTarget(b = {}) {
  const out = {}
  for (const k of ['kind', 'description', 'host', 'ssh', 'remoteRoot', 'claudePath', 'image', 'runtime', 'network', 'sync', 'fallback', 'identityFile']) if (b[k] !== undefined && b[k] !== '') out[k] = str(b[k], 400).trim()
  if (b.port !== undefined && b.port !== '') out.port = Number(b.port)
  if (b.allowAgents !== undefined) out.allowAgents = b.allowAgents !== false
  if (Array.isArray(b.runArgs)) out.runArgs = b.runArgs.map(x => str(x, 200)).slice(0, 20)
  return out
}

/** Who uses which target: the company default, teams, super teams, agents. */
function usage(sa) {
  const { registry } = sa.forge
  const out = []
  const c = sa.co.read()
  if (c.charter.execution?.workerTarget) out.push({ scope: 'company', id: 'default for builders', target: c.charter.execution.workerTarget })
  for (const t of registry.listTeams()) if (t.execution?.target && P.isOurs(t.name)) out.push({ scope: 'team', id: t.name, target: t.execution.target })
  for (const st of sa.co.supers.list()) if (st.target) out.push({ scope: 'super team', id: st.id, title: st.title, target: st.target })
  for (const a of registry.listAgents()) if (!a.invalid && a.execution?.target && P.isOurs(a.name)) out.push({ scope: 'agent', id: a.name, target: a.execution.target })
  for (const t of sa.store.read().tickets.filter(x => x.status === 'open' && x.target)) out.push({ scope: 'ticket', id: t.short, target: t.target })
  return out
}

function targetsView(sa, tg) {
  const { registry } = sa.forge
  const list = tg.list().map(t => (t.invalid ? t : { ...t, health: tg.health.get(t.name) ?? null }))
  return {
    targets: [{ name: 'sandbox', kind: 'sandbox', description: 'This machine, in the OS sandbox (the default)', builtIn: true }, ...list],
    workerTarget: sa.co.read().charter.execution?.workerTarget ?? null,
    usage: usage(sa),
    teams: registry.listTeams().filter(t => P.isOurs(t.name)).map(t => ({ name: t.name, target: t.execution?.target ?? null })),
    superTeams: sa.co.supers.list().map(st => ({ id: st.id, title: st.title, target: st.target ?? null })),
    builders: registry.listAgents().filter(a => !a.invalid && P.isOurs(a.name) && ['sandbox', 'container', 'vm'].includes(a.execution?.mode)).map(a => ({ name: a.name, target: a.execution?.target ?? null })),
    loginToken: !!secret('CLAUDE_CODE_OAUTH_TOKEN'),
  }
}

/** { scope: company | team | superTeam | agent, id, target } — an empty target clears it. */
function assign(sa, tg, b = {}) {
  const target = str(b.target, 48).trim()
  if (target && target !== 'sandbox') tg.get(target) // throws for an unknown target
  const { registry } = sa.forge
  const id = str(b.id, 80)
  if (b.scope === 'company') return sa.co.updateCharter({ execution: { workerTarget: target } }).execution
  if (b.scope === 'team') {
    if (!NAME.test(id) || !P.isOurs(id)) throw new Error('no such team')
    const t = registry.getTeam(id)
    const execution = { ...(t.execution ?? {}) }
    if (target) execution.target = target; else delete execution.target
    registry.saveTeam({ ...t, execution })
    return { team: id, target: target || null }
  }
  if (b.scope === 'superTeam') { sa.co.supers.update(id, { target }); return { superTeam: id, target: target || null } }
  if (b.scope === 'agent') {
    if (!NAME.test(id) || !P.isOurs(id)) throw new Error('no such agent')
    const def = registry.getAgent(id)
    if (!['sandbox', 'container', 'vm'].includes(def.execution?.mode)) throw new Error(`${id} works on this machine's files (it is not a sandboxed builder), so it stays here`)
    const execution = { ...def.execution }
    if (target) execution.target = target; else delete execution.target
    registry.saveAgent({ ...def, execution })
    return { agent: id, target: target || null }
  }
  throw new Error('scope is company, team, superTeam or agent')
}
