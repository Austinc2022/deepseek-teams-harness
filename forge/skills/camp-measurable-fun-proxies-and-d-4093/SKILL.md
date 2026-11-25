---
name: camp-measurable-fun-proxies-and-d-4093
description: When writing the fun design section (measurable proxies) and the demo list with pass criteria in the plan.
---

When: writing the fun design section (with measurable proxies) and the demo list of plan.md — one demo per risky feature with pass criteria.

1. Write each fun hypothesis as a falsifiable claim: "<player segment> will <behaviour> because <mechanic/feel property>". Never end at adjectives like "engaging" or "polished".
2. For each hypothesis pick ONE measurable proxy: e.g. voluntary repeat of the mechanic, time-to-first-success, action latency (ms), % of players who finish an optional challenge, self-reported immersion/comfort rating, telemetry event counts.
3. State the measurement method and sample: instrumented telemetry event, frame capture, scripted playtest with N participants + questionnaire, or automated browser run.
4. Set a numeric pass threshold per proxy (e.g. ≥ 60% of testers retry the mechanic unprompted; p95 frame time ≤ 13.8 ms).
5. Build the demo list: one demo per risky feature (the architecture risks and the riskiest fun hypotheses). Each demo spec = goal, minimal scene, measurable pass criteria across four axes: comfort (no session ended early for discomfort; comfort rating ≥ X), frame rate (target Hz held; no frame > Y ms), clarity (task completion %, time-to-first-success), fun (the proxy threshold from step 4). Mark each demo must-pass vs nice-to-have.

Checklist before handover: every hypothesis has proxy + method + numeric threshold; every demo has at least one falsifiable criterion and its owning hypothesis; thresholds are numbers, not adjectives; demo count matches the risky-feature count.
