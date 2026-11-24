---
name: camp-environment-art-production-8466
description: Use when building or revising 3D level environments — scene geometry, materials, lighting — especially when triangle, texture, and draw-call budgets must be met.
---

# Environment Art Production

Workflow for producing level environments under `src/art/environment/` that read well visually and stay inside the budget contract.

## Steps

1. **Read the brief and budget first.** Capture the target look (references, mood, time of day), renderer/engine constraints, and the agreed ceilings for triangles, texture memory, and draw calls per level. If no budget exists, propose one and get it accepted before building.
2. **Block out the space.** Lay out major silhouettes and traversal volumes with primitives. Check sightlines and scale against the player character. Resolve composition and flow here — changing blockouts later is the most expensive rework.
3. **Build a modular kit, not one-off meshes.** Identify repeatable modules (walls, floors, trims, props) as reusable pieces sharing materials and texture atlases. Name and organize assets so other agents can integrate them.
4. **Author materials to budget.** Keep a small shared material library, atlas textures, reuse normal/roughness maps, and choose texture resolution by on-screen size. Avoid unique textures for throwaway props.
5. **Light for mood and readability.** Establish one clear key light and a value hierarchy; use fill sparingly; reserve dynamic lights for where they matter. Bake static lighting where supported and keep shadow casters few. Check the scene in greyscale to confirm the composition reads without color.
6. **Measure, don't guess.** Count rendered triangles (including instancing), unique textures and their memory, draw calls/batches, and dynamic lights per level. Maintain a budget table with **budget / actual / headroom** columns. If any row is over, cut or consolidate before handoff.
7. **Review in-engine.** Walk the level at target resolution: check LOD transitions, z-fighting, lighting seams, texture stretching, and the lowest target hardware.

## Handoff checklist

- [ ] Blockout approved; traversal and sightlines verified
- [ ] Modular kit documented; no duplicated one-off kit pieces
- [ ] Materials shared/atlassed; texture resolutions justified
- [ ] Key/fill lighting intentional; static lighting baked where supported
- [ ] Budget table complete for triangles, textures, and draw calls
- [ ] All rows within budget, or overages flagged with a reduction plan
- [ ] In-engine walkthrough clean: no seams, z-fighting, or broken LODs
- [ ] Assets in `src/art/environment/` with consistent naming
