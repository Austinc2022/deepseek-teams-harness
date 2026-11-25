---
name: camp-tc-monetisation-designer-sub-65e3
description: When reviewing a free-to-play or subscription mobile app's monetisation proposal with funnel telemetry, pricing changes, and revenue projections.
---

1. Read the funnel file and identify stage counts explicitly. Recompute each ratio independently (e.g., paid/day7) and flag any label that conflicts with arithmetic, such as a report saying "10% of remaining trialists" while the numbers imply 20%.
2. Diagnose the leak from stages: installs->trial, trial->day7, day7->paid, plus post-purchase churn/refunds/support. If post-purchase churn is high and refunds are "forgot to cancel", the problem is activation/billing clarity, not missing microtransactions.
3. Judge proposals against consumer-protection risk and product norms: reject consumable gating of already-subscribed content (pay-per-use inside a subscription) and reject fake countdowns/manufactured scarcity as deceptive. State a one-sentence reason grounded in risk and norms.
4. Revise pricing toward the diagnosed drop-off: shorten trial to force value proof, make annual the hero price at a deep discount, add one legitimate incentive (lock-in price + refund window). No expiring offers.
5. Build a 90-day event calendar with dates, segments, KPIs; benefits free or earned; no purchase expires; no overlapping price events; at least one lapsed-player and one payer event per month.
6. Revenue arithmetic: MRR = monthly*price + annual*price/12; ARR = MRR*12; 90-day net = monthly stream (1+r+r^2)*price*(1-refund) + annual*price*(1-refund). Show a doubled-annual scenario and its uplift in absolute and percent terms. Verify with an independent script; report PASS.
7. Keep under 700 words; sections Diagnosis, Offer decisions, Revised pricing, Events, Revenue impact. Save as monetisation-review.md plus verify_review.py in the working directory.
