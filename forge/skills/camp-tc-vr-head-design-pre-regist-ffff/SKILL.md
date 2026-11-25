---
name: camp-tc-vr-head-design-pre-regist-ffff
description: When planning which risky features of a VR/WebXR game get limited proof-of-concept demo slots, and you must set pass/fail criteria before any building.
---

1. Reject any prior evidence whose criteria were written after the test — post-registered criteria are unfalsifiable and cannot de-risk a claim. Re-state which claim was actually measured (e.g. comprehensibility of a verb ≠ precision of its timing window).
2. Never accept a 1-5 "was it fun?" average as fun evidence: demand characteristics, acquiescence bias, no comparator, no pre-set threshold. Replace with behavioural proxies (voluntary replay within 30 s of being told they may stop, unprompted optional-challenge attempts, premature quit rate) with numeric thresholds fixed in advance.
3. Allocate each demo slot by one principle: fund a demo only where the failure mode is invisible without purpose-built instrumentation or an uncontaminated protocol (e.g. comfort needs its own 12-min session; latency needs loopback). Features whose failure is directly observable can be checked inside another funded demo with its own numeric check.
4. For every demo pre-register four numbers before building: frame rate (median fps, p95 frame time, % dropped frames, measured via XRFrame/rAF deltas), comfort (FMS 0-20 q2min + SSQ, median/threshold/abort rule at FMS>=10), clarity (observable read-back or discrimination task with per-participant pass counts), fun (behavioural proxy, never a rating).
5. Write a decision rule that a comfort failure overrides any fun/clarity/fps pass, and that changing a threshold after the first builder turn voids the run.
6. End with explicit "no" decisions and the exact evidence that would reopen each. Common mistake: letting a team mark a risk "done" from an anecdotal run and spending all slots on the remaining risks — the unvalidated core verb is usually the highest-leverage re-test.
