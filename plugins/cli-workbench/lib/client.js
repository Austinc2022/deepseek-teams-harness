/**
 * CLI Workbench: browser half. Adds a "CLI workbench" sidebar page that embeds
 * the terminal grid served by the host half under /workbench/ on the same origin.
 */
window.__ModuleLoader__.load({
  id: '@local/cli-workbench',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const e = React.createElement

    const NS = 'cli-workbench'
    const LABEL = { en: 'CLI workbench', zh: 'CLI 工作台', ja: 'CLI ワークベンチ', es: 'Banco CLI', fr: 'Atelier CLI', de: 'CLI-Werkbank', ru: 'CLI-верстак', pt: 'Bancada CLI' }
    const dictionaries = {}
    for (const [lang, v] of Object.entries(LABEL)) dictionaries[lang] = { workbench: v }

    const PANEL_ID = 'cli-workbench'
    const src = new URL('workbench/', document.baseURI).href

    function WorkbenchPage() {
      return e('iframe', {
        src,
        title: 'CLI workbench',
        allow: 'clipboard-read; clipboard-write',
        style: { flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0, border: 0, display: 'block', background: 'transparent' },
      })
    }
    function WorkbenchIcon(props) {
      const size = props.size ?? 18
      return e('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        e('rect', { x: 2, y: 3, width: 9, height: 8, rx: 1.5 }), e('rect', { x: 13, y: 3, width: 9, height: 8, rx: 1.5 }),
        e('rect', { x: 2, y: 13, width: 9, height: 8, rx: 1.5 }), e('rect', { x: 13, y: 13, width: 9, height: 8, rx: 1.5 }),
        e('path', { d: 'M4.5 6l1.5 1.5-1.5 1.5' }), e('path', { d: 'M15.5 6l1.5 1.5-1.5 1.5' }))
    }

    const inject = ['slots', 'locale']
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'cli-workbench: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, WorkbenchPage))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 24, locale: NS, label: () => t('workbench'),
      }, WorkbenchIcon))
    }

    exports.NS = NS
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
