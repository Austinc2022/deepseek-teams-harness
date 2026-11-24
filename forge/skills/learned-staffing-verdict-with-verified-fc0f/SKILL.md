---
name: learned-staffing-verdict-with-verified-fc0f
description: When asked for a hiring/retirement/overlap verdict for a department, or when folding independent reviews into a staffing recommendation.
---

1. Separate infrastructure from capability FIRST. Check ticket failure signatures (e.g. all "ended without a report: API 502" = zero capability signal), run caps, and sandbox blocks. Never score, retrain or retire anyone on infra-contaminated evidence; say so explicitly.
2. Verify every load-bearing claim at source before recommending action: read the primary file (e.g. company.json "hires", ticket last-lines), and knowledge_get each cited fact id — a citation that does not resolve is a capability defect in the citing unit, not evidence.
3. Apply the hard rule literally: recommend a hire only for a gap that blocks a named initiative today; recommend retiring only agents that add nothing (zero output footprint, or output fully duplicated by others). "Idle" is not "useless" when runs are failing.
4. Require two independent sources before a retirement recommendation (e.g. two different reviewers converging, or one reviewer plus your own primary-source check). One reviewer's scorecard is a lead, not a verdict.
5. Distinguish fixable from terminal: fabricated/unverifiable "measured" claims and truncation are trainable (instructions remedy: measured = file path or command run this cycle; knowledge_get before citing; outline-first for long answers) — probation, not retirement. Retire on the FIRST repeat after the remedy lands.
6. Grade the reviews you receive (rate_work) and report capability gaps with report_gap so remedies attach to the next task.
7. Deliver verdicts in the mandated channel (report_to_coo) when possible; when blocked (e.g. no initiative id), send the interim memo through ask_agent and say plainly why the formal route is blocked.
8. Record the verdict in memory + knowledge with strength labels and sample sizes, and keep the plan's ids stable (plan_items/update_plan) so the owner can follow the decision trail.
