---
name: learned-vr-strategy-lens-review-proced-e616
description: When running the goals-and-strategy advisory review for the VR studio (or any charter-driven agent company): auditing the goal ladder, leader plan coherence, and timeline realism.
---

1. Read CONTEXT.md fully. Extract the goal ladder: charter mission, north star, gate bar, KPIs (goalPercent, gatePassed30d, delivered7d, killed30d, activeInitiatives, spend7dUsd vs budget). Check the rungs are arithmetically consistent (e.g. 1 RC/day over N days vs actual RCs delivered; goalPercent vs measured output). An unanchored goalPercent is a finding.

2. Audit every leader plan for the same milestone: record each one's deadline and probability. Disagreement on the same outcome (e.g. 5% vs 25% by different leaders) means no single owner and no shared forecast. Check each outcome statement against that leader's own evidence facts in the knowledge store: a plan promising X while its own forecast says not-X is a charter honest-odds violation at the plan level (reports may be honest while plans are not).

3. Check the ticket list for duplication on the critical path: the same deliverable opened by different owners, retry pairs left open together. Check whether the COO can stop or message the other owner's tickets (ask_agent failures are a governance gap). Duplicate open tickets inflate openTickets and burn scarce model quota.

4. Held-decision audit: compare the decisions log against ownerQuestionsOpen and the charter's ask rules. A held owner-only question (spend, access) while the question queue is empty and the blocked work is the critical path is a top-priority finding: it is a prioritization failure, not a capability one. Also check decided-but-not-actioned owner decisions (allowlists etc.): they need a verify-it-took-effect loop, and plans may keep quoting a stale blocker claim after a workaround exists (check disk/ticket evidence for render recipes or caches that route around it).

5. Resource check: spend7dUsd vs weekly budget and runFailures6h. Starving on a failing free tier while most of the authorized budget sits unspent is a strategy misallocation worth naming with numbers.

6. Judge prior reviews: read earlier reviews' findings.json under forge/company/advisory/reviews. For every earlier recommendation that was accepted or done in your lens, verdict it (helped / no-change / worse / too-early / not-done) from current numbers. Label every claim measured, simulated or argued with sample sizes. Keep problems to 6, recommendations to 4, each recommendation concrete: what to change, who does it, how to know it worked.
