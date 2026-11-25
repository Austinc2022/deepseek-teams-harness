---
name: learned-starter-kit-craft-guard-audit-1bae
description: When critiquing a VR starter kit or template whose deliverable is guards/tests rather than a game — first-time-player lens plus evidence integrity.
---

1. Read the report (CHANGES.md/NOTES.md) LAST; first read the code the guards instrument (src/, tools/, evidence/, screenshots/). Do not trust quoted numbers.
2. Report-vs-evidence: extract every quoted timestamp/number from the report and diff against the JSON on disk (evidence/smoke.json, look.json, gate-lite.json). A later re-run silently invalidates quotes; this is the most common failure (kits even ship a guard for it and then violate it themselves).
3. First-run commands: execute every command in README's quickstart mentally against the code (flags, arg order). Stale docs fail the developer's first minute.
4. Measurement geometry: for any screen-space box/ROI check, verify what object-space region is projected. Box3.setFromObject is a WORLD AABB — larger than the silhouette under rotation; project local bbox corners through matrixWorld instead. Check whether capture and measurement happen at the same instant (loops between them change camera/pose; parity of alternating inputs is a lottery).
5. Dead UI paths: every visible button/affordance must have an input path on every platform (desktop click vs XR ray vs key). Grep for the handler; comments claiming 'click' are not proof. Check where pause/stop cards are placed (world-locked vs camera-anchored) and whether they can be off-view or one-sided (FrontSide).
6. Guard coverage scope: what moment does the automated run sample? Idle + one synthetic action misses gameplay-spawned objects (trails, effects); note the gap instead of assuming coverage.
7. Open the actual PNGs. hero-self-check items (in-play, thumbnail hook, value contrast, HUD legible) are judged by eye in seconds; flags-and-luma numbers do not settle them.
8. Verdict structure: mustFix = defects in shipped code/docs/evidence; wouldElevate = design completions; capabilityGaps = the process/knowledge/tool shortfall that let the defect happen (e.g. no final doc-vs-disk cross-check; three.js projection knowledge; missing failing control for documented behavior).
