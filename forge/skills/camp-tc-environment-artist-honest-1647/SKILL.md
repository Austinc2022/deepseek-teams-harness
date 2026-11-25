---
name: camp-tc-environment-artist-honest-1647
description: Measuring a three.js/WebXR scene against art caps (triangles, draw calls, textures, lights) and verifying named anchors read from a fixed camera.
---

1. Build the scene through a pure builder function (e.g. buildScene(THREE)) with zero counters inside it; measure only by traversing the built graph in a separate script, so nothing can be tuned to fool the counter.
2. Triangles: per mesh use (geometry.index ? index.count : position.count)/3 and multiply by InstancedMesh.count — counting unique geometries once is the classic undercount failure. Verify the total is an integer.
3. Draw calls: one per mesh (or per material group if material is an array), plus one per shadow-casting light pass; THREE.Points and other non-mesh renderables still cost one draw call each even though they add zero triangles.
4. Textures: traverse every material property for isTexture; solid-colour materials legitimately give 0.
5. Anchor "reads from spawn" is three tests, not one: in front of camera (dot with forward > 0), inside the FOV frustum (THREE.Frustum.containsPoint), and line-of-sight unoccluded via Raycaster from camera to the anchor point. Filter the anchor's own subtree from hits, and filter isPoints hits (raycastable sprites can't occlude).
6. Check occlusion of the anchor's BASE point too, not just its center — a landmark whose base is hidden behind a foreground prop reads as a floating object.
7. Never claim a browser pass without a browser console; write "browser not verified". For module resolution in a preview HTML, use an import map or a real relative vendored path; a bare "three" specifier fails on load, so un-measured "green" numbers prove nothing.
8. Show arithmetic on at least one row in the budget doc (e.g. lathe = (profilePoints-1)*radialSegments*2) so a reviewer can reproduce it.
