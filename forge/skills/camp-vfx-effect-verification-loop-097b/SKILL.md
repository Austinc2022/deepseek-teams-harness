---
name: camp-vfx-effect-verification-loop-097b
description: vfx-effect-verification-loop
---

# Verifying a shader/effect actually works and looks right

When: after implementing any hit, pickup or feedback effect in `src/art/vfx/`, before you claim it done.

## Steps

1. **Trigger it deterministically.** Drive the effect from a test hook or scripted replay (hit, pickup, miss), not from random play. If no trigger hook exists, add one behind a debug flag first.
2. **Smoke the build.** Load the kit headless (see the headless-shell smoke skill) and assert: no console errors, no shader compile errors/warnings, the effect's mesh/particles are present in the scene when triggered.
3. **Capture evidence.** Take at least two frames — effect off (or just before) and at effect peak — via screenshot in a real browser run. Compare against the intent: readable at gameplay distance, colour/contrast survives the intended lighting, no bloom blowout, no z-fighting or depth artifacts.
4. **Check the failure modes that shaders hide:** black square instead of texture (missing alpha), effect invisible against the background, effect visible through walls (depth test), tint wrong in VR (per-eye/render-order), effect persisting after the hit ends (dispose/cleanup).
5. **Check performance and lifecycle:** effect pool is reused, not allocated per hit; effect is removed on scene change; cost row exists (see vfx-gpu-cost-measurement).
6. **Report with the captures attached:** what triggers it, what it should look like, screenshots before/peak, cost row, and any deviation from the design note.

## Verify before handover

- [ ] Zero console/shader errors on load and on trigger.
- [ ] Before/peak screenshots captured and reviewed.
- [ ] Cleanup confirmed: no leaked particles/meshes after 10 consecutive triggers.
- [ ] Cost recorded and within budget.

## Common mistakes

- Trusting "it renders" in code review without a capture.
- Forgetting disposal: pools that grow per hit show up only after repeated triggers.
- Effects tuned in editor lighting that fail against the game's actual background.
