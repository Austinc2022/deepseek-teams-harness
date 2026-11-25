---
name: camp-tc-technical-artist-webxr-mo-0145
description: Building or reviewing shader/VFX effects for mobile WebXR (Quest-class) where a budget gate demands cost arithmetic, draw caps, and clean disposal.
---

# Mobile WebXR VFX: cost declaration + lifecycle contract

1. **Fix one estimation convention up front and use it in every COST string.** State it once (docs) and repeat the numbers in each module: screen coverage (e.g. ~1 kpx per cm² of effect at the stated depth, derived from per-eye px and hFOV), fill rate anchor (e.g. 0.53 Mfrag ≈ 1 ms), and near-depth multiplier (hand depth can be 2–3× denser than workspace depth). Arithmetic shape: primitive area → fragments → draws → "X ms est.". Never adjectives ("cheap"), never draw-call count alone — 1 draw call can cover a full screen.
2. **Kill full-screen ideas with the frame budget, not taste.** Compute their fragments (per-eye px × eyes) against the whole frame time; a full-screen pass often exceeds the entire frame, and multi-tap distortion multiplies that. Record the rejection in a DECISIONS doc with the arithmetic.
3. **Colour space: convert once at authoring time.** Design palettes arrive as sRGB hex; uniforms/GLSL must carry linear because renderer.outputColorSpace = SRGBColorSpace re-encodes on output (feeding sRGB bytes double-encodes → washed out). Convert with `((c+0.055)/1.055)^2.4`, embed the linear triple as a named constant with the formula in a comment (e.g. #FF9B4A → 1.000, 0.328, 0.068). THREE.Color(hex) with ColorManagement is fine; manual .set(r,g,b) of hex bytes is the bug.
4. **Lifecycle contract: { mesh, update(dt), dispose() } + `done`.** Fixed lifetime < spec cap; update() accumulates age and calls its own dispose() at expiry (release geometry+material, detach from parent, hide mesh); update after dispose is a no-op. Zero allocations in update(): scalar math + uniform writes only; build all buffers/attributes once in the factory with a seeded LCG (never Math.random at runtime).
5. **Naming + caps as review checklist.** project_<action>_<part> on mesh/geometry/material names (readable in GPU captures); per-effect caps (draws, additive layers, no full-screen) stated in a pipeline-rules doc and echoed in each file header.
6. **Verify in two layers.** (a) `node --check` on each module (ESM is fine — this Node parses export/import without package.json). (b) Runtime smoke against a hand-written minimal stub of the 3D API (tiny node_modules stub, run factory → update past lifetime → assert self-dispose, naming prefix, post-dispose no-op, COST contains arithmetic; then DELETE the stub). GLSL cannot be compiled without a GL context — say so honestly; eyeball varying/uniform declarations for stage pairing.
7. **Honesty line mandatory:** a DECISIONS/review doc ends with the missing evidence (e.g. "no on-device GPU timing taken; X ms is an estimate; target Hz not measured"). Never claim measurements you did not run.

Common mistakes: hex→uniform without conversion; counting draws as cost; per-frame `new` in update(); claiming estimates as measurements; forgetting the missing-evidence line.
