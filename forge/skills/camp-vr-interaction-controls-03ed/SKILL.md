---
name: camp-vr-interaction-controls-03ed
description: Use when implementing VR controller/hand input, grab and point interactions, locomotion with comfort options, a desktop fallback, or the interaction test scene.
---

# VR Interaction & Locomotion Implementation

Use when building or extending a VR interaction module (controller/hand input, grab, point, locomotion, comfort options, desktop fallback) and its test scene.

## Procedure

1. **Define one action layer.** Enumerate device inputs (trigger, grip, thumbstick, hand pose) and map them to device-agnostic actions: `select`, `grab`, `point`, `locomote`, `comfort-adjust`. Gameplay code consumes only actions; device code stays in adapters keyed by hand (left/right), never assuming a controller exists.

2. **Specify interaction state machines before code.** Grab: hover/highlight → grab start (store local attach offset and rotation) → hold (kinematic follow, no physics jitter) → release (restore dynamics only if valid). Point: ray origin/direction, target validation, reticle feedback. Handle both hands independently, including interrupted grabs and controller reconnects.

3. **Make comfort first-class.** Implement smooth locomotion, snap turn with configurable angle, teleport with validated landing, and fade/vignette options. Clamp acceleration and velocity, persist settings, and apply them identically in VR and fallback.

4. **Build desktop fallback on the same actions.** Map mouse/keyboard/gamepad to the action layer: free-look + WASD and click-to-grab/point. The test scene must run without an HMD, deterministically and scriptably.

5. **Create a minimal test scene.** A few grabbables, a pointer target, locomotion surfaces, and a comfort-options panel. Keep it configuration-driven so tests can set states directly.

6. **Verify with TDD and debugging.** Test input mappings, state transitions, grab invariants (no stuck, no dropped, no drift), locomotion bounds, comfort toggles, and fallback parity.

## Handover checklist

- [ ] Every action reachable from both VR input and desktop fallback
- [ ] Grab/point work independently per hand; release and reconnect leave clean state
- [ ] Pointer validates targets and gives clear feedback
- [ ] Comfort options implemented, persisted, and actually applied
- [ ] Locomotion clamped; no NaN/drift across frames
- [ ] Test scene runs headless/desktop without a headset
- [ ] Tests pass for mappings, transitions, invariants, and fallback parity
- [ ] No device-specific constants in gameplay code; known limits reported
