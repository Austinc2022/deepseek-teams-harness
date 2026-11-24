---
name: camp-level-scene-design-0a63
description: Use when designing game levels or scenes and writing levels.md: metric layouts, player path, pacing beats, encounters, and how each mechanic is taught.
---

# Level and Scene Design

Use to produce or revise `levels.md`, with one consistent section per level/scene.

## Procedure

1. **Gather inputs.** Read the mechanic list, game pillars, target play time, platform/engine limits, and player capabilities (speed, jump, sight range). If a needed number is missing, state it as an explicit assumption in the doc.
2. **State intent.** Give a one-sentence level fantasy, the mechanics it teaches or reinforces, and the player's entry/exit state (what they can do arriving vs. leaving).
3. **Draw the layout in metres.** Choose and state a coordinate convention (origin, axes, 1 unit = 1 m). Give overall extents plus room/corridor dimensions. Include a simple top-down ASCII map and a dimension table. Label landmarks, sightlines, cover, elevation, chokepoints, hazards, spawn, objectives, checkpoints, and exit.
4. **Define the player path.** List ordered waypoints with cumulative metres and expected seconds at the stated movement speed. Mark the main route, optional branches/shortcuts, every decision point, and the visual cue at each. Ensure no required route depends on a mechanic not yet taught.
5. **Lay out pacing beats.** Sequence arrival/orientation → teach → safe practice → test → peak → release → reward, with time and distance budgets. Alternate tension and recovery; no two high-intensity beats back-to-back. Show the difficulty ramp within and across levels.
6. **Specify encounters.** Table per encounter: ID, coordinates, trigger, actors/hazards, intended solution, mechanic tested, expected duration, fail state, checkpoint/reset, reward, retry cost.
7. **Build the teaching map.** For each mechanic: where it is demonstrated safely, practised, tested under pressure, and combined with earlier mechanics. Name the visual/audio feedback for success and failure.
8. **Write the doc.** Use identical headings per level: Intent, Layout (metres), Player Path, Pacing Beats, Encounters, Teaching Map, Open Assumptions.

## Verify before handoff

- [ ] Units, coordinates, map, and dimension table agree; distances are plausible for stated movement speed.
- [ ] Every waypoint, objective, and exit is reachable; no dead ends or unintended skips.
- [ ] Each mechanic has demonstrate → practise → test → combine, in dependency order.
- [ ] Pacing alternates tension and recovery and matches the target play time.
- [ ] Each encounter has trigger, goal, failure, checkpoint, and reward; difficulty ramps.
- [ ] Landmarks make every decision point legible.
- [ ] All assumptions and unresolved numbers are listed, not hidden.
