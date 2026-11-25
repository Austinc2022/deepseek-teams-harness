---
name: camp-revenue-arithmetic-with-expl-6232
description: When monetisation.md contains revenue projections, offer/revenue arithmetic, or any numbers derived from prices and audience assumptions.
---

Use whenever monetisation.md contains revenue projections or any arithmetic from prices to money.

1. Write the model as a visible formula chain, e.g. `revenue = MAU × conversion% × purchase_frequency × avg_net_price`, per region and per SKU where relevant. No number appears without its formula.
2. List every assumption in a table: value, basis (measured from this product, from a named comparable, or assumed), and source. The evidence rules are the same as for any claim: measured > comparable > assumed, and "assumed" must be written as assumed.
3. Produce three cases (low / base / high) that differ only in the assumption table, not in the formulas. Keep every case arithmetically consistent internally.
4. Sensitivity: identify the two assumptions that move revenue most (usually conversion and price) and show revenue at ±20% on each.
5. Verify the arithmetic before handover: recompute the base case from the formula chain independently; check totals equal the sum of regions/SKUs; check gross vs net (platform cut and tax) is applied consistently; check units (per month vs per year, per unit vs in thousands); check currency consistency.
6. State what evidence would falsify the base case (e.g. "if week-1 conversion is below X, the base case fails"), so a later review can check it against reality.

Before handover, verify: (a) every figure traces to a formula and an assumption row; (b) low/base/high are internally consistent; (c) sensitivity covers the top two drivers; (d) independent recomputation matches; (e) gross/net, units and currency are consistent across the whole document.

Common mistakes: double-counting tax or the platform cut; mixing monthly and annual figures; presenting one case as the answer; assumptions with no basis label; totals that do not sum.
