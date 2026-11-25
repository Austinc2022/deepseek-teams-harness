---
name: camp-environment-art-cost-budget-7d64
description: Before handing over or revising any scene in src/art/environment/: measure the scene's real cost (triangles, draw calls, texture memory, lights) in the running kit, fill the budget table with actual-vs-ceiling numbers, and reduce cost until within budget.
---

When: before handing over any scene in src/art/environment/, whenever you fill or update a level's budget table, and whenever a scene is suspected to be over budget.

1. **Get the ceilings.** Read the level's budget table (src/art/environment/budget.md or pipeline-rules.md): approved maxima for triangles, texture memory, draw calls, and real-time lights. If no ceiling exists for a level, ask for one before building — never invent a budget silently.
2. **Measure the shipped scene, not the editor one.** Run the kit's demo/index page headlessly (reuse the headless-shell smoke procedure) with the scene instantiated exactly as in game: LODs resolved, instancing enabled, post-processing as shipped. Expose `renderer.info` via a debug hook (e.g. `window.__renderer`) if the kit does not already.
3. **Capture numbers after a warm frame** and again after a camera sweep along the level's main player path: `render.triangles`, `render.calls`, `memory.geometries`, `memory.textures`, and the light count. Use the worst (peak) values, not the first frame.
4. **Compute texture memory** as Σ(width × height × bytes-per-pixel) × 1.33 for mipmaps (4 bytes for RGBA8, halve for compressed formats). Attribute draw calls per material group.
5. **Fill the budget table**: one row per scene with actual vs ceiling and % headroom. Flag any line above 90% of its ceiling.
6. **If over budget, reduce in this order**, re-measuring after each step: instance repeated props (InstancedMesh); merge static geometry by material; atlas small textures; drop texture resolution one tier; replace real-time lights with baked/lightmaps or emissive; add LODs. Never report a saving without the before/after number from `renderer.info`.
7. **Verify before handover**: screenshots from 3 fixed camera positions, before vs after any reduction, must be materially unchanged (side-by-side); attach the measured `renderer.info` figures to the handover and state remaining headroom per budget line.

**Common mistakes**: measuring a test scene instead of the shipped instantiation; counting texture memory without mipmaps; claiming draw-call savings from a merge without re-measuring; forgetting transparent materials (overdraw) and shadow-casting lights when counting cost.
