/**
 * Super team: browser half. Adds a "Super team" sidebar page that embeds the page served by the host half
 * under /super-team/ on the same origin.
 */
window.__ModuleLoader__.load({
  id: '@local/super-team',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const e = React.createElement

    const NS = 'super-team'
    const LABEL = { en: 'Super team', zh: '超级团队', ja: 'スーパーチーム', es: 'Superequipo', fr: 'Super équipe', de: 'Super-Team', ru: 'Суперкоманда', pt: 'Superequipe' }
    const dictionaries = {}
    for (const [lang, v] of Object.entries(LABEL)) dictionaries[lang] = { superTeam: v }

    const PANEL_ID = 'super-team'
    const src = new URL('super-team/', document.baseURI).href

    function SuperTeamPage() {
      return e('iframe', {
        src,
        title: 'Super team',
        style: { flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0, border: 0, display: 'block', background: 'transparent' },
      })
    }
    function SuperTeamIcon(props) {
      const size = props.size ?? 18
      return e('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        e('circle', { cx: 12, cy: 5, r: 2.5 }), e('path', { d: 'M12 7.5V11M5 11h14M5 11v3M12 11v3M19 11v3' }),
        e('circle', { cx: 5, cy: 17, r: 2.5 }), e('circle', { cx: 12, cy: 17, r: 2.5 }), e('circle', { cx: 19, cy: 17, r: 2.5 }))
    }

    const inject = ['slots', 'locale']
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'super-team: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, SuperTeamPage))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 18, locale: NS, label: () => t('superTeam'),
      }, SuperTeamIcon))
    }

    exports.NS = NS
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
