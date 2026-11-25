---
name: camp-audit-vr-demo-evaluation-f948
description: When you must independently audit a completed demo-evaluation.md (per-demo pass/fail verdicts, fun assessment, comfort/performance findings, changes needed, player-test questions) before it is accepted.
---

# Auditing a VR demo evaluation

You are auditing the *evaluation document*, not re-playing the game. Your output is a verdict on whether each claim in demo-evaluation.md is supported.

## Steps

1. **Build the coverage matrix.** List every demo and every criterion the evaluation was required to judge. Mark each as present/absent. A missing demo or missing criterion is a blocking finding.
2. **Evidence status per verdict.** For every pass/fail, classify:
   - *supported*: cites a concrete artifact — a run log line, a measured number (frame time, FPS, latency, load time), a screenshot, or a specific observed behavior.
   - *partly supported*: evidence exists but does not cover the whole claim.
   - *unsupported*: assertion only ("runs fine", "felt good", "no issues").
   Quote the exact sentence for anything below *supported*.
3. **Fun assessment.** It must describe observed mechanics — feedback timing, responsiveness, challenge curve, readability, juice — not generic praise. If it lacks specific observations, mark unsupported. Use the game-feel vocabulary to test whether the assessment actually describes feel.
4. **Comfort and performance findings.** Comfort claims (locomotion, vignette, artificial acceleration, snap-turn options) and performance claims must carry measurements or named observed settings. "Smooth" is not a measurement.
5. **Changes-needed list.** Every change must trace to a finding; every finding must appear in the changes list. Report orphan changes (no source finding) and dropped findings.
6. **Player-test questions.** Each must be answerable by a real player in one session (observable behavior or stated preference), specific to this demo, and not answerable by the build itself. Flag yes/no marketing questions.
7. **Write the audit** per demo: coverage, verdict evidence status, and ranked findings (blocking / major / minor) each with a quote from the deliverable.

## Before handover — verify
- [ ] Every demo and every named section (verdicts, fun, comfort, performance, changes, player questions) is covered.
- [ ] Every finding carries an exact quote and a severity.
- [ ] Counts in your summary match the body (totals of supported/partly/unsupported).
- [ ] You audited the document; you did not substitute your own playthrough for its evidence.

## Mistakes to avoid
- Accepting the author's cited evidence without checking it exists and supports the claim.
- Judging the game instead of the evaluation document.
- Writing findings with no quotes (they cannot be acted on).
