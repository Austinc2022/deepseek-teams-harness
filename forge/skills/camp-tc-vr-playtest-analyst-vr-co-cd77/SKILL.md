---
name: camp-tc-vr-playtest-analyst-vr-co-cd77
description: When judging comfort (C) and performance (P) gate criteria for a WebXR demo submission.
---

# Comfort & performance cross-check for seated WebXR demos

1. Comfort: extract every numeric limit from the plan (snap-turn degrees, bob amplitude, reach cm, scale ratio, default modes) and compare one-by-one to the builder's stated config. Any single violation fails the comfort criterion.
2. Specifically check DEFAULTS: "seated by default", "no smooth locomotion", "snap <= 30 deg". A feature that exists but is off/on by default wrong is a fail, not a pass with notes.
3. Reach: compare "furthest grab" to the plan's seated-shoulder limit. Overreach in a lunch-break desk setting risks real-world collisions — flag as a stop-risk.
4. Camera bob + smooth locomotion are the top sim-sickness triggers; if both are present, name them as the likely player-stop risks.
5. Performance: for each fps number record (device, scene, settings). Discard desktop numbers when the plan requires standalone headset. Judge only the busiest scene (most entities active), never the menu. If the busiest-scene fps is below threshold, the criterion fails regardless of menu/desktop numbers.
6. If evidence lacks logs/captures and the builder's own numbers already miss the threshold, fail outright; don't soften to "needs more data".
