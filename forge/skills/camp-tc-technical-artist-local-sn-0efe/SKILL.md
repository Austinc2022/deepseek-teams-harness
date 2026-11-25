---
name: camp-tc-technical-artist-local-sn-0efe
description: Building a local (non-full-screen) snap/feedback VFX for a mobile WebXR target with a strict ms budget and evaluating a vendor full-screen effect drop.
---

1. Read the art constraints first: frame budget, engine reserve, gate rules (full-screen pass bans), scale, palette hex, glow cap.
2. Build the effect as one or two THREE.Points draws with analytic sprites (gl_PointCoord): zero texture reads, zero render targets, motion computed in the vertex shader from a uOrigin uniform. At most 2 draw calls.
3. Colour: convert sRGB hex to linear exactly once on the CPU (Color.setHex(hex, SRGBColorSpace), r160). Name the uniform for its space (uTintLinear). Never paste sRGB components into GLSL; never pow() in shader. Renderer does the single sRGB encode at output.
4. Enforce the glow cap in code, not convention: clamp each pixel (min(col, vec3(uPeak))) and budget the stacked envelope (e.g. 2 draws x 2 overlaps x uPeak <= 1.2 linear).
5. If the effect is positioned in world space from a shader uniform, set frustumCulled = false on the Points — a bounding sphere at the group origin culls wrongly when the target is far from the origin.
6. Cost: no profiler -> report a draw-call / pixel-work / overdraw bound, with pixel counts computed from actual size clamps (points x maxPx^2). Compare against the full-screen pixel count to give the ratio. Never invent milliseconds.
7. Vendor ms claims ("~0.1 ms on dev machine"): label "not enough evidence" unless they name device, resolution/render scale, profiler trace (mean + worst case), and scope (GPU vs CPU, includes RT chain?). Record both 'no' decisions (reject full-screen pass with frame-budget arithmetic; reject the untraced ms claim) in the pipeline-rules doc.
8. Verify with a stub-THREE smoke test run under node: shader line count, no sampler/texture calls, uniform sharing across materials, colour conversion vs exact sRGB transfer math, trigger/active lifecycle, particle extent <= declared extent (numeric max over lifetime), dispose(). Keep the smoke test in the agent home, not the deliverables.
