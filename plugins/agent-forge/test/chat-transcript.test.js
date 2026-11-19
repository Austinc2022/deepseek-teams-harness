// Deterministic tests of a chat room's own transcript limit (transcriptChars). No model is called: postAndWait
// takes a runner that stands in for the agent. Run: node --test plugins/agent-forge/test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Registry } from '../lib/registry.js'
import { ChatStore } from '../lib/chat.js'

function setup() {
  const registry = new Registry(fs.mkdtempSync(path.join(os.tmpdir(), 'chat-test-')))
  for (const name of ['alpha', 'beta']) registry.saveAgent({ name, description: `test agent ${name}`, backend: 'claude-code', model: 'haiku', role: 'You answer.' })
  return new ChatStore(registry)
}

const filler = (tag, n) => `${tag} ${'lorem ipsum dolor sit amet '.repeat(Math.ceil(n / 27))}`.slice(0, n)
const transcriptOf = prompt => prompt.split('Group chat transcript so far:\n\n')[1].split('\n\n---\n')[0]

/** A hand-off chain: alpha and beta pass the floor to each other with long replies; returns every prompt seen. */
async function chain(chats, id, request, { hops = 5, size = 3000 } = {}) {
  const prompts = []
  let n = 0
  await chats.postAndWait(id, request, {
    runner: async (who, p) => {
      prompts.push({ who, prompt: p.prompt })
      n++
      const next = who === 'alpha' ? 'beta' : 'alpha'
      return { ok: true, text: `${filler(`reply ${n} by ${who}`, size)}${n < hops ? ` @${next} please continue` : ' finished'}` }
    },
  })
  return prompts
}

test('a room without its own limit keeps the default: no pinned request, 60,000 characters', async () => {
  const chats = setup()
  const room = chats.create({ agents: ['alpha', 'beta'], mode: 'handoff', lead: 'alpha', maxHops: 10 })
  assert.equal(room.transcriptChars, undefined)
  const prompts = await chain(chats, room.id, `REQUEST-ONE ${filler('ask', 500)}`, { hops: 6, size: 15000 })
  assert.equal(prompts.length, 6)
  const last = transcriptOf(prompts.at(-1).prompt)
  assert.ok(last.startsWith('[earlier messages omitted]\n…'), 'the default cut is unchanged')
  assert.ok(!last.includes('[the request this task started from]'))
  assert.ok(last.length <= 60000 + 40)
})

test('a room limit shortens every reply\'s transcript and keeps the request of the current task in view', async () => {
  const chats = setup()
  const room = chats.create({ agents: ['alpha', 'beta'], mode: 'handoff', lead: 'alpha', maxHops: 10, transcriptChars: 8000 })
  assert.equal(room.transcriptChars, 8000)
  const prompts = await chain(chats, room.id, `REQUEST-TWO build the thing ${filler('ask', 300)}`, { hops: 5, size: 3000 })
  assert.equal(prompts.length, 5)
  // first reply: the whole history is the request itself, nothing is cut, nothing is pinned
  assert.ok(!transcriptOf(prompts[0].prompt).includes('[earlier messages omitted]'))
  // late in the chain the tail no longer reaches the request, so it is put back at the top
  const last = transcriptOf(prompts.at(-1).prompt)
  assert.ok(last.startsWith('[earlier messages omitted]\n[the request this task started from]\n[user]\nREQUEST-TWO build the thing'))
  assert.equal(last.split('REQUEST-TWO').length - 1, 1, 'the request appears once')
  assert.ok(last.includes('reply 4 by beta'), 'the newest reply is in the tail')
  assert.ok(!last.includes('reply 1 by alpha'), 'old replies are outside the tail')
  assert.ok(last.length <= 8000 + 6000 + 120)
})

test('the pinned request is clipped, and a later task pins its own request', async () => {
  const chats = setup()
  const room = chats.create({ agents: ['alpha', 'beta'], mode: 'handoff', lead: 'alpha', maxHops: 10, transcriptChars: 4000 })
  await chain(chats, room.id, `FIRST-TASK ${filler('ask', 200)}`, { hops: 3, size: 3000 })
  const prompts = await chain(chats, room.id, `SECOND-TASK ${filler('long ask', 9000)}`, { hops: 4, size: 3000 })
  const last = transcriptOf(prompts.at(-1).prompt)
  assert.ok(last.includes('[the request this task started from]\n[user]\nSECOND-TASK'))
  assert.ok(!last.includes('FIRST-TASK'), 'an earlier task\'s request is not pinned')
  const pinned = last.split('[the request this task started from]\n')[1].split('\n\n…')[0]
  assert.ok(pinned.length <= 6001, `pinned request is clipped (${pinned.length})`)
})

test('update sets, clamps and clears the limit; a channel follows its group chat', async () => {
  const chats = setup()
  const room = chats.create({ agents: ['alpha', 'beta'], mode: 'handoff', lead: 'alpha' })
  assert.equal(chats.update(room.id, { transcriptChars: 15000 }).transcriptChars, 15000)
  assert.equal(chats.update(room.id, { transcriptChars: 10 }).transcriptChars, 4000)
  assert.equal(chats.update(room.id, { transcriptChars: 9e9 }).transcriptChars, 200000)
  assert.equal(chats.update(room.id, { title: 'renamed' }).transcriptChars, 200000, 'other updates leave it alone')
  assert.equal(chats.update(room.id, { transcriptChars: null }).transcriptChars, undefined)
  assert.equal(chats.update(room.id, { transcriptChars: 0 }).transcriptChars, undefined)
})
