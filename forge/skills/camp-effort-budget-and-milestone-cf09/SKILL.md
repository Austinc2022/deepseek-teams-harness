---
name: camp-effort-budget-and-milestone-cf09
description: When writing the budget-of-effort and milestones section of a build decision, programme plan or gate report.
---

# Effort budget and milestones from a feature list

Turn a keep-list into a costed, checkable build plan. Estimates must be honest about what is a guess.

## Steps

1. **Break each kept feature into build units** (roughly one ticket each: implement, art/audio assets, wire-up, verification). A feature that needs more than ~4 units is probably two features.
2. **Estimate each unit in agent-days**. Prefer measured costs from past camp tickets for similar work; where none exist, estimate and mark it **guess**. Never present a guess as measured.
3. **Add two explicit buffers**: integration/wiring (15-20% of implementation units) and verification/QA (10-15%). Show them as their own line items so the owner can challenge them.
4. **Total the budget** and state it both in agent-days and in whatever currency of effort the camp reports (tickets, runs, wall-clock days at stated parallelism).
5. **Set milestones as evidence gates, not dates**: each milestone names a demoable outcome and the check that proves it ("playable loop demo passes the fun rubric", "all must-have demos green in headless smoke"). Order milestones so the riskiest fun assumption is proven first.
6. **Verify before handing over**: unit estimates sum to the stated total; every milestone has a verifiable exit check; every guess is labelled; no milestone depends on a cut feature.

## Common mistakes
- Padding the estimate silently instead of showing a buffer line.
- Milestones like "feature X done" with no check that produces evidence.
- Estimating only implementation and forgetting integration and verification.
- Scheduling the safest features first and leaving the fun-critical risk to the end.
