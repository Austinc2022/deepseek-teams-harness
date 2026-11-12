/**
 * Group headquarters: browser half. Adds a "Headquarters" sidebar page that embeds the HQ page served by the host
 * half under /hq/ on the same origin.
 */
window.__ModuleLoader__.load({
  id: '@local/group-hq',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const e = React.createElement

    const NS = 'group-hq'
    const LABEL = { en: 'Headquarters', zh: '集团总部', ja: '本社', es: 'Sede central', fr: 'Siège', de: 'Zentrale', ru: 'Штаб-квартира', pt: 'Sede' }
    const dictionaries = {}
    for (const [lang, v] of Object.entries(LABEL)) dictionaries[lang] = { hq: v }
    const PANEL_ID = 'group-hq'
    const src = new URL('hq/', document.baseURI).href

    function HqPage() {
      return e('iframe', { src, title: 'Headquarters', style: { flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0, border: 0, display: 'block', background: 'transparent' } })
    }
    function HqIcon(props) {
      const size = props.size ?? 18
      return e('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        e('path', { d: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-5h6v5M9 11h.01M15 11h.01' }))
    }

    const inject = ['slots', 'locale']
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'group-hq: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, HqPage))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 15, locale: NS, label: () => t('hq') }, HqIcon))
    }

    exports.NS = NS
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
