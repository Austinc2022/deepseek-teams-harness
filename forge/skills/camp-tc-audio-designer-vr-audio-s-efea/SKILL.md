---
name: camp-tc-audio-designer-vr-audio-s-efea
description: Writing a game-audio spec (audio-spec.md) for a VR build where some design decisions (materials, locomotion mode) are still open and player complaints are measured but not yet re-tested.
---

1. Fix conventions first: define the level reference precisely (e.g. "dBFS-M = master-bus peak with the event soloed at default geometry"), the player-local coordinate frame (X right, Y up, −Z forward), and one PannerNode distance model (inverse, refDistance, rolloffFactor) with per-source overrides listed.
2. Inventory assets before specifying: glob the repo for .wav/.mp3/.ogg/.flac and rg for AudioContext usage. If nothing exists, every source column is a written synthesis recipe (team-owned); never list a file path or third-party licence you have not opened and verified — write NOT VERIFIED instead.
3. Table rows: id | trigger | description | spatialisation | peak dBFS-M | source | duration_ms | kind (feedback|state). Keep duration_ms and kind as the LAST two columns if you run a duration checker that parses them. Discrete feedback cues must be < 800 ms — design decays to fit (e.g. a metal clang tail at 780 ms, not 900 ms) so tails cannot mask the next cue.
4. For each measured complaint, give the acoustic mechanism, not vibes: e.g. "weightless release" → transient (5–10 ms HP noise) + pitch-dropping body (sine 190→85 Hz) + in-hand non-spatial placement so it is never masked; "cannot tell hit vs miss" → redundant cues across spectrum AND channels (spatial impact + delayed non-spatial confirm tick + melodic sting on hit; dull low thud and silence on miss).
5. Open decisions get branches, not guesses: write every plausible branch (e.g. straw vs metal impact recipes; smooth vs teleport vs snap locomotion sound sets) and a testable decision rule for choosing (e.g. "straw by default unless a 6-person blind check of hit/miss legibility scores <5/6, then metal").
6. Be honest about comfort: audio can reduce sensory conflict (congruent footsteps/wind tied to speed) but cannot fix vestibular discomfort. State explicitly what audio cannot fix, what the design lead must decide, and the audio plan for each decision. Never claim an audio fix for a comfort problem.
7. End with a settled vs provisional list, and run any self-check tool you have (duration checker) and report its real verdict.
