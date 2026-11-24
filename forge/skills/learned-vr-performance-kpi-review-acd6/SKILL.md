---
name: learned-vr-performance-kpi-review-acd6
description: Every time the vr-advisor-performance run reviews the studio through the performance/KPI lens.
---

1. Read CONTEXT.md fully: KPI block, unit scores, health, tickets, gate results, decisions, spend-by-day.
2. Build an intraday/daily trend: diff the KPI snapshots embedded in advisory/state.json (each past review stores a `kpis` object with `at`) against the current KPI block. Rising failed7d + falling deliveryRate7d within hours is stronger evidence than a single snapshot.
3. Compute cost efficiency from raw numbers: total spend = sum of spend-by-day; cost per delivered ticket = spend7dUsd / delivered7d; state cost per gate pass / per release candidate as undefined when the denominator is 0 — that is the headline, not a footnote.
4. Anchor to the north star: compare output (release candidates, gatePassed30d, gate results list) to the charter cadence (1 RC/day). Flag any headline KPI (companyScore, goalPercent) that reads high while north-star output is zero — label argued.
5. Check unit scores for the critical path: which units must deliver the goal (builders, engineering)? Are they the lowest and falling? Note score-composition anomalies (units with no delivery obligations scoring high via plan-health/capability-gap rows).
6. Cross-check failure causes in Health + owner feed (turn caps, budget caps, API 502/429, aborted processes) and match them to tickets; distinguish infra failures from capability failures.
7. Verify duplicated/retried tickets and initiative churn (killed vs active) as rework evidence.
8. Recommendations: at most 4, each mapped to one KPI from the fixed list, with owner, action, and a measurable success check. Never recommend what the owner has forbidden (e.g. cutting a training camp the owner ordered at full depth) — recommend pacing/sequencing instead.
9. Label every problem claim measured / simulated / argued; give the number or file. followUps is empty when prior reviews failed with no recommendations — always check advisory/state.json for prior review status before assuming.
10. Record 1-2 durable measured facts in the knowledge store (trend deltas, cost ratios) before finishing.
