/**
 * The owner's API for the HQ page, under /hq/api/ (DSH login required; see index.js), shared with the standalone
 * server (bin/hq.js serve). handle() returns a JSON value, or undefined for "not found".
 */
export async function handle(b, method, p, body) {
  const { hq, people, listener } = b
  let r
  if (method === 'GET' && p === '/api/overview') return { ...hq.overview(), people: people.view(), listener: listener.state() }
  if (method === 'PUT' && p === '/api/settings') { const out = hq.setSettings(await body()); listener.apply(); return out }
  if (method === 'POST' && p === '/api/invites') return hq.createInvite(await body())
  if ((r = p.match(/^\/api\/invites\/(i[0-9a-f]{10})$/)) && method === 'DELETE') return hq.revokeInvite(r[1])
  if ((r = p.match(/^\/api\/companies\/(g[0-9a-f]{10})$/))) {
    if (method === 'GET') return hq.company(r[1])
    if (method === 'PUT') return hq.setCompany(r[1], await body())
    if (method === 'DELETE') return hq.removeCompany(r[1])
  }
  if (method === 'POST' && p === '/api/directives') return hq.direct({ ...(await body()), from: 'owner' })
  if ((r = p.match(/^\/api\/directives\/(d[0-9a-f]{10})\/cancel$/)) && method === 'POST') return hq.cancelDirective(r[1])
  if (method === 'POST' && p === '/api/chief') return people.say((await body()).text)
  if (method === 'POST' && p === '/api/review') { const x = await body(); return people.runReview({ trigger: 'the owner asked', focus: x.focus ? String(x.focus).slice(0, 600) : undefined }) }
  if ((r = p.match(/^\/api\/review\/recs\/(v[0-9a-f]{10})$/)) && method === 'POST') return people.ownerReview(r[1], await body())
  if ((r = p.match(/^\/api\/review\/reports\/(r[0-9a-f]{10})$/)) && method === 'GET') return { text: people.report(r[1]) }
  return undefined
}

export async function readJson(req) {
  let n = 0
  const chunks = []
  for await (const c of req) { n += c.length; if (n > 1024 * 1024) throw new Error('body too large'); chunks.push(c) }
  const s = Buffer.concat(chunks).toString('utf8')
  return s ? JSON.parse(s) : {}
}

export const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'"
export function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'content-security-policy': CSP, 'referrer-policy': 'no-referrer' })
  res.end(type === 'application/json' ? JSON.stringify(body) : body)
}
