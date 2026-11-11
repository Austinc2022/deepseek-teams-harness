/**
 * Company API, shared by the DSH mount (plugins/company-dashboard) and the standalone server (bin/company.js serve).
 * handle(co, method, path, readBody, query) returns a JSON value, or undefined for "not found".
 */
import { gatherFacts } from './cycle.js'

let factsCache = { at: 0, value: null }

export async function handle(co, method, p, body, query) {
  const { engine } = co.forge
  let r
  if (method === 'GET' && p === '/api/overview') return co.overview()
  if (method === 'GET' && p === '/api/engine') {
    // deterministic engine facts; cached for a minute because the page polls
    if (Date.now() - factsCache.at > 60_000) factsCache = { at: Date.now(), value: gatherFacts(co) }
    return factsCache.value
  }
  if (method === 'GET' && p === '/api/ledger') return co.ledgerRead(300).reverse()
  if (method === 'POST' && p === '/api/meter') return co.meter('dashboard refresh')
  if (method === 'POST' && p === '/api/setup') return co.setup(await body())
  if (method === 'POST' && p === '/api/cycle') {
    const b = await body()
    const { cycleId, runId } = await co.startCycle({ trigger: 'manual', focus: b.focus ? String(b.focus).slice(0, 4000) : undefined })
    return { cycleId, runId }
  }
  if (method === 'POST' && p === '/api/cancel') return co.cancel()
  if (method === 'POST' && p === '/api/pause') return co.pause((await body()).paused === true)
  if (method === 'PUT' && p === '/api/charter') return co.updateCharter(await body())
  if ((r = p.match(/^\/api\/decisions\/([a-z0-9]{6,24})$/)) && method === 'POST') return co.answer(r[1], await body())
  if ((r = p.match(/^\/api\/builds\/([a-z0-9]{6,24})$/)) && method === 'POST') return co.setBuild(r[1], (await body()).status)
  if ((r = p.match(/^\/api\/reports\/([\w.-]+\.md)$/)) && method === 'GET') return { text: co.report(r[1]) }
  if ((r = p.match(/^\/api\/runs\/([\w-]{6,64})$/)) && method === 'GET') {
    const st = engine.getRun(r[1])
    return {
      id: st.id, orchestration: st.orchestration, status: st.status, phase: st.phase, startedAt: st.startedAt, endedAt: st.endedAt,
      error: st.error ? String(st.error).split('\n')[0] : null, log: (st.log ?? []).slice(-40),
      agents: (st.agents ?? []).map(a => ({ n: a.n, label: a.label, agent: a.agent, model: a.model, status: a.status, tools: a.tools, file: a.file, error: a.error })),
    }
  }
  if ((r = p.match(/^\/api\/runs\/([\w-]{6,64})\/file$/)) && method === 'GET') {
    const rel = query.get('path') ?? ''
    if (!/^(agents|artifacts)\/[\w.\-/]+$/.test(rel) || rel.includes('..')) throw new Error('bad path')
    return { text: engine.readRunFile(r[1], rel) }
  }
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
