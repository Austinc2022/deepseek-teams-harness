---
name: learned-kit-smoke-stats-and-write-time-a5a8
description: When a kit/game smoke harness writes evidence JSON and the numbers must be trustworthy (perf stats, timestamps) or a gate depends on them.
---

1. Perf numbers must be numeric-or-FAIL: publish one read-only hook object from the app (e.g. window.__kitStats = {drawCalls, triangles}) copied from renderer.info.render once per frame after render, guarded for mock renderers (renderer.info may be absent) and never written by game logic.
2. The smoke records MAXIMA of the hook sampled across the captured frames (a single end-of-run read can miss spikes), counts the samples, and the PASS condition includes Number.isFinite on every recorded number — null must make the run FAIL, never PASS with null (a game's <=100 draw calls / <=100k triangles bound cannot be checked against null).
3. Stamp freshness fields (generatedAt and friends) immediately before the evidence write, never at run start: evidence headers (runId/startIso/srcHash) are created inside writeEvidence, so a run-start stamp lands BEFORE header.startIso (v1.1 defect: 22 s early) while a write-time stamp satisfies generatedAt >= header.startIso.
4. Prove both with failing controls: the same smoke run with the hook removed must report FAIL with nulls (quote it), and a static code-order test pins the stamp line directly before writeEvidence so the old line fails the test.
5. Restore the edited files after each control and only then take the final measurement: any src edit voids earlier evidence (evidence must postdate newest src mtime).
