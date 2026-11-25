---
name: camp-tc-feasibility-engineer-webx-2393
description: When reviewing a WebXR/three.js VR demo plan for technical feasibility sign-off, especially its performance and comfort claims.
---

# WebXR demo plan feasibility review

1. **Separate claims from measurements.** Quote each performance/comfort claim verbatim. A desktop benchmark, an "easily", or "assumed OK" is a claim; only a number recorded on the target headset is evidence.
2. **Check the target-hardware budget first.** Compare the plan's triangle/draw-call numbers against Meta's published Quest budgets (Quest 3: <1M tris/frame, 50–150 draw calls; Quest 2: <750K). If the plan's own numbers exceed the budget, the desktop benchmark cannot rescue it. Note stereo rendering (~2× fragment work vs a single desktop view) and WebXR browser overhead.
3. **Demand a frame-time distribution, not a peak FPS.** Required evidence: p50/p95/p99 frame time and % frames over the 11.1 ms (90 Hz) budget from the actual WebXR build on the headset, plus GPU/CPU headroom. Peak "120 FPS" averages hide the drops that break VR comfort. Reprojection (ATW/ASW) can mask drops, so "feels smooth" is never evidence.
4. **Cross-check gate conditions.** Read any gate/context file; confirm the plan meets every gate condition (e.g., N external players, measured frame-time on target headset before funding). A plan that says "no profiling planned" against a gate requiring profiling is an automatic send-back.
5. **Comfort: name the metric.** Vignette/snap-turn/seated options align with Meta's locomotion-comfort guidance and get credit, but need a measurable proxy (SSQ or discomfort scale, completion rate, session length) tested on external players — internal devs × minutes is not evidence. "Motion sickness is normal for VR" is a red flag, not a mitigation.
6. **Fun needs operationalised proxies.** Time to first rewarding action, loop repeatability (loops per session), designed session length, and an explicit statement that real players confirm the hypothesis. "Testers enjoy it" with no instrument = fail.
7. **Localisation mechanics matter.** Strings must be externalised (JSON string table); text baked into sprite textures/canvas images is not localisable — flag it. "All languages later" must be bounded and v1 languages named.
8. **Store route needs cited sources.** For Quest: VRC guidelines (publish-quest-req), IARC ratings + mandatory age-group self-certification, WebXR shipping via PWA packaging; SideQuest is sideloading, not the store. Per-region items must be listed or explicitly flagged unverified. Anything uncited is unverified.
9. **Scope consistency + sign-off.** MVP exclusions stated; scope matches the concept-gate decision (or delta justified); risks have mitigations; a named independent technical reviewer signs only after 1–8 evidence exists. Confident tone is never a substitute.

Output: verdict + score, findings (claim → why it is/isn't evidence → required evidence), then the minimum change set for sign-off. Keep the verdict under 1,500 words.
