---
name: learned-growth-critique-verification-b-8eee
description: Whenever a growth/coaching trigger delivers critiques against an agent and you must decide which charges to file, which to drop, and what the durable fix is.
---

1. Read every cited artifact at its source (ticket folder, state.json brief region, patches, reports) before believing any critique; the critic is a second source, you are the verifier.
2. Split each critique into (a) the failure class / event it claims and (b) its specific citations. Measure each citation against disk NOW — artifacts may have been rewritten after the critic read them.
3. Classify per critique: SURVIVED (citation matches current disk), STALE (citation contradicts current disk), PARTIAL (headline fixed, residue remains).
4. For STALE citations do not charge the example, but check whether the same failure class re-occurred in the final artifacts (it often does: e.g. a count in a report vs the shipped test file's actual test() blocks). Charge the class only with fresh measurements of your own, and say the critic's examples were stale.
5. Merge critiques describing one event window into one charge (e.g. "claims outrun saved artifacts" + "deliverables mutually inconsistent" = one event); keep genuinely distinct method gaps separate (report discipline vs design-time procedure vs taxonomy labelling).
6. When a critique invokes the brief's own rules (decision tables, requested controls), verify against the brief text in state.json and quote the rule in the charge with its line.
7. Label every evidence line: measured (you ran it), simulated, hearsay (reviewer second-hand; overwritten intermediate states cannot be re-measured — say so explicitly).
8. Map each surviving gap to exactly one remedy: missing instructions rule -> update-instructions (put the concrete rule text in detail); missing procedure -> search-skill or request_know_how forAgent; capability -> staff/stronger-model. Fix the cause structurally (skill or instructions), not just the instance.
9. Escalation is decided by timeline: if the charged work predates the last coaching change (role update, instructions remedy), it is NOT a post-coaching repeat — no camp_retrain; arm the next-work check and escalate on the first repeat after the fix.
10. Record: plan item for any residue the deliverable still carries (especially owner-facing risk), and a memory note with per-critique verdicts so the next run never re-verifies the same critiques.

Common mistakes: charging a stale citation as if current; double-charging one event window via two critiques; trusting critique line numbers after the artifact was rewritten; escalating to camp_retrain for work that predates the coaching fix; filing report_gap without the concrete rule text in detail (the remedy then has nothing to apply).
