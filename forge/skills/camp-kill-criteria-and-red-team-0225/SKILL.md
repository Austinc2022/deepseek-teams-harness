---
name: camp-kill-criteria-and-red-team-0225
description: When writing the red-team failure-reason list and kill criteria for a candidate concept or shortlist decision.
---

## Red-team failure reasons and kill criteria

Use this when a deliverable must list failure reasons and kill criteria for candidate concepts, so a decision can be stopped early instead of after the full budget.

### Steps
1. **List failure reasons by category**, per candidate: demand (comparable underperformance, niche ceiling), competition (incumbents, clone timing), platform/market (store policy, discoverability), execution/cost (team capability, budget overrun), pricing/WTP (price resistance by segment/region), regulatory.
2. **Rank by likelihood × impact**; keep the top 5-8 failure reasons. Do not pad the list with generic risks ("competition", "execution") — each must name the specific mechanism for THIS candidate.
3. **Derive one kill criterion per top failure reason.** Exact format: "Kill if **[metric]** **[≤ or ≥]** **[threshold]** by **[date]** (measure: [how it is measured / evidence source])". Examples: "Kill if Quest store wishlists < 5,000 by 30 days pre-launch"; "Kill if comparable X's 90-day units < 20k".
4. **Test each criterion**: falsifiable (a number, not "doesn't work"), time-bounded (a check date before the next spend gate), measurable with evidence available at that date, and cheap to check relative to the budget it protects.
5. **Reconcile with the shortlist.** A candidate with an unmitigated high-likelihood kill trigger cannot be ranked #1; if the ranking disagrees with the red-team, say which one wins and why.

### Verify before handing over
- [ ] Every top failure reason has exactly one kill criterion in the metric/threshold/date format.
- [ ] No criterion is vague, unmeasurable, or only checkable after full spend.
- [ ] Failure reasons are candidate-specific, not boilerplate.
- [ ] The shortlist ranking is consistent with the kill criteria, or the conflict is explained.
