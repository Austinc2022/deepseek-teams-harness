---
name: camp-xr-performance-engineering-d48c
description: Use when building or tuning a real-time 3D/XR engine: implementing the render loop or asset loading, profiling frame time, draw calls and memory, or writing perf-report.md against a stated budget.
---

# XR Performance Engineering

Use for all `src/engine/` work (render loop, asset loading) and for the `perf-report.md` deliverable.

## Procedure

1. **State the budget first.** Fix the target device/profile and refresh rate (e.g. 90 Hz → 11.1 ms/frame), max draw calls, and JS heap / GPU memory limits. Record the measurement conditions in `perf-report.md` before tuning.
2. **Instrument before changing.** Time the render loop with rAF timestamps, splitting scene update, render submit, and idle. Read draw calls from renderer stats; sample JS heap and GPU texture/geometry memory at fixed intervals. Keep raw samples.
3. **Measure a baseline** on a fixed scene/route: warm up, then report median, p95 and worst frame time — never only an average. Note device, browser, build flags and content state so numbers are reproducible.
4. **Optimize the largest measured cost first.**
   - Frame time: cap DPR/render scale, use fixed-timestep updates with interpolation, eliminate per-frame allocations and scene-graph rebuilds, reuse vectors/matrices, cull offscreen objects, pause work when hidden.
   - Draw calls: instance/merge static geometry, share materials and textures, use texture atlases, batch transparent objects sparingly, trim shadow casters; verify with renderer stats.
   - Memory/loading: dispose geometries, materials and textures on unload, use compressed textures/mipmaps, lazy-load with abortable requests and capped concurrency, detect leaks via repeated load/unload heap comparisons.
5. **Re-measure after every change.** Keep before/after numbers, the command used, and the commit in `perf-report.md`. Never claim an improvement without a fresh run; flag any regression.
6. **Write the report:** a budget table (metric, budget, measured, delta, pass/fail), measurement method, findings, changes made, and remaining risks.

## Verify before handover

- [ ] Budget states target hardware/refresh rate and units for every metric.
- [ ] Frame time is measured (median/p95, warm-up, fixed scene), not estimated.
- [ ] Draw calls and memory are measured and compared against the budget.
- [ ] Each optimization has a before/after measurement; regressions are called out.
- [ ] No per-frame allocations or undisposed GPU resources in changed code.
- [ ] Build/tests pass and `perf-report.md` numbers match the actual runs.
