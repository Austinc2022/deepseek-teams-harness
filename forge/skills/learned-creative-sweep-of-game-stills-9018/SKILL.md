---
name: learned-creative-sweep-of-game-stills-9018
description: When reviewing a VR/WebXR game build's screenshots against its GDD look recipe and first-60-seconds beat sheet (critique panel, creative-direction lens).
---

1. Open every PNG in screenshots/ from pixels (hero, t12s, gate1, one act still per act, endcard, desktop). Never trust the builder's craft-read claims.
2. Frame-clipping: check every caption/HUD panel against the frame edges. If a panel rectangle touches or crosses an edge, compute the geometry (panel world y + half height vs camera eye height and vfov) and cite the position line as the fix target.
3. Motion identity: the look recipe's signature moving elements (comet trail, aiming arc) must appear in at least one still. If every still is a parked/relaunching moment, the evidence set cannot show what the game looks like in motion - name it and require one deliberate mid-flight shot.
4. Mass hierarchy, not just brightness: count near-black shapes vs the focal object per frame. Dormant/background geometry that out-masses the target reads as clutter even when the brightness order is correct.
5. Beat-sheet fidelity: map each named still (t12s, gate1) to what the caption/UI actually shows. Shot triggers (poll-based) often land in recovery/assist states - verify the intended beat (launch, first pass) is what the pixels show.
6. Doc/code contradiction: re-derive any timing claim in GAME.md (e.g. "marker appears at 24 s") from the source; a grep of the assist trigger settles it in seconds.
7. Payoff frame: the end card must carry the promised finale image ("the sky is singing" needs a singing sky). A bare card over an empty gradient is a taste failure even if the tests pass.
Common mistake: passing a still because the craft checklist (a-g) says 'yes' while the frame is crowded with black hoops or the signature trail is absent - checklist green does not mean the frame would make a player show it to a friend.
