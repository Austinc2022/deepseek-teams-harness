---
name: camp-revenue-ramp-units-per-day-r-e132
description: When checking or rebuilding the revenue-ramp part of a demand & economics evaluation: the units/day needed to hit $1M/day and $1M/year, and whether the ramp is consistent with the sizing and willingness-to-pay sections.
---

# Revenue-ramp and units/day review

Use when auditing or rebuilding the revenue-ramp section of a demand & economics evaluation for a candidate concept.

## Steps

1. Fix the arithmetic targets first: **$1M/year ≈ $2,740/day** (1,000,000/365), **$1M/day = $365M/year**. State which target each candidate is being pushed toward; never let the two blur together.
2. Take the candidate's price points — list price, effective net price after discounts/fees. Compute `units/day = target ÷ net revenue per unit` at each price. Where per-unit costs are known (payment fees, refunds, support, COGS, hosting), repeat on **contribution margin**: `units/day = target ÷ contribution per unit`. Show a small table: price → units/day → units/year.
3. Build the ramp shape month by month from launch with an explicit growth assumption (funnel: impressions → conversion → activation → paid, or a stated growth/decay rate). No flat "full volume from day one" revenue.
4. Cross-check against market sizing: required buyers/year must fit inside SOM with room for competitors; state the implied capture rate.
5. Cross-check against willingness-to-pay: the price the ramp assumes must be one the WTP evidence supports for at least one segment. If the ramp needs a price above evidenced WTP, flag it as a failure reason.
6. Sensitivity: rerun at ±25% price and ±50% conversion; name the assumption the ramp lives or dies on.
7. End with a one-line verdict per candidate: achievable / stretch / arithmetic-only (works on paper, no evidenced demand supports the inputs).

## Verify before handing over

- [ ] $1M/year is written as ≈$2,740/day, not $1M/day.
- [ ] Units/day shown at more than one price point, and on contribution margin where costs exist.
- [ ] Ramp is month-by-month with a stated growth assumption.
- [ ] SOM ceiling and WTP price constraints both checked.
- [ ] Every input traced to the sizing or WTP section — nothing invented.

## Mistakes to avoid

Mixing revenue with profit; ramping on list price while assuming discounts; annualising one good day; double-counting the same buyers in top-down and bottom-up sizing.
