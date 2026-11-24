/**
 * Training camp API, used by the DSH mount (index.js). handle() returns a JSON value, or undefined for "not found".
 */
import { DEFAULTS } from './camp.js'
import { availableProviders } from '../../agent-forge/lib/providers.js'

const ID = '(c[a-f0-9]{8})'
const KEY = '([a-z_][a-z0-9_-]{0,63})'

export const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'"

export function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'content-security-policy': CSP, 'referrer-policy': 'no-referrer' })
  res.end(type === 'application/json' ? JSON.stringify(body) : body)
}

export async function readJson(req) {
  let n = 0
  const chunks = []
  for await (const c of req) { n += c.length; if (n > 2 * 1024 * 1024) throw new Error('body too large'); chunks.push(c) }
  const s = Buffer.concat(chunks).toString('utf8')
  return s ? JSON.parse(s) : {}
}

export async function handle(cs, method, p, body, query) {
  let r
  if (p === '/api/meta' && method === 'GET') return { providers: availableProviders(), defaults: DEFAULTS }
  if (p === '/api/camps') {
    if (method === 'GET') return { camps: cs.list(), defaults: DEFAULTS }
    if (method === 'POST') return cs.create(await body())
  }
  if ((r = p.match(new RegExp(`^/api/camps/${ID}$`)))) {
    if (method === 'GET') return cs.get(r[1])
    if (method === 'DELETE') return cs.remove(r[1])
  }
  if ((r = p.match(new RegExp(`^/api/camps/${ID}/(propose|revise|approve|train|cancel|publish|rollback|reset|restore|redo|fresh)$`))) && method === 'POST') {
    const [, id, action] = r
    const b = await body()
    const started = x => ({ runId: x.runId })
    if (action === 'propose') return started(cs.propose(id))
    if (action === 'revise') return started(cs.revise(id, b.feedback))
    if (action === 'approve') { const a = cs.approve(id); return { kept: a.kept, reset: a.reset } }
    if (action === 'train') return started(cs.train(id, Array.isArray(b.roles) ? { roles: b.roles } : {}))
    if (action === 'cancel') return cs.cancel(id)
    if (action === 'publish') return cs.publish(id, { force: b.force === true })
    if (action === 'rollback') return cs.rollback(id)
    if (action === 'reset') { cs.reset(id, String(b.what ?? 'all'), { datasets: b.datasets === true }); return { ok: true } }
    if (action === 'restore') { cs.restoreWorkflow(id, b.version); return { ok: true } }
    if (action === 'redo') { cs.redo(id, String(b.stage ?? '')); return { ok: true } }
    if (action === 'fresh') { cs.fresh(id); return { ok: true } }
  }
  if ((r = p.match(new RegExp(`^/api/camps/${ID}/workflow$`)))) {
    if (method === 'PUT') { cs.setWorkflow(r[1], (await body()).workflow); return { ok: true } }
    if (method === 'GET') return cs.workflowVersions(r[1])
  }
  if ((r = p.match(new RegExp(`^/api/camps/${ID}/settings$`))) && method === 'PUT') return cs.updateSettings(r[1], await body())
  if ((r = p.match(new RegExp(`^/api/camps/${ID}/skills/(\\d{1,3})$`))) && method === 'POST') return cs.decideSkill(r[1], Number(r[2]), (await body()).approve === true)
  if ((r = p.match(new RegExp(`^/api/camps/${ID}/trials/${KEY}$`))) && method === 'GET') return cs.trials(r[1], r[2])
  const stage = () => { const v = query?.get('stage'); return v && /^[a-z][a-z0-9-]{0,31}$/.test(v) ? v : undefined }
  if ((r = p.match(new RegExp(`^/api/camps/${ID}/steps$`))) && method === 'GET') return cs.steps(r[1])
  if ((r = p.match(new RegExp(`^/api/camps/${ID}/tasks/${KEY}$`))) && method === 'GET') return cs.tasks(r[1], r[2], stage())
  if ((r = p.match(new RegExp(`^/api/camps/${ID}/details/${KEY}$`))) && method === 'GET') return cs.trialDetails(r[1], r[2], stage())
  if ((r = p.match(new RegExp(`^/api/camps/${ID}/candidates/${KEY}/([a-z0-9-]{1,24})$`))) && method === 'GET') return cs.candidate(r[1], r[2], r[3])
  return undefined
}
