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
    const BOARD = { en: 'Dashboard', zh: '仪表盘', ja: 'ダッシュボード', es: 'Panel', fr: 'Tableau de bord', de: 'Dashboard', ru: 'Панель', pt: 'Painel' }
    const ADVISORY = { en: 'Advisory', zh: '顾问团队', ja: 'アドバイザリー', es: 'Asesoría', fr: 'Conseil', de: 'Beratung', ru: 'Консультанты', pt: 'Consultoria' }
    const CONNECT = { en: 'Connections', zh: '连接', ja: '接続', es: 'Conexiones', fr: 'Connexions', de: 'Verbindungen', ru: 'Подключения', pt: 'Conexões' }
    for (const [lang, v] of Object.entries(LABEL)) dictionaries[lang] = { company: v, board: BOARD[lang], advisory: ADVISORY[lang], connect: CONNECT[lang] }

    const PANEL_ID = 'company-dashboard'
    const src = new URL('company/', document.baseURI).href

    function CompanyPage() {
      return e('iframe', {
        src,
        title: 'Company',
        style: { flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0, border: 0, display: 'block', background: 'transparent' },
      })
    }
    const BOARD_ID = 'company-board'
    const boardSrc = new URL('company/board.html', document.baseURI).href
    function BoardPage() {
      return e('iframe', { src: boardSrc, title: 'Company dashboard', style: { flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0, border: 0, display: 'block', background: 'transparent' } })
    }
    function BoardIcon(props) {
      const size = props.size ?? 18
      return e('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        e('path', { d: 'M4 20V10M10 20V4M16 20v-7M22 20H2' }))
    }
    function CompanyIcon(props) {
      const size = props.size ?? 18
      return e('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        e('rect', { x: 9, y: 3, width: 6, height: 5, rx: 1.2 }), e('path', { d: 'M12 8v4M5 12h14M5 12v3M12 12v3M19 12v3' }),
        e('rect', { x: 3, y: 15, width: 4, height: 5, rx: 1 }), e('rect', { x: 10, y: 15, width: 4, height: 5, rx: 1 }), e('rect', { x: 17, y: 15, width: 4, height: 5, rx: 1 }))
    }

    const frame = (file, title) => function Page() { return e('iframe', { src: new URL('company/' + file, document.baseURI).href, title, style: { flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0, border: 0, display: 'block', background: 'transparent' } }) }
    const AdvisoryPage = frame('advisory.html', 'Advisory')
    const ConnectPage = frame('connections.html', 'Connections')
    const icon = d => function Icon(props) { const size = props.size ?? 18; return e('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, e('path', { d })) }
    const AdvisoryIcon = icon('M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2h5c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z')
    const ConnectIcon = icon('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1')
    const inject = ['slots', 'locale']
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'company-dashboard: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, CompanyPage))
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: BOARD_ID, locale: NS }, BoardPage))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: BOARD_ID, order: 16, locale: NS, label: () => t('board'),
      }, BoardIcon))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 17, locale: NS, label: () => t('company'),
      }, CompanyIcon))
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'company-advisory', locale: NS }, AdvisoryPage))
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'company-connections', locale: NS }, ConnectPage))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'company-advisory', order: 18, locale: NS, label: () => t('advisory') }, AdvisoryIcon))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'company-connections', order: 19, locale: NS, label: () => t('connect') }, ConnectIcon))
    }

    exports.NS = NS
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
