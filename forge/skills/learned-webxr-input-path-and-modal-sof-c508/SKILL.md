---
name: learned-webxr-input-path-and-modal-sof-c508
description: Reviewing any WebXR game build (kit-based or not) before a gate or critique verdict, especially when the evidence runs are bot-driven and no headset is available.
---

1. Trace every writer of the input record's action flags (e.g. input.press / set): grep for `\.press\s*=` and list each site. Classify each as reachable by a human in XR, by desktop, or only by a bot. If the XR path writes `false` unconditionally and only the bot/desktop write truth, the primary platform's action is dead — no evidence run can catch it, because the bot bypasses the gamepad layer.
2. Check gamepad binding consistency: positions are often reordered by handedness (XRInput.read sorts slots into L/R) while buttons are read from `session.inputSources[i]` by raw array index (order is not specified in WebXR). Buttons must bind through the same handedness/slot mapping as positions (or read the same sources object the positional reader used).
3. Model the modal card state machine: for every showCard caller (pause, visibility pause, result, end), assert that pausing over another card either stashes+restores it or that the game re-shows it. A latched flag (resultShown) plus hideCard() in resume()/resetPlay() is a soft-lock signature: ended state + hidden card + no re-show branch = unrecoverable without reload.
4. Check tracking-loss handling: if a Presence/lost-watch class is stepped per frame but its return value is never consumed (no pause, no UI), the promised 'hands lost' behavior does not exist.
5. Verify every Controls line in the game's docs against a file:line in src before trusting it; bot-driven evidence never exercises XR buttons, so docs written from the brief rather than the code are where unimplemented verbs hide.
6. Craft-read the screenshots for sprite-based shells (THREE.Points default square sprites = 'disco ball'), and check the moment-of-match shot: a target shell at the same radii as the matched mesh with opacity ~1 occludes the settle beat — fade the shell as match -> 1.
Evidence strengths to report: code-path findings = measured by reading (deterministic); runtime-on-device behavior argued from the WebXR spec (inputSources order) = argued, needs one headset pass to confirm.
