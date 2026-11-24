---
name: learned-org-review-separating-capabili-44f9
description: Any organisational/staffing review where some failures may be caused by shared infrastructure (API quotas, sandbox limits) rather than the agents themselves.
---

1. Pull the hard state first: advisory CONTEXT.md (KPIs, unit scores, ticket list, plans), super-agent/state.json (reporting lines, reports scope), company.json (hires/decisions). Do not rely on memory facts alone; several are imported/STALE.
2. Classify every failure with its terminal cause before blaming a role: read the failure text in the owner feed/ticket record. "API Error 502 / worker ended without a report" = infrastructure. "hit 120 turns / empty folder at the time limit / output truncated mid-section / fabricated a citation" = capability. A ticket that never started is not a capability failure either.
3. Score capability findings with an external measurement where one exists (work-judge scores, unit scores, gate scores vs predictions) and give the run/ticket id. Label measured / argued / simulated. Imported CEO notes are argued, even when detailed.
4. Overlap: look for duplicate tickets in the open list (same brief, "retry" twins), two leaders opening the same work (CEO vs COO), and the same task commissioned twice (advisor + judge asked the same question). Each duplicate is quantifiable waste (open tickets, turns spent).
5. Retirement test: an agent adds nothing if it has zero deliverables in the whole window AND its incidental use (e.g. art-read votes) is duplicated by agents who stay. Check hires/orders arrays and transcript_search for the agent name before concluding.
6. Capability gap vs blocker: a gap blocks an initiative only if fixing it would unblock work that is otherwise ready. If all live initiatives are blocked upstream by infra, say so plainly instead of inventing hires.
7. Data-hygiene sweep ("anything else like that"): re-verify previously reported anomalies (counts change), check reporting links (can the COO address the CEO?), ticket status hygiene (failed-but-open, duplicate retries), and whether advisory recs were ever accepted (recs array) before grading their effect.
8. Never grade a recommendation that was never accepted; say "nothing to grade" and show what follow-through exists and its numbers since.
