// End-to-end check of the bridge: tool_use -> tool_result continuation -> new user turn.
// Usage: node test/roundtrip.mjs   (starts its own gateway on a random port)
import { ClaudeCodeGateway } from '../gateway.js'

const gw = await new ClaudeCodeGateway({ port: 0, token: 'test-token', log: () => {} }).start()
const base = `http://127.0.0.1:${gw.server.address().port}`
const tools = [{ name: 'get_weather', description: 'Get current weather for a city', input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }]
const system = 'You are a terse assistant. Use tools when they help.'

async function call(messages, stream = false) {
  const r = await fetch(`${base}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-token' }, body: JSON.stringify({ model: 'haiku', max_tokens: 1024, system, tools, messages, stream }) })
  if (!stream) return r.json()
  const text = await r.text()
  return text.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)))
}

const t0 = Date.now()
const m1 = [{ role: 'user', content: 'What is the weather in Paris? Use the tool.' }]
const r1 = await call(m1)
const tu = r1.content?.find(b => b.type === 'tool_use')
console.log('1 stop:', r1.stop_reason, 'tool:', tu?.name, JSON.stringify(tu?.input), `${Date.now() - t0}ms`)
if (!tu) { console.log(JSON.stringify(r1)); process.exit(1) }

const m2 = [...m1, { role: 'assistant', content: r1.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: tu.id, content: 'Paris: 17°C, light rain' }] }]
const sessionsBefore = gw.sessions.size
const ev2 = await call(m2, true)
const text2 = ev2.filter(e => e.type === 'content_block_delta' && e.delta.type === 'text_delta').map(e => e.delta.text).join('')
console.log('2 streamed events:', ev2.length, 'text:', JSON.stringify(text2), 'reused session:', gw.sessions.size === sessionsBefore, `${Date.now() - t0}ms`)

const m3 = [...m2, { role: 'assistant', content: [{ type: 'text', text: text2 }] }, { role: 'user', content: 'Repeat the temperature number only.' }]
const r3 = await call(m3)
console.log('3 text:', JSON.stringify(r3.content?.filter(b => b.type === 'text').map(b => b.text).join('')), 'sessions:', gw.sessions.size, `${Date.now() - t0}ms`)

const bad = await fetch(`${base}/v1/models`, { headers: { 'x-api-key': 'wrong' } })
console.log('bad token status:', bad.status)
await gw.stop()
