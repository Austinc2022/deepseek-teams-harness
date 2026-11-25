---
name: camp-tc-monetisation-designer-jud-b83a
description: When judging a producer's monetisation sketch for a buy-to-own VR/premium game and writing monetisation.md with price, regional tiers, purchase verdicts, live-ops calendar and revenue arithmetic.
---

1. Extract an evidence key [E1..En]: label every measured datum (wishlists, demo downloads, survey WTP, comparables) and keep planner claims separate — never let sketch assumptions enter arithmetic unlabeled.
2. Price from the sketch's own evidence: compute demand-weighted revenue at each surveyed price point (price × WTP%); the sketch's price is wrong if its own survey says otherwise.
3. Regional tiers must NOT be FX conversion: shelf prices are VAT/GST-inclusive in EU/UK/JP/BR. Net/unit = shelf ÷ (1+tax) × (1 − store cut) ÷ FX. Use PPP tiering for emerging markets (Steamworks multi-variable method), conventional .99/.980 price points, and cite the store fee (Meta Quest 30%, Reuters 13 Apr 2022) and FX source with date. Blend with an explicit, flagged market-mix assumption.
4. Verdict every IAP item against the hard rule: reject paid randomised rewards (loot boxes), pay-to-skip core content, expiring paid entitlements, double-XP/coins, false scarcity, punishing streaks. Ship at most 3 SKUs: premium edition (named content only, no unlimited promises), cosmetic companion pack, one paid expansion.
5. Revenue arithmetic in units, not DAU: buy-to-own games have no daily per-user revenue. Anchor month-1 units to comparable launch-month bands; wishlist funnel (wishlists × 5–15%) is a floor check; assume decay for M2/M3 and label it. Net revenue = units × blended net/buyer (attach uplift folded in).
6. Check the headline claim's math explicitly: the arithmetic may compute correctly while describing a nonexistent product. Convert any $/day target into required units/day and into multiples of the comparable band.
7. Always end with missing evidence and its numeric effect (price test, regional mix, retention, funnel overlap).
8. Verify: write a verify script that recomputes every printed figure (net/unit per market, blended, per-buyer, case tables, target requirement) and run it; report PASS. Keep the doc under the word cap — count words excluding table pipes.
