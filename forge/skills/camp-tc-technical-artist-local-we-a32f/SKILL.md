---
name: camp-tc-technical-artist-local-we-a32f
description: Building or reviewing local VFX feedback effects (no post-processing) for a mobile-WebXR build with a strict GPU/draw-call budget and sRGB output.
---

1. Read the action budget first; write each effect as a plain ES module: `COST` string + factory `createX(THREE, opts) -> { mesh, update(dt), dispose() }`. No renderer/XR imports.
2. Colour space: keep palette sRGB hex as constants, convert to linear exactly once on the CPU (`new THREE.Color().setHex(hex, THREE.SRGBColorSpace)`, plus `convertSRGBToLinear()` only if ColorManagement is off — never both). Name uniforms for what they carry (`uColorLinear`). A hex pasted as raw channel floats into a uniform is the classic double-encode bug (looks too bright/orange under `outputColorSpace = SRGBColorSpace`).
3. Keep effects local: ring/points/quads in a bounded footprint, ≤2 draw calls, ≤2 additive layers, no full-screen/clip-space quads, no scene-colour reads. "1 draw call = cheap" is NOT a cost argument — pixel count is.
4. COST arithmetic, not adjectives: fragments = points×disc px or quad px area; state layers, draw count, est. ms, and label it an estimate if no on-device timing exists. For stacked quads, write the overdraw sum explicitly.
5. Self-dispose ≤1.5 s; `update(dt)` writes uniform scalars only (zero allocations after warm-up); `dispose()` frees geometry/material, detaches parent, idempotent.
6. Verify: `node --check` each module (modern Node parses ESM in .js), then run a lifecycle smoke test with a minimal THREE stub (BufferGeometry/PlaneGeometry/ShaderMaterial/Points/Mesh/Group/Color) driving `update(0.05)` until it returns false; assert return shape, lifetime ≤1.5 s, dispose idempotence. Stub gaps (missing class) are test bugs, not module bugs — check the stub first.
7. End review docs with one honest line naming missing evidence (e.g. "no on-device GPU timing").
