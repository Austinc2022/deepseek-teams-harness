---
name: camp-tc-vr-super-worker-honest-fu-899b
description: When a ticket asks for a headless smoke test that measures fun proxies (error/miss-rate style metrics) on a small HTML/JS demo with a scripted input hook.
---

1. Expose a scripting hook (e.g. `window.__latch = { startCharge, release(ms), state }`) that accepts explicit timestamps/durations so scripted runs need no real-time sleeps; keep the human input path (mouse/keyboard) on the same code path (release() without args uses elapsed time).
2. Fix the sample generation up front: a seeded PRNG (mulberry32 with a written-down seed), a documented jitter model calibrated to prior evidence (e.g. uniform ±360 ms so E|error| = 180 ms matches a prior prototype), and write the full unfiltered schedule into results.json. Never hand-pick, hard-code, or drop samples to pass thresholds — an honest miss is the expected useful result.
3. Compute proxies in one shared `finish()` from the raw sample array (mean |error|, fraction outside the window) so the browser path and the fallback path report identically.
4. results.json: `errors`, `renderer`, `frame_ms_median` (median of 240 in-page rAF deltas via performance.now()), `draw_calls` (instrumented counter for 2D canvas — no renderer.info), `seed`, `raw_ms`, plus pass thresholds and booleans for transparency.
5. Resolve playwright + chrome-headless-shell from caches only (`require.resolve`, then `~/.npm/_npx/*/node_modules`, then `~/Library/Caches/ms-playwright`); launch with `--single-process --use-angle=swiftshader --enable-unsafe-swiftshader`; ONE page per browser. Always close browser AND server or node hangs. Keep a Node rAF-shim fallback that runs the page script in `node:vm` and labels its tick deltas as JS cost, not display frames.
6. Sanity checks beyond the proxies: a quick click must NOT launch, a real timed hold must launch, every scripted hold must launch — record failures in `errors`.
7. Canvas non-blank check via luma variance — but sample AFTER frames have painted (`ready` set at init can be true before the first rAF); wait until the frame counter is > 0 first. A premature sample reads variance 0 and looks like a blank scene when it is not.
8. Externalise all user-visible strings into strings.js (window.STRINGS) and assert the HTML holds none literally.
9. Verdict: if a threshold is missed write NO-GO plainly with ONE reason and the corroborating metric; state what a SwiftShader number is NOT evidence of (Quest perf), and list headset-only items as untested. Never retune the demo or script to flip the verdict.
