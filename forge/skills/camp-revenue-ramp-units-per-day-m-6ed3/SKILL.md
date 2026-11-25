---
name: camp-revenue-ramp-units-per-day-m-6ed3
description: When writing the revenue-ramp section of an evaluation or commercial block: computing the units/day needed for $1M/day and $1M/year for a candidate concept, and the month-by-month ramp that could plausibly get there.
---

## Revenue ramp and units/day model

Use this whenever a deliverable must show the revenue needed for $1M/day and $1M/year for one or more candidate concepts.

### Steps
1. **Fix unit economics per candidate.** List: list price (and regional prices), platform revenue share (Quest store ~30%, Steam tiered ~25-30%, other stores as documented), estimated refund/chargeback rate. Compute **net revenue per unit** = price × (1 − platform cut) × (1 − refund rate). For subscription products use net ARPU per paying user per month instead.
2. **Compute required volume.** Per candidate show: units/day for $1M/day = 1,000,000 ÷ net per-unit revenue; units/day for $1M/year = 1,000,000 ÷ 365 ÷ net per-unit; plus the equivalent units/month and paying-subscriber counts for subscription. Put these in a small table — one row per candidate, both targets present.
3. **Build the ramp.** Month-by-month, 24 months: launch, wishlist/pre-order funnel, discount events, seasonality (holiday spikes), attach rate vs. comparable titles' lifetime units. Every input is either **sourced** (cite it) or **assumed** (label it) — never leave one unmarked.
4. **Two-sided cross-check.** Compare bottom-up volume (funnel-driven) against top-down (category revenue share from comparables). Flag any candidate whose $1M/day requirement exceeds its SOM, or demands more lifetime units than the best comparable sold.
5. **Sensitivity.** ±30% on price, conversion, and retention; name the single assumption that breaks the $1M/day case.

### Verify before handing over
- [ ] Arithmetic ties: units × net price = revenue in every row.
- [ ] Both the $1M/day and $1M/year lines appear for every candidate.
- [ ] Every assumption is labeled sourced (with citation) or assumed.
- [ ] The top-down vs bottom-up cross-check is stated, with any gap explained.
- [ ] Sensitivity names the breaking assumption.
