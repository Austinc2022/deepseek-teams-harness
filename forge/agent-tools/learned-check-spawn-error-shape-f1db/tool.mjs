export default async function (input) {
  const cp = await import('node:child_process')
  const { mode, file, args = [], waitMs = 500 } = input
  if (typeof file !== 'string' || !file) throw new Error('file must be a non-empty string')
  const allowed = ['spawn', 'spawnSync', 'execFileSync', 'execSync']
  if (!allowed.includes(mode)) throw new Error(`mode must be one of ${allowed.join(', ')}`)
  const out = { mode, file, node: process.version }
  const desc = e => e ? { code: e.code ?? null, errno: e.errno ?? null, syscall: e.syscall ?? null, message: String(e.message).slice(0, 120) } : null
  if (mode === 'spawn') {
    let child = null, threw = null
    try { child = cp.spawn(file, args, { stdio: 'ignore' }) } catch (e) { threw = desc(e) }
    out.syncThrow = threw
    if (child) {
      const seen = await new Promise(resolve => {
        const t = setTimeout(() => resolve({ event: 'none-within-waitMs', error: null }), waitMs)
        child.on('error', e => { clearTimeout(t); resolve({ event: 'error', error: desc(e) }) })
        child.on('exit', (code, signal) => { clearTimeout(t); resolve({ event: 'exit', code, signal }) })
      })
      out.asyncResult = seen
    } else {
      out.asyncResult = { event: 'never-created', error: null }
    }
  } else if (mode === 'spawnSync') {
    const r = cp.spawnSync(file, args, { encoding: 'utf8' })
    out.returned = { error: desc(r.error), status: r.status, signal: r.signal }
  } else if (mode === 'execFileSync') {
    try { cp.execFileSync(file, args, { stdio: 'ignore' }); out.syncThrow = null; out.ok = true } catch (e) { out.syncThrow = desc(e); out.ok = false }
  } else {
    try { cp.execSync(String(file), { stdio: 'ignore' }); out.syncThrow = null; out.ok = true } catch (e) { out.syncThrow = desc(e); out.ok = false }
  }
  return out
}