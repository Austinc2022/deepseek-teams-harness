---
name: camp-tc-gameplay-interaction-head-45f6
description: Verifying a VR/WebXR interaction module (picking, grab/release reparenting, snap-turn/teleport, comfort vignette, dispose) without a headset or browser.
---

1. Stub the DOM before calling any factory (never touch `document`/`window` at module top level): fakeEl with style object, textContent, appendChild/remove that track parent+children, getBoundingClientRect returning a fixed canvas rect; collect window/canvas listeners in maps so tests can fire synthetic events.
2. Use real three.js (Scene, PerspectiveCamera on a yaw rig Group as camera.parent) and a plain `renderer = { domElement: fakeCanvas(), xr: undefined }` so the desktop-fallback path (navigator.xr === undefined) is what actually runs.
3. Drive the module only through its public surface: createInteraction(...).update(dt)/dispose()/state. Accumulate time with a fixed step loop (e.g. 0.01 s) — cooldowns and vignette envelopes are far easier to assert against exact step sums than wall-clock.
4. Convert 3D objects to fake pointer events by projecting world position to NDC then to client coords via the same rect the stub returns; fire 'mousemove' before 'click', and make click handlers accept events without clientX (reuse last pointer) since synthetic clicks often carry no coordinates.
5. Assert exact numbers where the contract implies them: snap angle as rig.rotation.y vs Math.PI/4 within 1e-9, cooldown by pressing twice inside and after the window, vignette style.opacity strictly '0' at rest and again at total-envelope-time after the event.
6. Test reparenting grabs explicitly: parent identity after grab (under camera/controller), then parent AND local position restored after release.
7. Test gates twice: one instance with gates on, a second with gates off sharing the same listener maps (dispose the first before firing events on the second — shared stub maps deliver to every live instance).
8. Make dispose() idempotent and assert overlay/listener removal via the stub's children/parent bookkeeping.
9. Common mistakes: raycasts that hit helper geometry (beacons, markers) occluding farther pick targets — keep helper meshes off the pick axis or off-center; strictEqual on style.opacity requires assigning the string '0', not a number; imports hoist, so DOM stubs must be set up before factories run, not before module import.
10. For the browser side (index.html), at minimum extract and `node --check` the inline module script; a real browser run still needs a display you may not have — say so in the report.
