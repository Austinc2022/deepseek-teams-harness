---
name: camp-tc-gameplay-core-pure-game-l-0112
description: Building a dependency-free gameplay/rules module with node:test, where time and randomness are injected.
---

1. Read the approved plan first; transcribe every numeric rule (thresholds, clamps, cadence) into named constants and a README rule table — the table is the spec reviewers check against.
2. Design the API as pure: injected `rng` + caller-supplied `dtMs`/`offsetMs`; never call Date.now/performance.now/Math.random inside the module. Keep a single mutable state object and a `snapshot()` deep copy (JSON round-trip is enough for plain data).
3. Phase machine: the tick handler must explicitly implement every transition, including the "obvious" one (e.g. IDLE -> COUNTDOWN on first tick). A missing trigger transition makes every test hang in the start state — check this first when all tests fail with the phase stuck.
4. In judgement code, apply heat/energy BEFORE scoring when a threshold can flip a mode (overdrive) mid-hit, and document whether the triggering hit is affected; assert the chosen behaviour in a test.
5. Time-window rules (e.g. "decay after 2000 ms idle"): compute the idle portion of the CURRENT tick as min(dt, idleBefore + dt - threshold), not min(dt, totalIdle - threshold) — totalIdle double-counts earlier ticks. Verify with both one-big-tick and split-tick test cases; they must agree.
6. Test bookkeeping bugs hit before impl bugs: in a chain of asserts, each `submitHit(...)`/`tick(...)` inside `assert.equal(...)` mutates state. Capture one result object and assert multiple fields on it; never fire an extra "just for the assertion" call — it silently shifts every later combo/counter expectation.
7. Determinism test: run the whole scenario twice with a locally seeded rng (mulberry32) and identical call sequences, compare JSON.stringify of the trail (snapshots + hit results) at several checkpoints.
8. Node ESM: .js files with import/export need a `{"type":"module"}` package.json next to them. Run plain `node --test` from the repo root to discover `*.test.js`; note that `node --test <dir>` can report a bogus single test on Node 24 — always confirm the summary line says the expected `ℹ tests N` count, not just "pass".
9. Finish by grepping the module folder for banned identifiers (Date.now, Math.random, three, document) — expect only comment/README hits — and report the real `node --test` summary including failures.
