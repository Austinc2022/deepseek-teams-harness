---
name: camp-tc-vr-head-design-vr-demo-ga-273c
description: Any time a prior sprint claims a VR risk is 'done' based on post-hoc criteria or a 1-5 fun rating, and demo slots are scarce.
---

When scoping proof-of-gameplay demos for a seated WebXR title (Quest-class), before any builder turn:

1. Demand pre-registered criteria. If a prior test wrote pass/fail after seeing results, or asked "was it fun? 1-5", treat the risk as OPEN, not done. A Likert average from friends-of-team is not evidence; require a behavioural proxy (replay rate, voluntary session extension, spontaneous explanation to a peer, choice of this demo over an alternative).
2. Spend demo slots on the risk that can kill the game cheapest. If one risk is "the core verb is fun" and another is "comfort over full session length", fund both only if budget allows; otherwise fund the one whose failure forces redesign (comfort and core-verb causal feel usually do; visual polish and fallback input usually don't).
3. Fixed numbers per demo, chosen before building: frame rate (Quest 3 target 72 fps minimum, state the measurement: in-headset counter over N minutes, p95 frame time ≤ 13.9 ms), comfort (SSQ or FSS, threshold stated, e.g. total SSQ ≤ 20 and no individual nausea item > 2), clarity (observable: X of Y first-time users perform the action unaided within Z seconds), fun (behavioural, e.g. ≥50% choose to replay unprompted; median voluntary session ≥ N min when told they may stop anytime).
4. Comfort protocol: seated, fixed session length matching the risk (e.g. 12 min), participants include at least some VR-naive users and some prone-to-sickness self-reports, not only teammates. Abort rule stated in advance (any participant may stop for any reason; facilitator stops on vomiting, disorientation, or request). A comfort fail overrides a fun pass — the demo is a fail regardless.
5. Audio/causal feel: test with a blind identification task (e.g. play N clips where half have +X ms artificial latency; participant must sort them; threshold = ≥80% correct identification at the chosen ceiling), not "did the audio feel responsive?".
6. Desktop fallback (mouse+keys) rarely needs its own demo slot: check it inside any demo that already runs on desktop, with a short unaided-completion test. State this to save a slot.
7. Write the evaluation sheet BEFORE the build: columns hypothesis / metric / threshold / result / decision, plus the override rule (comfort fail overrides fun pass) and an explicit "what evidence would reopen a killed risk" line per excluded candidate.
