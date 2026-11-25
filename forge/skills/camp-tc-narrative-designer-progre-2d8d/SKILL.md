---
name: camp-tc-narrative-designer-progre-2d8d
description: Designing player progression/unlocks/difficulty/retention for a game product when given a build-gate brief with demo data and a contractor draft to review.
---

1. Extract every number from the brief and quote it exactly (e.g. "11/14, median 8m10s"); each progression claim must be traceable to one of these numbers or be labeled an assumption.
2. Tier the evidence in writing before designing: OBSERVED (what testers did), STATED INTENT (what they said — never convert to a rate or forecast), ASSUMPTION (your design choices). Never mix tiers in one sentence.
3. Review the draft critically, not adoptively: list each inherited claim and either keep it with a brief-number justification or reject it with the contradiction named (e.g. "five models per 15-20 min session contradicts 8-12 min/model").
4. Build the difficulty curve as discrete steps with explicit deltas per step (fold count, ambiguity type, hint availability, posture demands) — never qualitative adjectives like "gentle then harder". Mark unmeasured ranges as design targets.
5. Tie every unlock (models, tools, journal entries) to a concrete player goal that triggers it; put proven-good affordances (e.g. an overlay 12/14 rated helpful) in from the first minute rather than gating them behind goals.
6. For each retention hypothesis write five parts: player-words return reason, the hypothesis, the metric (numerator, denominator, observation window), a target threshold labeled as a target not a forecast, and a falsifying result that names the pivot.
7. Audit instrumentation: for each metric state whether current telemetry can compute it; if not, name the exact missing events (app-open with anonymous device ID + timestamps, per-crease checkpoints, etc.).
8. Call out sample-size limits explicitly (n=14, one lab day = one tester is 7 percentage points; no subgroup claims). End with a rejected-inherited-claims list so reviewers can check the critique.
