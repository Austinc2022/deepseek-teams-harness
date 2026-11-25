---
name: camp-prop-animation-authoring-4304
description: When a character or prop needs animation states (idle, hover, grab, use) authored and wired to interaction: clip authoring, mixer state machine, verification checklist.
---

Use whenever a character or prop in src/art/props/ needs animation: idle loops, hover feedback, grab/use one-shots, or state transitions.

## 1. List the states first
Enumerate the interaction states the host can trigger (idle, hover, grabbed, used, released, broken...). For each, write: trigger event, clip name, loop or once, duration, and the feeling it must convey. Keep total clip count small: 2-5 states per asset.

## 2. Author the clips
- Use THREE.AnimationMixer + AnimationClip with named tracks targeting the asset's own nodes (`groupname.position`, `.rotation`, `.scale`). Keyframe counts should stay lean: 3-8 keys per track for short moves.
- Loop clips must be seam-clean: first and last keyframe identical in transform, no velocity jump at the loop point.
- One-shots need anticipation and follow-through (overshoot then settle), and easing that is not linear (`CubicBezierInterpolant` or stepped keys). Roughly: hover/feedback 150-250ms, grab 200-400ms, use/impact 300-700ms.
- No root motion: animate children or an inner group, never the exported root's world position, so the prop stays where the game placed it.

## 3. Wire the state machine
- Expose a small controller on the asset (`setState(name)` or an actions map) rather than letting callers poke the mixer. Map every interaction event to exactly one action.
- One-shots: `clampWhenFinished = true`, `LoopOnce`, and reset to idle on `finished`. Transitions between loops: `crossFadeTo` over ~0.15-0.3s, never snap.
- Only one mixer update per frame per asset, called from the scene's existing update loop; pause the mixer when the asset is hidden.

## 4. Verify before handing over
- On the preview page, play every state and every transition (idle→hover→grab→use→release→idle) and watch for popping, seam jumps, or drift from the origin.
- Screenshot the extremes of each clip (start/mid/end) as evidence.
- Confirm in code there is no per-frame allocation in the update path and no clip plays when its trigger cannot fire.
- Handover checklist: state table (trigger / clip / loop / duration), transition list, evidence screenshots, any state deliberately not animated and why.
