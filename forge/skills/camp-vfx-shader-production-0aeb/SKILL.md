---
name: camp-vfx-shader-production-0aeb
description: When creating shaders or visual effects for hits, pickups, and feedback in src/art/vfx/, or updating pipeline-rules.md.
---

# Shader & VFX Production

Use when creating or changing gameplay visual effects (hits, pickups, feedback) or shaders in `src/art/vfx/`, or when maintaining `pipeline-rules.md`.

## Procedure

1. **Define the effect contract.** For each effect, state the triggering event (hit, pickup, feedback type), the intended read at a glance, the project's art direction, lifetime, and screen area covered. Decide what must be parameterized (color, intensity, scale, duration) so callers can tune it without editing shader code.

2. **Pick the cheapest technique that achieves the read.** Prefer single-pass blended quads, simple procedural math, and pooled particle emitters over multi-pass post-processing. inspect existing effects in `src/art/vfx/` first and reuse materials/shaders to minimize state changes.

3. **Implement in `src/art/vfx/`.** Follow existing file and naming conventions. Keep shaders small and comment only non-obvious math. Expose uniforms/parameters through one config object per effect. Ensure effects clean up (return to pools, release render targets) and respect the engine lifecycle.

4. **Measure and record GPU cost.** For every new or changed effect, record draw calls added, blend/overdraw estimate, texture fetches, particle count, render-target allocations, and measured frame-time impact at the project's target resolution and refresh rate. Note the cost inline next to the effect and in the handover summary.

5. **Document pipeline rules.** Update `pipeline-rules.md` with any new asset format, naming, parameter, budget, or review-gate rule. Remove obsolete rules so the file stays the single source of truth for what a VFX contribution must satisfy.

6. **Verify before handover.** Build, run the game, trigger each effect in context, and check visual quality and frame-time against budget, including the lowest supported hardware tier. Confirm a fallback exists where GPU features are unsupported.

## Handover checklist

- [ ] Each effect has a documented GPU cost (draw calls, overdraw, estimated ms) measured at target resolution
- [ ] Existing materials/shaders are reused where practical; no duplicate per-effect copies
- [ ] Parameters live in one config object; no magic numbers in shader math
- [ ] Triggers are wired to the correct events (hits, pickups, feedback) and cleaned up on lifecycle end
- [ ] Visual QA passed in context at target resolution/frame rate, including the low-end tier
- [ ] Fallback path exists for unsupported GPU features
- [ ] `pipeline-rules.md` updated with any new rules and kept accurate
- [ ] Build and existing tests pass; no frame-time regression
