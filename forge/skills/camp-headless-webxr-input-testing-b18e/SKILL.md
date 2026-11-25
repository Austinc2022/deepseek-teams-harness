---
name: camp-headless-webxr-input-testing-b18e
description: When writing or fixing interaction code in src/interaction/ (grab, point, locomotion, comfort options, desktop fallback) and you must prove it works without a real headset before handover.
---

# Headless WebXR input testing

You are testing VR interaction code (grab, point, locomotion, comfort options, desktop fallback) when no headset is attached. Prove behavior with synthetic input, not claims.

## 1. Keep interaction logic runnable without a browser
Structure each interaction as pure logic: input state (buttons, axes, head/hand poses, frame delta) in → intent objects (e.g. `grab-start`, `teleport-request`, `turn-snap`) out. Put three.js scene wiring in a thin adapter. Pure logic must be testable under Node with plain objects; no `navigator.xr`, no renderer.

## 2. Two test layers
- **Logic unit tests (Node):** fake XR input state — controller poses, grip/trigger values, thumbstick axes, `handedness`, and connection/disconnect events.
- **In-browser smoke:** drive session lifecycle (enter → end → re-enter) and controller connect/disconnect through a mocked/patched `XRSession` and `XRInputSource` array (or an XR emulator layer). Use the `learned-headless-shell-smoke-and-brows-292e` skill to run it on the cached headless shell.

## 3. Every interaction gets these cases
- engage (press/grip past threshold), hold, release
- cancellation mid-action (session end or controller loss while grabbing — the held object must be released or restored)
- hysteresis/debounce: a jittering trigger value near the threshold must not retrigger
- handedness: same behavior left and right

## 4. Locomotion cases
- movement integrates per frame using frame delta, not wall clock; speed is clamped
- teleport: only valid floor positions resolve; invalid targets cancel cleanly
- snap-turn: exact angle per snap, no drift after N snaps
- smooth locomotion: vignette strength tracks speed; comfort toggles actually change behavior (snap vs smooth turn, teleport vs smooth locomotion, vignette on/off)

## 5. Desktop fallback parity
For the same logical action (grab, drop, move, turn), assert the keyboard/mouse path produces the same intent object as the XR path. Any divergence is a bug, not a feature.

## Handover checklist
- [ ] All interaction tests green; run them once with a deliberate mutation in the binding code and confirm a test fails (failing control)
- [ ] No test requires real hardware
- [ ] Desktop fallback parity asserted for every mapped action
- [ ] Report honestly which paths are simulated vs. device-tested; never claim a headset-tested result you did not run

## Common mistakes
- Testing against the real `navigator.xr` in Node (unavailable) and giving up instead of extracting pure logic
- Forgetting the cancel paths — they are where handover demos break
- Asserting only the happy path of teleport/turn while ignoring clamp and drift
