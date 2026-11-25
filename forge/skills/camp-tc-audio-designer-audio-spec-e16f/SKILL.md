---
name: camp-tc-audio-designer-audio-spec-e16f
description: When reviewing a game-audio spec on a build gate against acceptance criteria like (A) feedback sound per core action, (B) position+falloff per spatial source, (C) licence-or-synthesis per sound.
---

1. List the core actions from the brief (correct/incorrect input, missed beat, milestone triggers) and map each to exactly one spec entry; a shared sound for two actions is fine if its trigger text names both. If any action maps to nothing, criterion A fails.
2. List every sound that is spatial (or whose spatiality is ambiguous). For each, the spec must state BOTH an emitter position (e.g. "one emitter per pad, at pad centre") AND distance behaviour (falloff curve + min/max distance). "Spatialised around X" with no distance line = B fail. If 2D UI sounds are mixed in, the spec must explicitly declare them non-spatial, or they count as spatial sources missing data.
3. Per sound, require exactly one provenance: a licence (name it; CC0/public-domain/royalty-free with a source) OR a synthesis recipe (waveform + filter/decay). Watch for contradictory licences — e.g. "CC0" alongside "free for personal use" cannot both be true; treat as unstated. "Sample", "to be chosen later", "we'll write the code later" are not provenance unless the synthesis method is spelled out.
4. Verify discrete feedback cue durations are < 800 ms using the check_sound_durations tool (rows must end `| <n> ms | feedback |`); continuous/loop sounds are state, exempt. Don't fabricate durations for sounds the spec never timed.
5. Verdict FAIL if any of A/B/C fails; quote the exact offending lines verbatim; give MINIMUM edits (replace one phrase or add one line each), never a rewrite. Always name one thing the spec does well. Keep the whole verdict under 1,500 words.
