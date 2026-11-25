---
name: camp-tc-xr-performance-reproducib-a57f
description: When asked to build a measurable performance slice for an engine/renderer in Node (no browser/GPU): batching/LOD/budgets with before/after numbers from runs you performed.
---

# Reproducible JS engine-slice perf measurement

Scenario: a build gate demands numbers, not "it feels smooth", for a scene optimisation (batching, shared resources, allocation-free updates). Node-only, plain objects standing in for engine types (THREE.Mesh etc.).

## Steps
1. **Read the fixtures read-only.** Never edit given fixtures (prototype builder, asset JSON). Note their exact interface and adapt to yours in a thin adapter in the measurement tool, not by rewriting them.
2. **Deterministic asset expansion first.** Seeded PRNG (e.g. mulberry32) with the asset's seed; document the exact formula (grid centering, jitter draw order). Validate: required keys present, expectedCount == rows*cols, throw with clear messages. Prove determinism by expanding twice and comparing.
3. **Optimised scene keeps every entity.** Group/batch but track counts; add an assertion in the measurement tool that total leaves after grouping == placements length. Dropped/duplicated entities are the worst silent failure.
4. **Loop with injected clock.** `createLoop({update, render, now})`, fixed-step accumulator; frame cost = `now()` around update-steps+render per rendered frame. Stats as live getters (frames, drawCalls, mean, p95 nearest-rank, max) over a preallocated Float64Array ring — no per-frame allocation (including the `submit` closure: create once).
5. **Two tools: `measure.mjs` (baseline|optimised, one JSON line) and `ablate.mjs` (one micro-experiment per named optimisation).** Each named optimisation needs its own before/after figure (object counts, retained build bytes, per-tick µs + write counts), not just the combined end-to-end delta. Add `verify.mjs` for invariants (throws on bad input, x/z untouched by tick, no needsUpdate writes, dispose coverage) printing PASS/FAIL lines.
6. **Heap: `process.memoryUsage().heapUsed` with `--expose-gc` + `global.gc()` before each sample.** Record that in the report. Run the bare command once too and report how its deltas differ (they will be garbage-dominated) — that is the honest caveat.
7. **Run each mode in a fresh process at least 3 times.** Use one designated final pair as the headline table (copy the exact printed JSON), report the run-to-run range. Set budget thresholds so they hold across all observed runs of the optimised build; report baseline FAILs against the same lines.
8. **Report order:** numeric budget table first (PASS/FAIL per line), then exact printed values + exact commands + sampling method (p95 definition, heap sampling), then named optimisations with figures, then invariants, then explicit caveats ("Node CPU/JS-heap evidence, not GPU / not headset FPS"; frame ms is CPU work per frame, not wall-clock pacing).

## Verify before finishing
- Fixtures unmodified (`git status` on them).
- The exact commands in the report were the ones run; printed JSON copied verbatim.
- Leaf-count guard ran in every measure invocation.

## Common mistakes
- Copying numbers from fixtures/other projects instead of running.
- Measuring only the combined delta and calling it "the effect of optimisation X".
- Heap sampled without GC control, or not saying whether --expose-gc was used.
- Silent leaf drops when grouping; no count assertion.
- Claiming GPU/headset conclusions from Node CPU numbers.
