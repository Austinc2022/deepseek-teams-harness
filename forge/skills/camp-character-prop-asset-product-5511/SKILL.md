---
name: camp-character-prop-asset-product-5511
description: When building or revising a character or interactive prop in src/art/props/: spec, triangle/material budget, code structure, preview-page registration, verification checklist.
---

Use whenever you build or revise a character or interactive prop in src/art/props/.

## 1. Specify before you model
- Write a one-paragraph asset spec first: what it is, silhouette, size in world units, which interaction states it needs (idle, hover, grab, use, break...), and whether it is a hero character, hero prop, or filler prop.
- Look at 1-2 existing assets in src/art/props/ and copy their conventions: module shape, export names, units, material setup. If src/art/pipeline-rules.md exists, read it and follow its budgets.

## 2. Budget it (state the numbers)
Set and record hard numbers before building, per class:
- Hero character: ~3-8k triangles; hero prop: ~1-3k triangles; filler prop: under 500 triangles.
- At most 1 draw call and 1-2 materials per prop; textures max 512px (1024 only for hero characters).
- Zero allocations in the per-frame path: no `new` inside update(), no geometry edits per frame.
Report the measured triangle count and draw calls in the handover.

## 3. Build in code
- Prefer procedural Three.js geometry (merged BufferGeometry, vertex colors) or a loaded GLTF; keep every asset in its own module with a named factory export (e.g. `createBeacon()` returning a Group) plus its animation clip names.
- Make it disposal-safe (traverse and dispose geometry/material on removal) and origin-stable (the pivot at the object's base/interaction point, no root drift).
- Match the kit's lighting: use the scene's existing lights, no baked-in emissive hacks to fake lighting; emissive only for elements that genuinely glow.

## 4. Register on the preview page
Every asset must appear on the preview page (src/art/props/ preview/demo) with its name, a way to orbit it, and buttons or a timeline to play each animation state. An asset not on the preview page is not done.

## 5. Verify before handing over
- Run the preview page through the headless smoke/browser check: it loads, zero console errors, zero NaN positions.
- Screenshot each asset from the preview page and check the silhouette reads at small size.
- Count triangles/draw calls (measured, not estimated) and confirm they are within the budget you stated.
- Checklist to include in the handover: spec paragraph, budget numbers vs measured numbers, list of animation states wired, preview-page path, screenshot evidence.
