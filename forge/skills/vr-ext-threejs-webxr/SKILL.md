---
name: vr-ext-threejs-webxr
description: "WebXR in three.js and R3F: AR placement with hit testing, VR sessions, controllers, hands, DOM overlays, XR scale and performance rules. Use when a scene opens in a headset or places a model in a room. Hands off to `web3d-model-viewer`."
---
<!-- downloaded 2026-11-24T15:33:10.989Z from github.com/emiliodominguez/threejs-skills skills/threejs-webxr/SKILL.md; audited by vr-auditor. This is guidance from the internet: the agent's own hard rules come first. -->

# WebXR

WebXR runs three.js scenes in headsets (immersive VR) and on phones (immersive AR with hit testing). Support is
uneven, so decide the target first:

- Android Chrome: immersive AR with hit test, anchors, DOM overlay, light estimation.
- Meta Quest browser: immersive VR and passthrough AR, controllers and hands.
- Apple Vision Pro Safari: immersive VR with hand and gaze input.
- iPhone Safari: no immersive WebXR. For "view this product in my room" on iOS, use `web3d-model-viewer`
  (Quick Look), which also covers Android with less code.

## Process

1. Model scale is meters in XR, always: a 180-unit centimeter model fills the room. Inspect and fix scale first
   (`threejs-model-inspect`).
2. Read the recipe for the stack: `references/vanilla.md` (three's `XRButton`/`ARButton`, `renderer.xr`) or
   `references/r3f.md` (`@react-three/xr` 6: `createXRStore`, `<XR>`, hit-test hooks).
3. Render with `renderer.setAnimationLoop` only; `requestAnimationFrame` stops inside an XR session. In R3F this is
   automatic.
4. Request only the session features you use (`hit-test`, `anchors`, `dom-overlay`, `hand-tracking`,
   `light-estimation`); missing optional features must degrade, not crash.
5. Light AR content from the real room when possible (`XREstimatedLight` in vanilla), or at least with an
   environment map, so placed models do not look pasted on.
6. Hold 72-90 fps on the headset: halve draw calls and texture sizes compared with desktop, avoid post-processing,
   and keep the pixel ratio at the device default (the XR framebuffer sets it).
7. Test on the real device. Desktop browsers can emulate sessions (the Immersive Web Emulator extension), which is
   fine for logic, not for comfort or performance.

## Anti-patterns

- Moving the camera in XR; the headset owns it. Move a parent of the content (or the XR origin) instead.
- Showing an "Enter AR" button without checking `navigator.xr.isSessionSupported("immersive-ar")`.
- Placing models without hit testing, so they float or sink in the room.
- Large text in 3D canvases for UI; use DOM overlay on phones and readable, world-anchored panels in headsets.

## Done when

- The session starts from a user gesture on the target devices, and unsupported devices see a fallback.
- Placed or VR content is at real-world scale and lit to match.
- Frame rate holds on the target headset for a full minute of movement.

Next: `web3d-model-viewer` when the requirement is only product AR.
