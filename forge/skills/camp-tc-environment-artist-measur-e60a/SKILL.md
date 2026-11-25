---
name: camp-tc-environment-artist-measur-e60a
description: Building a three.js environment scene deliverable that must ship with measured triangle/texture/draw-call counts against a fixed budget.
---

1. Install three.js locally first: create a minimal `package.json` (`"type":"module"`) in the ticket folder BEFORE `npm install three` — otherwise npm walks up and tries to hoist into a parent dir outside the sandbox and fails with EPERM.
2. Author `scene.js` as pure scene construction: `buildScene()` returns a real THREE.Scene + lights. No renderer/DOM, so the same module runs in Node (measurement) and browser.
3. Textures: generate procedural `THREE.DataTexture`s (Uint8Array noise) in-module — nothing fetched, so "actually assigned" is literal and measurable; never create a texture you don't attach to a material.
4. Budget math up front: N×N-segment plane = 2N² tris; CircleGeometry(n) fan = n tris; merged parts (BufferGeometryUtils.mergeGeometries, must match indexed-ness and attribute sets) count once for draw calls. Keep count margin for other teams.
5. `measure.js`: traverse the built scene, triangles from `index.count/3` (or `position.count/3` non-indexed), textures via `isTexture` scan over material keys, draw calls = one per Mesh. Exit non-zero over budget.
6. Write `budget.json` with a node script that runs measure.js via execFileSync and embeds the stdout byte-exact into the `measured` field — never paste it by hand. Re-run and diff afterward to prove determinism (noise must be hash-based, not Math.random).
7. Structural spot-checks beyond counts: for shaped geometry with holes (e.g. arch in a wall), assert the hole contour exists AND sample vertices in the opening region to prove it's clear; assert exactly the intended lights exist and no mesh has castShadow/receiveShadow.
8. README must state plainly what was run (Node only) and what was not (browser/GPU/in-headset). Never claim browser verification without running one.
