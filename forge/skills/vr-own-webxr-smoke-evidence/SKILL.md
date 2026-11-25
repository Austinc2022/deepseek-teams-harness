---
name: vr-own-webxr-smoke-evidence
description: "When browser-smoke evidence (tools/smoke.mjs -> evidence/smoke.json) for a WebXR tree will back a claim in a report, gate or ticket turn — \"the page runs clean\", \"audio works\", \"the XR session lifecycle survives\" — and whenever you re-verify or recover work that already has a smoke run. The evidence discipline for that smoke: what it must exercise, what a re-run owes, and which claims it can never"
---
<!-- written by vr-skill-smith 2026-11-24T13:56:06.455Z: proposed by dept-people; audited by vr-auditor: SAFE: webxr-smoke-evidence keeps all four hard rules in normal operation (no downloaded code — pinned vendored iwer 2.8.0 and a cached browser; no data out — localhost-only with nonLocalhost=0 as a ve
...[truncated] -->

# webxr-smoke-evidence

## When to use
Whenever browser-smoke evidence for a WebXR tree (tools/smoke.mjs -> evidence/smoke.json) will back a claim in a report, gate or ticket turn — "the page runs clean", "audio works", "the XR session lifecycle survives" — and whenever you re-verify or recover work that already has a smoke run.

## Method
1. **Audio step (after Play-on-desktop).** Schedule exactly one note/beat through the wired audio Scheduler; assert AudioContext state === 'running' and 0 pageErrors; record an `audio` field in smoke.json: `{ status, ctxState }`. The stock smoke never touches audio (tools/smoke.mjs:68-76 drives only mouse moves + snap keys; smoke.json carries variance + pageErrors but no audio field — measured 2026-11-24), so add the step, never assume it ran. Wiring trap: SchedWire is constructed with clock = null (src/app.js:37 `new SchedWire(this.audio)`; src/sched-wire.js:12 defaults `clock = null`), so no song beat fires on its own — push the note/beat explicitly (audio.at(ctxTime) / Scheduler push) instead of waiting.
2. **XR session-lifecycle step.** Drive the IWER runtime (in kit deps: devDependency iwer 2.8.0; src/main.js preBoot via `?iwer=` on a VITE_EVIDENCE build — a shipped build silently skips it, src/main.js:23) through enter -> end -> re-enter on the BUILT page and record pageErrors for each phase. The driving mechanics and IWER gotchas live in the webxr-lifecycle-test-stack skill step 2 — follow them there. A session-lifecycle claim made without this run is labeled MOCK-argued, never measured: the vitest MockSession layer and a desktop-only smoke cannot upgrade it (headless-shell smoke clicks #btn-desk and never enters a session at all).
3. **Re-run, never re-read.** Cheap deterministic evidence — the headless-shell smoke, about a minute end to end (build + launch + 20 s of simulated input; measured runSeconds 20.2) — is RE-RUN in every recovery/verification turn. Re-reading cached smoke.json is not verification. Sole exception: src/ is byte-identical to the run's header.srcHash (sha256 over every file under src/ — gate-lite.mjs:16-21) AND the turn states that comparison explicitly. When comparing runs, compare verdicts (status, consoleErrors/pageErrors/nonLocalhost counts), not pixel numbers: the same srcHash build re-measured gave canvas variance 37.6 vs the delivered 35.07, both PASS.
4. **Order matters: run the smoke on the FIRST unit-green build, not at the end.** Node unit suites stay green on Chrome Window brand-check bugs (window.setInterval called with a non-Window receiver throws "TypeError: Illegal invocation" in Chrome while Node is not brand-checked — measured: kit v1.1 smoke2 caught it after 71/71 unit green; fact fb84f223c80). The smoke is the only check that sees that class.

## Checks (all must hold before evidence may say PASS / measured)
- smoke.json contains an `audio` field with status + ctxState; ctxState is 'running', or the deviation is recorded as an open risk — not hidden.
- Each lifecycle phase (enter, end, re-enter) has its own pageErrors record in the run; the report's lifecycle claim cites that run id, or is labeled MOCK-argued.
- Every recovery/verification turn citing smoke evidence shows either a fresh run (header.startIso newer than the turn) or a stated srcHash byte-identity comparison.
- The first unit-green build's smoke run predates any further feature work in the same ticket.

## Pitfalls
- **Re-read trap:** a recovery turn re-read the cached 12:08Z smoke instead of re-running it ("the cached run stands; a rerun would only re-measure the same build" — kit v1.1 NOTES.md:21). Timestamps expose it; "same build" is not verification.
- **Mock-upgrade trap:** MockSession vitest tests prove the JS logic, not a browser session. Without the IWER enter->end->re-enter run the lifecycle claim stays MOCK-argued, however green the unit suite is.
- **Pixel-variance trap:** variance/luma drift run-to-run even on identical srcHash (measured 35.07 vs 37.6). Only verdict-level fields are comparable.
- **Timing trap:** if the smoke runs only at final verification, every earlier "unit-green" claim silently excluded the browser-only crash class — the class the kit v1.1 timer bug belonged to.
