---
name: camp-vfx-gpu-cost-measurement-fa02
description: vfx-gpu-cost-measurement
---

# Measuring and recording GPU cost per effect

When: every time you deliver or revise a shader/effect in `src/art/vfx/` and the deliverable must state its GPU cost ("with their GPU cost noted"), before you write the pipeline-rules.md entry.

## Steps

1. **Isolate one variable.** Build a reproducible case for the effect alone: fixed camera (or a scripted hit/pickup replay), same scene, effect toggled off/on. Never compare across different scenes or camera paths.
2. **Warm up.** Render 60+ frames before measuring to absorb shader compilation and first-texture-upload spikes.
3. **Measure the delta.** With the effect off, sample frame time over ~300 frames; record median and p95. Repeat with the effect on. Report `ms_delta = median_on - median_off`, and express it as % of the target frame budget (e.g. 11.1 ms at 90 Hz, 13.8 ms at 72 Hz). Disable VSync/framerate caps during measurement.
4. **Estimate static cost when you cannot profile on device** (headless runs and CI measure no GPU — say so explicitly, do not present estimates as device numbers). Use proxies and list them: draw calls added, transparent overdraw layers (particle count × screen coverage), texture samples + dependent reads per fragment, texture memory, simultaneous instance cap.
5. **Budget rule of thumb.** A feedback effect (hit spark, pickup flash) gets ≤ 0.5 ms on the target device or ≤ 10% of frame budget, whichever is smaller. If it exceeds that, it is not done.
6. **Cheapest fixes, in order:** cut fill rate (fewer/bigger particles, smaller screen coverage, lower fragment cost); move work from fragment to vertex; reduce texture samples; make additive effects depth-write-off and depth-test-on; cap simultaneous instances and recycle them; drop alpha blending where additive or opaque works.
7. **Record in the deliverable table** (one row per effect): name, ms delta (or "estimated, proxy: ..."), draw calls added, overdraw/particle cap, verdict vs budget (within / over + fix applied), and where it was measured (device vs. simulator vs. headless).
8. **Update pipeline-rules.md** with the per-effect numbers and the budget rule, so later effects inherit the limits.

## Verify before handover

- [ ] Numbers reproduce on a second run (±20%).
- [ ] Every number is labelled measured or estimated, with the environment named.
- [ ] Effect is within budget, or the overage and its fix are documented.
- [ ] pipeline-rules.md updated with the same numbers as the report.

## Common mistakes

- Reporting GPU numbers from a headless/smoke run (no GPU there — use proxies and label them estimated).
- Measuring with VSync on, or including load/compile frames in the average.
- Profiling the effect while other changes shipped in the same build.
- Noting cost only at author time and never revisiting it after tuning.
