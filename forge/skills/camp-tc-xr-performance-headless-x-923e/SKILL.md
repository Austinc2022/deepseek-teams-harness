---
name: camp-tc-xr-performance-headless-x-923e
description: Building evidence for an XR frame-budget gate when no headset is attached: a deterministic Node-based CPU-proxy harness with before/after runs.
---

1. Split the device frame window (e.g. 1000/72 = 13.89 ms) into GPU + compositor/tracking/OS + CPU-app budgets; state each number and the arithmetic that ties them to the window.
2. Build the engine slice dependency-free: render loop with injectable scheduler+renderer (headless), per-frame CPU ms via performance.now(), counters read from renderer.info.render; asset loader with pending counts, and the loop must skip (not count) frames while assets are pending.
3. Harness (Node, --expose-gc): fixed seed, warm-up frames flagged and excluded from stats, stateless per-(seed,frame,hash) workload so counters are reproducible; write full JSON with per-frame samples to results/*.json AND print it; read heap after global.gc().
4. Calibrate synthetic CPU work to land the baseline near-but-over budget (per-draw and per-triangle iteration loops with a dependency-chain sink so V8 cannot delete them).
5. Run baseline plus each optimisation as separate --variant runs, sequential not parallel (CPU contention skews timings). Report p50 AND p95 plus min/max; never quote an average as "frame time".
6. Prove determinism: re-run the same seed at least twice and compare the full per-frame calls:triangles sequence byte-for-byte. Do it for a variant where calls vary per frame, not just a constant one.
7. When quoting raw JSON in a report, generate the block from the result files programmatically and diff it back (hand transcription of float digits WILL drift).
8. Honesty rules: label Node measurements as CPU-side proxy; list what needs a device trace (GPU, compositor, thermal, device CPU, real memory); never reuse another product's numbers; check any quoted derivation is dimensionally meaningful (1000/drawCalls is not a frame time).
