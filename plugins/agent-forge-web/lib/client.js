/**
 * Agent Forge web pages: browser half.
 *
 * Registers four sidebar entries (sidebar.panellist) and their main-column
 * pages (main, keyed by the same panel id). Each page embeds the Agent Forge
 * console served by the host half under /forge/ on the same origin.
 */
window.__ModuleLoader__.load({
  id: '@local/agent-forge-web',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const e = React.createElement

    const NS = 'agent-forge'
    const t8 = (en, zh, ja, es, fr, de, ru, pt) => ({ en, zh, ja, es, fr, de, ru, pt })
    const COPY = {
      chat: t8('Agent chat', '智能体群聊', 'エージェントチャット', 'Chat de agentes', "Chat d'agents", 'Agenten-Chat', 'Чат агентов', 'Chat de agentes'),
      agents: t8('Agents', '智能体', 'エージェント', 'Agentes', 'Agents', 'Agenten', 'Агенты', 'Agentes'),
      teams: t8('Agent teams', '智能体团队', 'エージェントチーム', 'Equipos de agentes', "Équipes d'agents", 'Agententeams', 'Команды агентов', 'Equipes de agentes'),
      workflows: t8('Workflows', '工作流编排', 'ワークフロー', 'Flujos de trabajo', 'Workflows', 'Workflows', 'Воркфлоу', 'Fluxos de trabalho'),
    }
    const dictionaries = {}
    for (const lang of ['en', 'zh', 'ja', 'es', 'fr', 'de', 'ru', 'pt']) {
      dictionaries[lang] = {}
      for (const [key, v] of Object.entries(COPY)) dictionaries[lang][key] = v[lang]
    }

    const svg = (size, ...paths) => e('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, ...paths.map((d, i) => e('path', { key: i, d })))
    const ICONS = {
      chat: size => svg(size, 'M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M17 9h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-4-3h-3'),
      agents: size => svg(size, 'M9 3h6', 'M12 3v3', 'M6 6h12a2 2 0 0 1 2 2v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a2 2 0 0 1 2-2z', 'M9 12h.01', 'M15 12h.01', 'M9.5 16h5'),
      teams: size => svg(size, 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M3 20a6 6 0 0 1 12 0', 'M16 5.5a3 3 0 0 1 0 5.5', 'M18 14.5a6 6 0 0 1 3 5.5'),
      workflows: size => svg(size, 'M4 4h6v5H4z', 'M14 15h6v5h-6z', 'M14 4h6v5h-6z', 'M7 9v4a2 2 0 0 0 2 2h5', 'M10 6.5h4'),
    }

    const PANELS = [
      { key: 'chat', id: 'agent-forge-chat', order: 20 },
      { key: 'agents', id: 'agent-forge-agents', order: 21 },
      { key: 'teams', id: 'agent-forge-teams', order: 22 },
      { key: 'workflows', id: 'agent-forge-workflows', order: 23 },
    ]

    function makePage(panel) {
      const src = new URL(`forge/?view=${panel.key}`, document.baseURI).href
      function ForgePage() {
        return e('iframe', {
          src,
          title: COPY[panel.key].en,
          style: { flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0, border: 0, display: 'block', background: 'transparent' },
        })
      }
      ForgePage.displayName = `AgentForgePage(${panel.key})`
      return ForgePage
    }
    function makeIcon(panel) {
      function ForgeIcon(props) { return ICONS[panel.key](props.size ?? 18) }
      ForgeIcon.displayName = `AgentForgeIcon(${panel.key})`
      return ForgeIcon
    }

    const inject = ['slots', 'locale']
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'agent-forge-web: dictionaries')
      const t = ctx.locale.bind(NS)
      for (const panel of PANELS) {
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: panel.id, locale: NS }, makePage(panel)))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: panel.id, order: panel.order, locale: NS, label: () => t(panel.key),
        }, makeIcon(panel)))
      }
    }

    exports.NS = NS
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
