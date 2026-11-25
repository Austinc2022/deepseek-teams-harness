---
name: learned-kit-stats-hook-and-write-time-f34b
description: When adding (or re-verifying/judging) a perf/stat hook plus evidence file on a WebXR tree (kit or game) — window hook, smoke maxima sampling, generatedAt stamps — or any edit that must ship with a failing-control proof.
---

1. Hook: one plain read-only object on window (e.g. window.__kitStats = {drawCalls,triangles}), copied from renderer.info.render once per frame AFTER render, guarded for mock renderers (renderer.info may be absent); game logic never writes it.
2. Smoke samples the hook once per input step, keeps numeric MAXIMA + samples counter, accepts only Number.isFinite values; PASS rule includes statsOk so missing/non-numeric stats make status FAIL with null fields, never PASS with null.
3. generatedAt: no stamp in the run-start initializer; stamp on its own line immediately before writeEvidence(); pin order statically (stamp line exactly one line before the write).
4. Assert the GAP not the direction: header() stamps startIso inside writeEvidence AFTER the writer's stamp, so a correct write-time stamp yields generatedAt <= startIso (often equal at ms). Control: 0 <= startIso - generatedAt <= 5 s. Never assert generatedAt >= startIso (passes only on same-ms equality, fails on a correct fix) and never re-stamp after write (breaks manifest.sha256). Run-start stamp defect signature: multi-second gap (~22 s).
5. Proof: save pre-edit file; unit test green on edit, red on pre-edit with quoted defect-matching error; browser control for the hook (old app.js swapped in -> smoke FAIL, null stats, nonzero exit); then restore-then-measure: restore the delivered file and re-run the full suite + smoke green. Record edit -> file:line -> test -> quoted control in CHANGES.md.
Pitfalls: PASS with null stats; '>=' direction check; initializer stamping; averaging instead of maxima (bound needs worst frame); unguarded renderer.info; green-on-broken-file as proof; SwiftShader fps is not game performance (null on purpose); mock-renderer unit tests are not headset evidence.
