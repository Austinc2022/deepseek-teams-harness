---
name: camp-audio-design-spec-3b2e
description: Use when defining the audio design for a game, VR/WebXR experience, app or interactive product, especially when the deliverable is an audio-spec.md with a sound inventory, music layers and feedback rules.
---

# Audio Design Spec

Use when defining sound for a game, VR/WebXR experience, app or interactive product and the deliverable is an `audio-spec.md` covering spatial sound, music and feedback.

## Procedure

1. Establish context: genre, setting, user perspective, target platforms and audio middleware (Web Audio, FMOD, Wwise, Unity), and existing visual/UX design. Write assumptions down; do not ask questions in unattended runs.
2. Build the sound inventory. For every sound (UI, feedback, ambience, character, event, alert) specify:
   - ID and name: stable and unique (e.g. `ui_confirm`).
   - Trigger: exact event or state, conditions, cooldown, priority and overlap rules.
   - Spatialisation: 2D/global vs 3D positional, emitter attachment, attenuation model, min/max distance, rolloff, occlusion, HRTF/binaural needs, panning rules.
   - Length: duration in ms/s, one-shot vs loop, tail/reverb, maximum concurrent instances.
   - Mix level: target loudness (LUFS/dBFS), bus (music/sfx/voice/ambience), gain in dB, fades, ducking and headroom for overlaps.
3. Design music layers: stem/instrumentation, tempo and key, intensity, the states that add/remove layers, crossfade times and sync (bar/beat vs immediate), stingers, and a state-to-layer matrix.
4. Define feedback semantics: map actions and system states to positive/negative/neutral sonic feedback; include captions or visual equivalents, mono compatibility, loudness comfort and mute/volume controls.
5. Write `audio-spec.md`: context and assumptions, sound table, music state matrix, bus/mix architecture, accessibility notes and open questions for implementation.

## Verify before handing over

- [ ] Every sound row has trigger, spatialisation, length and mix level — no blanks
- [ ] Triggers are unambiguous; overlap, cooldown and voice-limit rules stated
- [ ] Spatialisation matches platform/API capabilities and the listener perspective
- [ ] Durations, loops and concurrency limits are realistic
- [ ] Mix levels and bus routing avoid clipping; ducking behaviour specified
- [ ] Music matrix covers all states and transitions with crossfade/sync rules
- [ ] Accessibility and mono compatibility addressed
- [ ] Unknowns listed as open questions rather than guessed
