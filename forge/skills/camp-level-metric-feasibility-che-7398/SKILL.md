---
name: camp-level-metric-feasibility-che-7398
description: level-metric-feasibility-check
---

Use this before handing over levels.md or any layout spec that states distances, heights, areas or traversal times. Every number in a level doc must be feasible for a real player, not plausible-sounding.

1. **Pin the motion constants first.** Write down the player's assumed locomotion (walk speed, sprint speed, teleport range or dash distance, snap-turn angle, crouch/jump capability, interaction reach envelope — typically 0.4–2.0 m high and ~0.7 m deep from the body). If the project's GAME.md, controls spec or kit defaults define these, cite them; otherwise mark the numbers ASSUMED and state the value used.
2. **Convert every traversal to time.** For each stated path segment, compute time = distance ÷ speed and print it next to the distance (e.g. "40 m corridor @ 1.4 m/s ≈ 29 s"). Compare against the pacing claim for that beat: a 'brief breather' cannot be a 60-second empty corridor; a 'tense chase' cannot be over in 5 seconds. Fix or flag every mismatch.
3. **Check encounter spaces against the locomotion type.** Arena width/depth must allow the stated movement: circle-strafe fights need at least ~4–5 m clear diameter for smooth locomotion; teleport-only combat needs cover-to-cover spacing within teleport range. Note ceiling height for anything vertical (climbing, throwing arcs, flying enemies).
4. **Check verticality and comfort.** Key interactions should sit in the comfortable reach band; anything the player must repeatedly look up at or reach above ~1.9 m is a fatigue/comfort defect. No beat should require continuous smooth rotation or sustained artificial acceleration unless a comfort option is specified.
5. **Audit every metre figure.** Go through the doc line by line: is each distance/height/area actually written, and is it derived or guessed? Remove false precision ("37.2 m" with no basis) — either justify it or round it and mark it approximate.

**Verify before handover:** every path segment has distance + derived time; every encounter states its playable area; motion constants are cited or explicitly marked assumed; no comfort violations; no number contradicts the pacing word used for its beat. Common mistakes: writing distances that make the stated session length impossible, ignoring vertical reach, and stating per-level play-time targets without any segment times to support them.
