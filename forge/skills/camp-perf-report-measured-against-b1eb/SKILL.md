---
name: camp-perf-report-measured-against-b1eb
description: Use every time you produce or update perf-report.md, or any claim about frame time, draw calls or memory, so the numbers are reproducible and honestly compared to a budget.
---

# perf-report.md: measured numbers against a stated budget

The deliverable is only credible if the budget existed before the measurement and every number can be re-derived. Follow this order.

## 1. State the budget first
- Write the budget table BEFORE measuring: frame time, draw calls, memory (plus load time if in scope).
- Give each budget a source: target device spec (e.g. Quest 2 at 72 Hz = 13.8 ms per frame), a kit/engine doc, or a prior report. If you assume a value, label it `assumed` and say why.
- State the device target and the headroom rule (e.g. keep p95 under 80% of the frame budget).

## 2. Measure the real loop, not a proxy
- Frame time: sample frame deltas from the actual render loop (XRSession.requestAnimationFrame timestamps or performance.now() at the loop), not from a separate benchmark harness.
- Draw calls / triangles: read the renderer's own counters (e.g. renderer.info.render) per frame.
- Memory: JS heap where available (performance.memory in Chromium), plus counted scene cost (textures, geometry, audio buffers). Note which one you report.
- Keep instrumentation identical between runs (same scene, same seed/load path, debug overlays and logging off or on in both runs).

## 3. Measure steady state
- Drop a warm-up phase (first ~120 frames or until after initial asset load and first GC), then sample at least 600 frames or 10 s.
- Report median, p95 and max. Never report only an average; a single spike is what breaks XR frames.

## 4. Record the environment
Device or simulator, browser and version, resolution / framebufferScale, scene and load path, git commit, and the exact command or steps to reproduce the numbers.

## 5. One variable per change
For each optimization, give a before/after row with the delta. Keep the change only if it moves the target metric and does not break the test suite. Discarded attempts go in a short 'tried and rejected' list.

## 6. Report format
Table: budget | measured | headroom | verdict (PASS/FAIL). Then: bottleneck found, changes made, next bottleneck, and caveats. Caveats must state that headless-browser numbers are CPU/JS-only and are NOT device GPU frame times, and mark any estimate as `estimated`.

## Checklist before handover
- [ ] Budget written first, each value sourced or labeled assumed
- [ ] Every number measured in a named, reproducible run (command + commit recorded)
- [ ] p95 and max reported, warm-up excluded
- [ ] No number claimed as measured that was actually estimated or copied from a doc
- [ ] Every FAIL has a follow-up plan or an explicit owner decision

Common mistakes: measuring with dev tools/overlay left on; averaging away spikes; comparing a headless run to a device budget; changing two things and attributing the gain to one; citing draw-call counts from code inspection instead of the renderer counter.
