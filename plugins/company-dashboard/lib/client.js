/**
 * Company dashboard: browser half. Adds a "Company" sidebar page that embeds the
 * dashboard served by the host half under /company/ on the same origin.
 */
window.__ModuleLoader__.load({
  id: '@local/company-dashboard',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const e = React.createElement

    const NS = 'company-dashboard'
    const LABEL = { en: 'Company', zh: '公司', ja: 'カンパニー', es: 'Compañía', fr: 'Société', de: 'Firma', ru: 'Компания', pt: 'Empresa' }
    const dictionaries = {}
    for (const [lang, v] of Object.entries(LABEL)) dictionaries[lang] = { company: v }

    const PANEL_ID = 'company-dashboard'
    const src = new URL('company/', document.baseURI).href

    function CompanyPage() {
      return e('iframe', {
        src,
        title: 'Company',
        style: { flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0, border: 0, display: 'block', background: 'transparent' },
      })
    }
    function CompanyIcon(props) {
      const size = props.size ?? 18
      return e('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        e('rect', { x: 9, y: 3, width: 6, height: 5, rx: 1.2 }), e('path', { d: 'M12 8v4M5 12h14M5 12v3M12 12v3M19 12v3' }),
        e('rect', { x: 3, y: 15, width: 4, height: 5, rx: 1 }), e('rect', { x: 10, y: 15, width: 4, height: 5, rx: 1 }), e('rect', { x: 17, y: 15, width: 4, height: 5, rx: 1 }))
    }

    const inject = ['slots', 'locale']
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'company-dashboard: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, CompanyPage))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 17, locale: NS, label: () => t('company'),
      }, CompanyIcon))
    }

    exports.NS = NS
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
