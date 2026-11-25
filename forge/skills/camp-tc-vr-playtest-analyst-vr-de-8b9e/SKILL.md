---
name: camp-tc-vr-playtest-analyst-vr-de-8b9e
description: When judging builder-submitted VR demo evidence against a plan's pass/fail gates and you cannot run the demos.
---

1. Transcribe each gate's exact conjuncts (metric, threshold, population, environment) before looking at evidence; never let the builders' labels ("pass", "fun 4.6/5") substitute for the plan's definition.
2. For every claim, check attribution: is the metric reported per demo and per criterion population, or pooled? Pooled numbers cannot pass a per-demo gate - mark "not enough evidence" for the unattributed side.
3. Check contamination: crashes counted as voluntary restarts, idle time inflating session length, prior exposure (Slack intros) invalidating "first-time/unaided" tests. Contaminated metrics never pass; if the uncontaminated bound still clears the threshold you may pass, else fail or not-enough-evidence.
4. Check environment match: desktop fps does not satisfy a standalone-Quest gate; worst-case scene (max concurrent entities) is the criterion, not the comfortable case.
5. Check units/readability geometrically: point size at a distance (14 pt at 2 m is sub-legible) vs the plan's minimum reading distance; interactable distance is not UI distance.
6. Internal surveys are not telemetry; marketing slides are not segment evidence. Absence of a required sub-evidence means the gate is unmet (fail or not-enough-evidence, say which and why).
7. Verdict table: gates as rows, demos as columns, each cell pass/fail/NEI with a one-line citation (number, log line, or code note). Fun gets its own explicit verdict plus a plain statement of what the evidence cannot prove about real players or willingness to pay.
8. End with keep/change/cut per feature, pre-playtest must-fix list, and the questions only real players can answer. State plainly when the builders' summary contradicts the table.
