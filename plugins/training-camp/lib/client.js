/**
 * Training camp: browser half. Adds a "Training camp" sidebar page that embeds the page served by the host half
 * under /training-camp/ on the same origin.
 */
window.__ModuleLoader__.load({
  id: '@local/training-camp',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const e = React.createElement

    const NS = 'training-camp'
    const LABEL = { en: 'Training camp', zh: '训练营', ja: 'トレーニングキャンプ', es: 'Campo de entrenamiento', fr: "Camp d'entraînement", de: 'Trainingscamp', ru: 'Тренировочный лагерь', pt: 'Campo de treino' }
    const dictionaries = {}
    for (const [lang, v] of Object.entries(LABEL)) dictionaries[lang] = { trainingCamp: v }

    const PANEL_ID = 'training-camp'
    const src = new URL('training-camp/', document.baseURI).href

    function TrainingCampPage() {
      return e('iframe', {
        src,
        title: 'Training camp',
        style: { flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0, border: 0, display: 'block', background: 'transparent' },
      })
    }
    function TrainingCampIcon(props) {
      const size = props.size ?? 18
      return e('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        e('path', { d: 'M3 17l5-6 4 3 4-7 5 5' }), e('circle', { cx: 16, cy: 7, r: 1.6 }), e('path', { d: 'M3 21h18' }))
    }

    const inject = ['slots', 'locale']
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'training-camp: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, TrainingCampPage))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 19, locale: NS, label: () => t('trainingCamp'),
      }, TrainingCampIcon))
    }

    exports.NS = NS
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
