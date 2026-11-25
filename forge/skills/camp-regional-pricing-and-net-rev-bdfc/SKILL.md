---
name: camp-regional-pricing-and-net-rev-bdfc
description: When monetisation.md sets or revises prices for multiple regions/markets, or whenever you must show net revenue per unit after tax and store fees.
---

Use whenever monetisation.md must set prices outside one base currency.

1. Fix the base price and currency (usually USD) and record its rationale (comparable titles, WTP evidence).
2. Build regional price tiers: group markets by affordability (e.g. US/Western EU, rest-of-EU/UK, JP/KR/ANZ, LATAM, SEA/India). Use PPP or affordability ratios plus comparable titles' local prices as the basis — never FX conversion alone.
3. For every market record: list price in local currency, charm-pricing convention (€x,99 / ¥x00 / $x.99), and the tax treatment (VAT-inclusive like the EU, or sales-tax-exclusive like the US).
4. Compute net revenue per unit: `net = local_price × FX_rate × (1 − platform_cut) × (1 − tax_if_exclusive)`. State the assumed platform cut (e.g. 30%, note any reduced rate) and FX rate date.
5. Reconcile: net revenue across regions should sum to the revenue table elsewhere in monetisation.md; currency and gross/net conventions must be identical everywhere.
6. Write all of it as a table in monetisation.md: market, local price, tax treatment, FX rate + date, platform cut, net per unit, basis/source.

Before handover, verify: (a) every price has a basis note (measured comparable, PPP ratio, or explicitly "assumed"); (b) tax is labelled inclusive/exclusive in every row; (c) the platform cut is applied to the correct base; (d) FX rates carry a date; (e) totals reconcile with the revenue section; (f) no market is silently left at the base price without a reason.

Common mistakes: converting USD with spot FX and rounding (makes poor regions relatively expensive); forgetting VAT-inclusive prices already contain tax; applying the platform cut to gross including tax; mixing gross and net in one total.
