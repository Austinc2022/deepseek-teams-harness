---
name: learned-webxr-smoke-evidence-522b
description: Whenever a WebXR tree (kit or game) ships browser-smoke evidence (tools/smoke.mjs -> evidence/smoke.json) that a report, gate or ticket turn will cite — "page runs clean", "audio works", "session lifecycle survives" — or when re-verifying/recovering work that already has a smoke run.
---

# webxr-smoke-evidence

## When to use
Whenever browser-smoke evidence for a WebXR tree (tools/smoke.mjs -> evidence/smoke.json) will back a claim in a report, gate or ticket turn — "the page runs clean", "audio works", "the XR session lifecycle survives" — and whenever you re-verify or recover work that already has a smoke run.

## Method
1. **Audio step (after Play-on-desktop).** Schedule exactly one note/beat through the wired audio Scheduler; assert AudioContext state === 'running' and pageErrors 0; record an `audio` field in smoke.json: `{ status, ctxState }`. The stock smoke never touches audio (tools/smoke.mjs:68-76 drives only mouse moves + snap keys; smoke.json has no audio field — measured 2026-11-24), so add the step, never assume it ran. Wiring trap: SchedWire is constructed with clock = null (src/app.js:37 `new SchedWire(this.audio)`; src/sched-wire.js:12 default), so no song beat fires on its own — push the note/beat explicitly (audio.at(ctxTime) / Scheduler push).
2. **XR session-lifecycle step.** Drive the IWER runtime (kit deps: iwer 2.8.0; src/main.js preBoot via ?iwer= on a VITE_EVIDENCE build — a shipped build silently skips it, main.js:23) through enter -> end -> re-enter on the BUILT page; record pageErrors per phase. Driving mechanics and IWER gotchas live in the webxr-lifecycle-test-stack skill step 2. A session-lifecycle claim without this run is MOCK-argued, never measured: the vitest MockSession layer and a desktop-only smoke cannot upgrade it.
3. **Re-run, never re-read.** The headless-shell smoke (~a minute: build + launch + 20 s simulated input; measured runSeconds 20.2) is RE-RUN in every recovery/verification turn; re-reading cached smoke.json is not verification. Sole exception: src/ byte-identical to the run's header.srcHash (sha256 over every file under src/, gate-lite.mjs:16-21) AND the turn states that comparison. Compare verdicts (status, consoleErrors/pageErrors/nonLocalhost counts), not pixel numbers: same srcHash re-measured gave variance 35.07 then 37.6, both PASS (kit v1.1 verifier run).
4. **Order: run the smoke on the first unit-green build, not at the end.** Node unit suites stay green on Chrome Window brand-check bugs (window.setInterval with a non-Window receiver: "TypeError: Illegal invocation" in Chrome, Node not brand-checked — measured kit v1.1 smoke2 after 71/71 unit green; fact fb84f223c80). The smoke is the only check that sees that class.

## Checks (all must hold before evidence says PASS/measured)
- smoke.json has an `audio` field with status + ctxState; ctxState is 'running' or the deviation is an open risk, not hidden.
- Each lifecycle phase (enter, end, re-enter) has its own pageErrors record; the lifecycle claim cites that run id or reads MOCK-argued.
- Every recovery/verification turn citing smoke shows either a fresh run (header.startIso newer than the turn) or a stated srcHash byte-identity comparison.
- The first unit-green build's smoke run predates further feature work in the ticket.

## Pitfalls
- Re-read trap: a recovery turn re-read the cached 12:08Z smoke instead of re-running (kit v1.1 NOTES.md:21). Timestamps expose it; "same build" is not verification.
- Mock-upgrade trap: MockSession tests prove JS logic, not a browser session; without the IWER run the claim stays MOCK-argued.
- Pixel-variance trap: variance/luma drift run-to-run on identical srcHash; only verdict-level fields compare.
- Timing trap: if the smoke runs only at final verification, every earlier "unit-green" claim silently excluded the browser-only crash class.
