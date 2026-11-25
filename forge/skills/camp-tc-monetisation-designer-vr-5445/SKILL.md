---
name: camp-tc-monetisation-designer-vr-5445
description: When writing a monetisation/live-ops document for a VR buy-to-own game from producer proposals and earlier-stage fixtures
---

1. Extract an evidence key: label every datum as [M] measured (fixture or verified storefront), [C] comparable-derived, or [A] assumed. Keep planner/sketch claims separate; never let unsourced assumptions enter arithmetic unlabeled.
2. Audit claims first, before any pricing: for each headline claim (TAM, conversion, run-rate, target reachability) state supported/unsupported/overstated and why. Flag unsourced inputs rather than repeating them.
3. Price from own WTP evidence: compute demand-weighted revenue at each surveyed price point; choose the point with measured support, not the highest price. Verify comparables via direct storefront fetch (cc=us&l=en on Steam) rather than relying on memory.
4. Regional tiers: never FX-convert a single USD price. Use PPP/affordability tiers, correct charm endings, and explicit tax treatment per market. net = price/(1+inclusive_tax) x 0.70 x FX; USD regions with sales tax are tax-exclusive. Cite FX source and date, platform cut and source. Note that some regions (Turkey USD_MENA, Argentina USD_LATAM) are fixed USD price groups, not FX-convertible.
5. IAP verdicts against hard rules: reject paid randomization, pay-to-win (score/rank multipliers), expiring entitlements, false scarcity (fake counters/countdowns), permanent unavailability. Offer at most 3 bounded SKUs with named content, released to all owners simultaneously.
6. Revenue arithmetic in units, never DAU for buy-to-own: formula chain, assumption table with measured/comparable/assumed basis, 3 cases (low/base/high) differing only in assumptions, sensitivity on top 2 drivers, falsification rules. State explicitly what evidence would change the model.
7. Check headline claim math explicitly: convert $/day target into kept units/day and multiples of comparable band; show that a launch-month peak divided by 30 is not a run-rate.
8. Verify: write a Python verifier recomputing every printed figure (net/unit per market, blended, per-buyer, case tables, target requirement) and run it; report PASS. Keep doc under word cap.
Common mistakes: double-counting tax or platform cut; mixing gross and net; presenting one case as the answer; unlabeled assumptions; counting table pipes as words; claiming storefront data you did not fetch.
