/**
 * Super agent API under /api/super/, shared by the DSH mount (plugins/company-dashboard) and the standalone server
 * (company-cli serve). Reads come from the state file; every change is queued as a command for the process that
 * runs the loop, so two servers never write the state at once.
 */
import { orgView, who, timeline, people } from './views.js'
import { board, entity } from './board.js'
import { handleKnowledge } from './knowledge-http.js'

export async function handleSuper(sa, method, p, body, query) {
  let r
  if (p.startsWith('/api/super/knowledge/')) return handleKnowledge(sa, method, p, body, query)
  if (method === 'GET' && p === '/api/super/overview') return sa.overview()
  if (method === 'POST' && p === '/api/super/setup') return sa.setup(await body())
  if (method === 'POST' && p === '/api/super/say') { const b = await body(); return sa.store.command({ type: 'say', text: b.text, to: b.to }) }
  if (method === 'POST' && p === '/api/super/enabled') return sa.store.command({ type: 'enabled', on: (await body()).on === true })
  if (method === 'PUT' && p === '/api/super/settings') return sa.store.command({ type: 'settings', patch: await body() })
  if (method === 'POST' && p === '/api/super/engine') return sa.store.command({ type: 'engine', action: (await body()).on === true ? 'start' : 'stop' })
  if (method === 'GET' && p === '/api/super/board') return board(sa, { hours: query.get('hours') || 24 })
  if (method === 'GET' && p === '/api/super/entity') return entity(sa, query.get('ref') ?? 'company', { hours: query.get('hours') || 24 })
  if (method === 'GET' && p === '/api/super/chat') return sa.desk.read(query.get('ref') ?? 'company')
  if (method === 'POST' && p === '/api/super/chat') { const b = await body(); return sa.desk.post(String(b.ref ?? 'company'), b.text) }
  if (method === 'POST' && p === '/api/super/chat/stop') return sa.desk.stop(String((await body()).ref ?? ''))
  if (method === 'POST' && p === '/api/super/chat/clear') return sa.desk.clear(String((await body()).ref ?? ''))
  if (method === 'POST' && p === '/api/super/schedules/cancel') return sa.store.command({ type: 'schedule-cancel', id: String((await body()).id ?? '') })
  if (method === 'GET' && p === '/api/super/org') return orgView(sa)
  if (method === 'GET' && p === '/api/super/people') return people(sa)
  if (method === 'GET' && p === '/api/super/who') return who(sa, query.get('type') ?? '', query.get('id') ?? '')
  if (method === 'GET' && p === '/api/super/timeline') return timeline(sa, { who: query.get('who') || undefined, before: query.get('before') || undefined, limit: query.get('limit') || 150 })
  if ((r = p.match(/^\/api\/super\/tickets\/([a-z0-9]{6,24})$/)) && method === 'GET') return sa.ticketDetail(r[1])
  if ((r = p.match(/^\/api\/super\/tickets\/([a-z0-9]{6,24})\/file$/)) && method === 'GET') return { text: sa.ticketFile(r[1], query.get('path') ?? '') }
  if ((r = p.match(/^\/api\/super\/tickets\/([a-z0-9]{6,24})\/(say|stop|retry)$/)) && method === 'POST') {
    if (r[2] === 'say') return sa.store.command({ type: 'ticket-say', ticket: r[1], text: (await body()).text })
    return sa.store.command({ type: r[2], ticket: r[1] })
  }
  return undefined
}
