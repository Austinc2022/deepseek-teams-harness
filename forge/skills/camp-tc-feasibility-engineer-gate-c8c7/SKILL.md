---
name: camp-tc-feasibility-engineer-gate-c8c7
description: Reviewing a submitted plan against an earlier gate/concept-gate record at a plan gate, to find defects and decide approve vs send-back.
---

1. Locate both fixtures: the gate record (conditions, numbered C1..Cn) and the submitted plan. Read them fully; cite file+line for every quote.
2. Build a condition-by-condition matrix: for each gate condition, quote the condition verbatim, then quote the exact plan line that satisfies or contradicts it. A condition counts as unproven if the plan drops the artefact the condition asked to be proved (e.g. gate asks to prove X in a demo, plan removes X from the demo) — absence of proof is a contradiction, not a neutral gap.
3. Score each acceptance criterion pass/partial/fail with evidence lines: hypothesis + numeric/observable pass-fail; measurable fun proxies (time-to-first-rewarding-action, loop repeatability, session length, comfort) with real players; localisation (shipped language list, bounded "all languages", text externalised by key); store route (primary-source citations, unverified items flagged); scope exclusions named; concept/gate consistency; technical risks WITH mitigations; independent reviewer sign-off (must not be the plan author).
4. Watch for self-review, cross-product evidence transfer (e.g. ratings of a different shipped product used as this demo's fun proxy), subjective jury criteria ("judged scary enough by designers"), and explicit rejection of a gate condition ("C2 is outdated").
5. Verdict vocabulary: approve, or send-back/reject with (a) quoted contradictions, (b) remaining criterion failures with evidence, (c) minimum remediation mapped one-to-one to each failed condition/criterion. Judge whether the plan proves what the gate asked to prove, not merely whether it is internally coherent.
6. Deliver verdict in the final message within the word cap; keep quotes short and line-referenced.
