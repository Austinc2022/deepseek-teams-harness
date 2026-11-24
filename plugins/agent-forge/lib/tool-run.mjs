// Runs one call of a tool an agent built for itself. Started inside the sandbox by tools.js; never run it directly.
// stdin: { file, input }   stdout: a marker line followed by { ok, result | error }
import { pathToFileURL } from 'node:url'

let s = ''
for await (const c of process.stdin) s += c
const out = o => { process.stdout.write(`\n@@forge-tool-result@@${JSON.stringify(o)}\n`); process.exit(0) }
try {
  const { file, input } = JSON.parse(s)
  const m = await import(pathToFileURL(file).href)
  if (typeof m.default !== 'function') throw new Error('the code has no "export default" function')
  const r = await m.default(input ?? {})
  out({ ok: true, result: typeof r === 'string' ? r : (JSON.stringify(r, null, 2) ?? '') })
} catch (e) {
  out({ ok: false, error: String(e?.stack ?? e).slice(0, 2000) })
}
