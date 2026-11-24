/**
 * Training camp: host half.
 *
 * - Serves the Training camp page and its API under /training-camp on the DeepSeek Harness web server. Every
 *   request needs the DSH browser-session cookie; API calls also need the X-Camp-Request header (forces a CORS
 *   preflight that is never approved) and a same-origin Origin when sent.
 * - Registers camp_* tools, so the harness lead agent can open a camp, show and change its workflow, start
 *   training and report on it. Publishing stays with the owner (the page or ./camp-cli).
 *
 * Camps run on the shared Agent Forge registry and engine, so every phase appears on Workflows > Runs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { shared } from '../agent-forge/lib/shared.js'
import { camps } from './lib/camp.js'
import { handle, readJson, send } from './lib/http.js'
import { workflowText } from './lib/workflow.js'

export const name = 'training-camp'
export const inject = ['webServer', 'connection', 'tools']

const MOUNT = '/training-camp'
const here = path.dirname(fileURLToPath(import.meta.url))
const text = { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] }

export function apply(ctx) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('training-camp') : null
  const log = m => (logger ? logger.info(m) : console.error(`[training-camp] ${m}`))
  const cs = camps(shared({ log }), { log })

  if (ctx.webServer && ctx.connection) {
    const sameOrigin = req => {
      const origin = req.headers.origin
      if (!origin) return true
      try { return new URL(origin).host === req.headers.host } catch { return false }
    }
    const handler = async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://dsh.invalid')
      if (url.pathname === MOUNT) {
        res.writeHead(308, { location: `${MOUNT}/${url.search}`, 'cache-control': 'no-store' })
        return res.end()
      }
      if (!ctx.connection.authorizeIndex(req, res)) return
      const p = url.pathname.slice(MOUNT.length) || '/'
      if (p === '/' && req.method === 'GET') return send(res, 200, fs.readFileSync(path.join(here, 'ui/index.html'), 'utf8'), 'text/html; charset=utf-8')
      if (p.startsWith('/api/')) {
        if (req.headers['x-camp-request'] !== '1' || !sameOrigin(req)) return send(res, 403, { error: 'forbidden' })
        try {
          const out = await handle(cs, req.method, p, () => readJson(req), url.searchParams)
          if (out === undefined) return send(res, 404, { error: 'not found' })
          return send(res, 200, out)
        } catch (e) { return send(res, 400, { error: e?.message ?? String(e) }) }
      }
      send(res, 404, { error: 'not found' })
    }
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: MOUNT, handler: (req, res) => {
      Promise.resolve(handler(req, res)).catch(e => { if (!res.headersSent) send(res, 500, { error: e?.message ?? String(e) }); else res.destroy() })
    } }), 'training-camp: /training-camp route')
    log(`Training camp mounted at ${MOUNT}/`)
  }

  if (!ctx.tools) return
  const tools = [
    defineTool({
      name: 'camp_list',
      description: 'List training camps. A training camp turns a goal into a workflow, trains the agents and the team that run it on generated tasks, verifies them on a sealed set, and publishes the ones that pass into Agent Forge.',
      parameters: {},
      output: text,
      async execute() { return cs.list().map(c => `- ${c.id} "${c.name}": ${c.status}${c.busy ? ' (running)' : ''}; workflow v${c.workflowVersion}; spend about $${c.spend.usd}`).join('\n') || 'No camps yet. Create one with camp_new.' },
    }),
    defineTool({
      name: 'camp_new',
      description: 'Open a training camp for a goal and ask its architect to propose the workflow (stages, roles, teams). Returns the camp id; the proposal takes a few minutes, read it with camp_status. The owner must approve the workflow before training starts.',
      parameters: {
        goal: { type: 'string', required: true, description: 'What the trained team should be able to achieve' },
        name: { type: 'string', description: 'Short name of the camp' },
        workflow_idea: { type: 'string', description: 'The owner\'s own idea of the stages, if they gave one' },
      },
      output: text,
      async execute(a) {
        const c = cs.create({ goal: a.goal, name: a.name, hint: a.workflow_idea })
        const r = cs.propose(c.id)
        return `Opened camp ${c.id} "${c.name}". The architect is proposing the workflow (run ${r.runId}). Read it with camp_status, show it to the owner, and apply what they want changed with camp_workflow_change. Training starts only after the owner approves (camp_approve).`
      },
    }),
    defineTool({
      name: 'camp_status',
      description: 'Status of a training camp: the workflow, what is running, the scoreboard per role and for the team, and what passed verification.',
      parameters: { camp_id: { type: 'string', required: true } },
      output: text,
      async execute(a) {
        const c = cs.get(a.camp_id)
        const run = c.run ? `\n\nLast run ${c.run.id} (${c.run.what}): ${c.run.status}${c.run.phase ? `, phase ${c.run.phase}` : ''}${c.run.error ? `, error: ${c.run.error}` : ''}${c.run.running.length ? `\nRunning now: ${c.run.running.map(x => x.label).join(', ')}` : ''}` : ''
        return `${c.report}${c.workflow ? `\n\nWorkflow v${c.workflowVersion}:\n${workflowText(c.workflow)}` : ''}${run}`
      },
    }),
    defineTool({
      name: 'camp_workflow_change',
      description: 'Apply a change the owner asked for to a camp\'s workflow, in the owner\'s words (add, remove, merge, reorder or reassign stages, change a deliverable, add a review). Produces a new version that needs the owner\'s approval again. Roles whose job does not change keep their training.',
      parameters: { camp_id: { type: 'string', required: true }, change: { type: 'string', required: true, description: 'What the owner wants changed' } },
      output: text,
      async execute(a) { const r = cs.revise(a.camp_id, a.change); return `The architect is revising the workflow (run ${r.runId}). Read the new version with camp_status and show the owner what changed.` },
    }),
    defineTool({
      name: 'camp_approve',
      description: 'Record that the owner approved the current workflow of a camp. Call it only after the owner has seen this version and said yes.',
      parameters: { camp_id: { type: 'string', required: true } },
      output: text,
      async execute(a) { const r = cs.approve(a.camp_id); return `Workflow approved.${r.kept.length ? ` Kept the training of: ${r.kept.join(', ')}.` : ''}${r.reset.length ? ` To train: ${r.reset.join(', ')}.` : ''} Start with camp_train.` },
    }),
    defineTool({
      name: 'camp_train',
      description: 'Start or resume training of a camp whose workflow is approved. Training makes many model calls and can take hours; it pauses by itself at the budget or at a subscription limit and resumes from where it stopped. Publishing afterwards is the owner\'s action on the Training camp page or with ./camp-cli publish.',
      parameters: { camp_id: { type: 'string', required: true }, roles: { type: 'array', items: { type: 'string' }, description: 'Train only these roles (default: all)' } },
      output: text,
      async execute(a) { const r = cs.train(a.camp_id, a.roles?.length ? { roles: a.roles } : {}); return `Training started (run ${r.runId}). Follow it with camp_status, on the Training camp page, or on Workflows > Runs.` },
    }),
    defineTool({
      name: 'camp_stop',
      description: 'Stop the phase a camp is running. Nothing is lost; camp_train resumes.',
      parameters: { camp_id: { type: 'string', required: true } },
      output: text,
      async execute(a) { const r = cs.cancel(a.camp_id); return r.ok ? 'Stopping.' : r.note },
    }),
  ]
  for (const t of tools) ctx.effect(() => ctx.tools.register(t))
}
