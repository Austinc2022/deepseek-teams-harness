/**
 * Project board: browser half. Adds a "Projects" sidebar page that embeds the
 * board served by the host half under /project-board/ on the same origin.
 */
window.__ModuleLoader__.load({
  id: '@local/project-board',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const e = React.createElement

    const NS = 'project-board'
    const LABEL = { en: 'Projects', zh: '项目', ja: 'プロジェクト', es: 'Proyectos', fr: 'Projets', de: 'Projekte', ru: 'Проекты', pt: 'Projetos' }
    const dictionaries = {}
    for (const [lang, v] of Object.entries(LABEL)) dictionaries[lang] = { projects: v }

    const PANEL_ID = 'project-board'
    const src = new URL('project-board/', document.baseURI).href

    function ProjectsPage() {
      return e('iframe', {
        src,
        title: 'Projects',
        style: { flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0, border: 0, display: 'block', background: 'transparent' },
      })
    }
    function ProjectsIcon(props) {
      const size = props.size ?? 18
      return e('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        e('rect', { x: 3, y: 4, width: 5, height: 16, rx: 1.5 }), e('rect', { x: 10, y: 4, width: 5, height: 11, rx: 1.5 }), e('rect', { x: 17, y: 4, width: 4, height: 7, rx: 1.5 }))
    }

    const inject = ['slots', 'locale']
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'project-board: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, ProjectsPage))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 19, locale: NS, label: () => t('projects'),
      }, ProjectsIcon))
    }

    exports.NS = NS
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
