---
name: camp-tc-producer-cross-fixture-cl-db56
description: When integrating multiple specialists' handoffs against demo/test evidence and must grade each claim verified, conditional, or unsupported.
---

1. Build a claim-by-claim matrix: every claim in the handoff fixture, then search the other fixtures for corroboration or contradiction. A "done" label is never evidence; only a second source is.
2. Status rule: verified = second fixture supports the load-bearing claim; conditional = supported only partly or in a limited setting (e.g. desktop-only); unsupported = no second source — write "not enough evidence". A row may carry two statuses when its claim clusters differ (e.g. verified fps figures / not enough evidence test logs).
3. Conflicts: name both disagreeing artifacts explicitly (spec version vs code version, README number vs observed measurement, stated target vs measured result) and give the concrete numeric disagreement. A silent violation of a stated target is also a conflict. Include extra finds after the required ones.
4. Missing items: owner + the exact artifact or test that would close it (test names verbatim from fixtures, never invented), plus the evidence note.
5. Order the plan risk-first: hygiene/licensing and evidence artifacts, then spec freeze and budgets, then integration, then validation. Gate IDs (G1..Gn) unique; every go/no-go blocker must cite the gate where it closes, and that gate must enforce the decision's threshold.
6. Numbers: recompute each derived figure (fps from ms/frame, ratios, percentages) and cite external thresholds only after fetching them. Mark producer-set judgment bars as such.
7. Self-consistency pass before handover: gate refs resolve, labels match the evidence rule, required verbatim phrases present, file identical to any copy pasted in the reply.
Common mistakes: copying handoff "done" as fact; citing a gate range that leaves a named blocker open; inventing test names; quoting external thresholds you did not fetch.
