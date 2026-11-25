---
name: vr-own-kit-stats-hook-and-write-time-ev
description: "When instrumenting a WebXR tree (kit or game) with a perf/stats hook and evidence stamps: publish a read-only numeric-or-FAIL stats hook, record numeric maxima in the smoke (missing stats = FAIL, never PASS with null), stamp generatedAt at write time and assert the gap |startIso - generatedAt| <= 5 s (not \">= startIso\", which only passed as same-millisecond equality), and prove each edit with a fa"
---
<!-- written by vr-skill-smith 2026-11-24T13:59:11.587Z: proposed by the builder of ticket kc44d55a00b; audited by vr-auditor: SAFE. The skill is a verification-strictness procedure for perf/stat hooks and evidence stamps on WebXR trees. It violates none of the hard rules: no downloaded code is run (repo-local tests/smoke on 
...[truncated] -->

**When to use.** Whenever you add or re-verify a performance/stat hook plus its evidence output on a WebXR tree (studio kit or game) — e.g. `window.__kitStats` + `tools/smoke.mjs` -> `evidence/smoke.json` — or any evidence-stamp fix (`generatedAt` and friends). Also use it when reviewing an after-action report or CHANGES.md that claims such an edit is verified. (Anchors below were verified against the kit v1.2 tree of ticket kc44d55a00b on 2026-11-24; the method is what holds, not the line numbers.)

## Method

1. **Design the hook numeric-or-FAIL.** One plain, read-only object published once — e.g. `window.__kitStats = { drawCalls: 0, triangles: 0 }` (kit v1.2 `src/app.js:48-49`) — copied from `renderer.info.render` once per frame **after** `renderer.render(...)` (`src/app.js:114-115`), allocation-free. Guard for mock renderers (`renderer.info` may be absent: copy only `if (info)`). Game logic must never write the hook; only the smoke reads it. A stats field is either a number or the run FAILs — there is no "PASS with null".

2. **Record maxima, not averages.** In the smoke, sample the hook once per input step across the whole run (`tools/smoke.mjs:73-85`), accept only `Number.isFinite` values, keep a `statsSeen` counter and the numeric **maxima** per field — a draw-call/triangle bound needs the worst frame, not the mean. Store maxima plus `statsSamples` in the evidence.

3. **Make missing stats a FAIL.** Fold a `statsOk = Number.isFinite(drawCalls) && Number.isFinite(triangles)` clause into the smoke's pass rule (`tools/smoke.mjs:125-126`): hook absent or non-numeric ⇒ `status: "FAIL"` with null fields and a nonzero exit. Never let the run pass while the fields are null.

4. **Stamp evidence at write time.** Remove any `generatedAt` stamp from the run-start initializer (the v1.1 bug: 22 s before the header). Stamp it on its own line **immediately before** `writeEvidence(...)` (`tools/smoke.mjs:135-136`), and pin that order with a static code-order test: the initializer must not stamp, and `write - stamp === 1` (`tests/smoke-write-time.test.js`). The measured check lives in the written file.

5. **Assert the gap, not the direction.** `header()` stamps `startIso` **inside** `writeEvidence` (`tools/gate-lite.mjs:17-27`), i.e. *after* any writer-side stamp. So a correct write-time stamp yields `generatedAt <= startIso` — usually equal at millisecond resolution (kit v1.2 delivered `generatedAt == startIso == 2026-11-24T13:37:22.103Z`). The correct control: `0 <= startIso - generatedAt <= 5000 ms`. Do **not** assert `generatedAt >= header.startIso` — it passes only on same-millisecond coincidence, fails on a correct fix, and tempts a re-stamp after write that breaks `manifest.sha256` integrity. Defect signature of a run-start stamp: a gap of seconds (v1.1: 21.98 s).

6. **Prove every edit with a failing control + restore-then-measure.** Save the pre-edit file; run the test green on the edit, then swap the pre-edit file back in and require red with a verbatim, defect-matching error (e.g. unit: `expected undefined to deeply equal { drawCalls: +0, triangles: +0 }`, 2 failed; browser: hook removed -> `smoke-nohook` EXIT_NONZERO, `{"status":"FAIL","drawCalls":null,"triangles":null}`). Then **restore the delivered file and re-measure green** (kit v1.2: `npm test` 23 files / 84 tests, smoke PASS `drawCalls 1, triangles 0` over 10 samples). Record each row as edit -> file:line -> test -> quoted failing control in CHANGES.md.

## Checks (all measured, or say otherwise)
- smoke.json PASS with numeric maxima, `statsSamples` > 0, zero console/page errors.
- Hook-removed control: smoke FAILs with null stats and nonzero exit; unit suite red on pre-edit app.js with quoted error.
- Gap control: `0 <= startIso - generatedAt <= 5 s` on the written file (and the static order pin green).
- Full suite green after restore; CHANGES.md rows quote real failing-control output.
- Label honestly: MOCK-renderer unit tests and SwiftShader headless numbers are bounds, not real-headset evidence; no fps is reported from SwiftShader on purpose.

## Pitfalls
- **PASS with null stats** — a missing hook must FAIL, or the bound silently vanishes.
- **`>=` direction assertion** on `generatedAt` — wrong way round given the header's in-write stamp; use the gap (fact f51be0f10c3, corroborated).
- **Stamping in the initializer** — produces the multi-second gap (22 s in v1.1).
- **Averaging instead of maxima** — a bound needs the worst sampled frame.
- **Unguarded `renderer.info`** — crashes on mock renderers and the unit suite goes red for the wrong reason.
- **Green test on the broken file** proves nothing; and never skip restore-then-measure — a tree left in failing-control state ships red.
- **Re-stamping after write** to make an assertion pass — corrupts `manifest.sha256` integrity.
- **Claiming fps/game performance** from SwiftShader — record null and say why.
