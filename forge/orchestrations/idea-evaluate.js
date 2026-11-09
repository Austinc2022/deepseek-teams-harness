// Venture studio, step 2: full investment-committee evaluation of one idea.
// Four independent judges in parallel (market, unit economics, feasibility, devil's advocate)
// -> ic-chair aggregates them into a calibrated verdict -> ledger + reports/ideas/evaluations/<id>.md
//
//   forge run idea-evaluate idea=2026-11-09-some-idea          (ledger id from an idea-scout report)
//   forge run idea-evaluate idea="A desktop app that ..."       (free text: added to the ledger first)

export const meta = {
  name: 'idea-evaluate',
  description: 'Investment committee: four parallel judges plus an aggregating chair give one idea a pursue/watch/reject verdict with revenue tiers.',
  team: 'venture-evaluators',
  args: {
    idea: 'Ledger id (from an idea-scout report) or a free-text idea description (required)',
  },
}

import { resolveIdea, evaluateIdea } from '../lib/venture.mjs'

export default async function (api) {
  const home = api.run.home
  api.phase('Evaluate')
  const id = await resolveIdea(home, api.args.idea)
  api.log(`evaluating ${id}`)
  const r = await evaluateIdea(api, home, id)
  if (!r) throw new Error('evaluation failed')
  return r
}
