---
name: camp-tc-audio-designer-audio-spec-9181
description: A drafted VR/game audio spec must be audited against a feedback/spatial/licensing acceptance bar before handover.
---

1. Fix the core-action list from the brief first (do not let the draft redefine it). Check (a) coverage: every core action has a named sound AND the sound is usable (a non-compliant asset means no sound in practice). Challenge "no other cues needed": look for unnamed states — level start/count-in, non-win level end, co-trigger rules (what stacks on one event).
2. Check (b): every source marked 3D/spatial must state position (which node, from the brief's layout facts) and falloff (distance model, refDistance, maxDistance, rolloffFactor). Non-spatial sounds must be declared 2D/head-locked. Undefined spatiality = fail. "Loud" is not a mix level: require numbers on ONE scale (state the scale, e.g. dBFS peak per voice) for every sound, plus a worst-case simultaneous sum against the master/clip limit and ducking rules.
3. Check (c): each sound and the music needs a named source (URL + author + asset id) with a verified licence, or a synthesis recipe. "A website I bookmarked / check licence later" is an automatic fail — verify licence claims by fetching the source page yourself, never from search snippets. If the rule is CC0 + licence file in the game folder, state the licence-file path/credits requirement explicitly even for CC0.
4. Rhythm games: the metronome is the gameplay timing authority. Free-running music with its own tempo conflicts with it — require tempo-locked or rhythmically neutral music, constant metronome level, and state-bound music transitions (start/stop/duck named to real states).
5. End with (i) unmet items quoting the failing draft lines, (ii) the corrected table, (iii) a plain yes/no on any disputed asset plus a compliant alternative, (iv) a "cannot verify without a build" list (engine panner params, audio-clock vs render-loop scheduling, in-headset loudness, voice cap).
