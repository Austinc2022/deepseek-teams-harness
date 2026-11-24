---
name: learned-vr-governance-risk-review-proc-dcee
description: When reviewing the VR studio through the governance-and-risk lens (charter compliance, budget discipline, owner-only matters, decision follow-through, safety limits).
---

1. Read CONTEXT.md fully; extract charter rules, budget line, KPI block, decisions block, health block, ticket list.
2. Build a charter-compliance checklist from the rules: honest odds, originality/licensing, gate-before-RC, VR comfort/performance, analysts read-only, owner-only matters (spend, public, legal, access, charter), "decide do not ask" (one question at a time, open risks in GAME.md not questions), spend discipline.
3. Trace owner-only decisions in company.json (grep "status": "(held|answered|auto)" and "seenByCeo"): for each answered decision, check whether it was EXECUTED (re-test or find evidence the change took effect). Decided-but-unapplied items are the top finding — a decision with no executor and no verification step is a broken control loop.
4. Check the owner-question queue: count open/held decisions vs the ownerQuestionsOpen KPI and the owner feed timestamps. A "held" spend/access question while the owner is active and the company is blocked is a governance failure, not patience. Watch for long ask-to-answer latency (measure in days).
5. Budget discipline both ways: not only overspend vs the daily cap but underspend vs the charter's "spend where it raises the odds" mandate when the binding constraint is unfunded (sum the spend-by-day series; compare to dailyUsd x days).
6. Resolve evidence disputes between departments with one direct measurement (Glob/Read) before repeating either claim; check facts marked STALE/DISPUTED and flag what you disprove via knowledge_flag with the exact evidence.
7. Check run/health governance: runFailures6h, showstoppers, turn/budget caps hit, repair quota usage and whether refused repairs consumed quota; whether mitigations are filed or starved.
8. Ticket hygiene: duplicate open tickets for the same work, cross-hierarchy messaging failures (ask_agent 'unknown agent'), one-owner-per-ticket.
9. Verify prior advice follow-through (followUps) from numbers, not reports. Label every claim measured/simulated/argued with sample sizes. Recommendations: what to change, who does it, how to know it worked, and the KPI it moves. Record durable facts via knowledge_add before finishing.
