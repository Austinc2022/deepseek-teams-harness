---
name: camp-tc-xr-performance-vr-perf-sl-dec9
description: Building a performance/engine slice with measured before/after numbers, budget tables, and an unverified third-party device claim to adjudicate.
---

1. Parse the scene manifest first; derive naive vs batched byte/draw arithmetic from it by hand and use those as expected values to check the build against (e.g. 48×2.4MB + dome + motes + orrery = 115,678,000 B).
2. Build three modules: loop.js (fixed-step update + frame sampler p50/p95/max with a warmup discard), assets.js (manifest loader with keyed dedupe, liveBytes(), release()), scene.js (naive and batched builders that both emit the same visible-object count; throw if counts diverge — deleting objects to win is a cheat).
3. In the measurement harness make the renderer stub a BOUNDED cost model (base + per-draw + per-byte + small seeded-LCG jitter so percentiles differ and reruns are deterministic). State in every artefact that it simulates CPU cost only and measures nothing about GPU/vsync/headset.
4. Run ≥600 measured frames per path after discarding warmup; write JSON with frame stats, draws, live bytes, and process.memoryUsage().heapUsed explicitly labelled a proxy.
5. Report: budget table with pass/fail per path, two optimisations each with before/after figures, method section (Node version, host CPU, frame count, warmup, what the stub does not measure), verdict that marks any evidence-free device claim UNVERIFIED and names the specific hardware measurement needed next (device serial + OS build + real trace).
Mistakes to avoid: reusing or averaging third-party numbers instead of measuring; averaging warmup frames into results (the classic QA bug); claiming GPU/headset timing from a CPU stub; making the naive path "win" by dropping objects.
