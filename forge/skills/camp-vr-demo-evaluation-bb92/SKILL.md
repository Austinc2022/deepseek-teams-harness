---
name: camp-vr-demo-evaluation-bb92
description: Use when evaluating a VR demo against preset criteria: produce per-demo pass/fail verdicts with evidence, a fun assessment, comfort and performance findings, prioritized changes, and questions for real playtesters.
---

# VR Demo Evaluation

Use this for every demo in a playtest batch. Deliverable: `demo-evaluation.md`, one section per demo.

## Procedure

1. **Load the preset criteria verbatim.** Read the criteria source; list each criterion as given and distinguish hard gates from preferences. Do not invent or silently reword criteria. Record demo name, build ID, headset/device, settings, and test date.
2. **Run the demo and collect evidence.** Use the existing QA checklist and webapp-testing skills for basic function. For each criterion capture: scene/state, timestamp or reproducible steps, what was observed, and a screenshot/log path. If a criterion cannot be exercised, mark `Not tested` with the reason — never a pass.
3. **Verdict per criterion.** Table of `criterion | pass/fail/N-A | evidence`. A pass requires observed evidence, not assumption. For subjective criteria, separate observed player behavior/quotes from the verdict.
4. **Fun assessment.** Keep separate from the verdict table. Identify the moment-to-moment loop, specific engaging and flat moments, and reasons someone would or would not replay. Cite concrete moments, not adjectives.
5. **Comfort findings.** Cover locomotion, vection/acceleration/camera-shake sickness triggers, comfort options (teleport, snap turn, seated mode), and session length. Note severity and who is affected.
6. **Performance findings.** Frame rate and stability, input-to-photon latency, tracking loss, loading, thermals. Include numbers and the conditions they were measured under.
7. **Changes needed.** Prioritized list; each item links to a failing criterion or a finding, states the expected effect, and names an owner if known.
8. **Player test questions.** Open-ended, non-leading prompts for real players covering fun, comfort, and confusion, plus the behavior to observe alongside each answer.

## Verify before handoff

- [ ] Every preset criterion has pass/fail (or N/A with reason) plus evidence.
- [ ] No pass rests on an untested assumption; failures have reproducible steps.
- [ ] Fun, comfort, and performance include specific observations and numbers where applicable.
- [ ] Each needed change is prioritized and linked to a criterion or finding.
- [ ] Player questions are open-ended and cover fun, comfort, and confusion.
- [ ] Evidence paths resolve; build ID, device/headset, and test date are recorded.
