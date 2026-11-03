/**
 * Host plugin: runs the Claude Code bridge gateway inside the harness process.
 * The pi-ai route `claude-code` (see cordis.patch.yml) points at it.
 */
import { ClaudeCodeGateway } from './gateway.js'

export const name = 'claude-code-bridge'

export async function apply(ctx, config = {}) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('claude-code-bridge') : null
  const log = (...a) => (logger ? logger.info(a.join(' ')) : console.error('[claude-code-bridge]', ...a))
  const token = config.tokenEnv ? process.env[config.tokenEnv] : config.token
  if (!token) log(`warning: ${config.tokenEnv ?? 'token'} is not set; the bridge accepts unauthenticated localhost requests`)
  await ctx.effect(async () => {
    const gw = new ClaudeCodeGateway({
      host: '127.0.0.1',
      port: config.port ?? 3099,
      token,
      maxSessions: config.maxSessions ?? 24,
      log,
    })
    try {
      await gw.start()
    } catch (e) {
      // Another harness process (e.g. `./dsh web` while running headless) already serves the bridge
      // on this port; reuse it only when it answers as a bridge, otherwise fail loudly.
      if (e?.code !== 'EADDRINUSE') throw e
      const port = config.port ?? 3099
      const ok = await fetch(`http://127.0.0.1:${port}/health`).then(r => r.ok, () => false)
      if (!ok) throw e
      log(`bridge already running on 127.0.0.1:${port} in another harness process; reusing it`)
      return () => {}
    }
    return () => gw.stop()
  })
}
