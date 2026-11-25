---
name: learned-camera-facing-ribbon-side-cont-2a8d
description: When building or fixing a camera-facing trail/preview ribbon (strip mesh whose width axis faces the camera) that flips into bowtie/chevron shapes as travel crosses the view ray.
---

1. Symptom: a tapered trail strip renders as hard arrowheads/bowties in stills; the cause is the side vector `side = (cam - p) x dir` being recomputed per sample with no sign continuity — the cross product flips sign when the travel direction sweeps across the view ray (and passes through near-zero width at the crossing).
2. Fix: keep the previous sample's side in a preallocated vector (never allocate per frame); after computing side_i, `if (dot(side_i, side_{i-1}) < 0) negate side_i`, then store side_i as the new previous. Do this in EVERY strip writer (trail, halo, core, preview) — they usually share one geometry-fill loop shape.
3. Test (red first on the old tree): build the scene with the project's fake env (installEnv), put the camera at the field-local origin, and push a path that sweeps past ~0.5 m in front of it (arc of radius 2 centred (0,0,2.5) turns through the view ray). Read the sides back from the written geometry (vertex A = p + side, vertex B = p - side) and assert every consecutive side pair has a positive dot (count flips == 0 AND min dot > 0, expect.soft so both red together).
4. Red on a broken tree is a real geometric sign flip (negative min dot, flip count >= 1); a harness error (missing document/installEnv) is NOT a valid red — fix the harness and re-run the red before the src edit.
5. Common mistake: a single global reused buffer for path prediction breaks callers that hold results across calls — give the buffer to the caller (optional out param) or per-caller buffers, and prove it with a same-object identity test plus the pre-existing held-across-calls tests still green.
