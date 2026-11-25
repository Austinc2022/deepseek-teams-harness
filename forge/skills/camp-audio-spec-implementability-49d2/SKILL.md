---
name: camp-audio-spec-implementability-49d2
description: Before handing over audio-spec.md: verify every sound entry is implementable against the actual engine/kit — triggers map to real events, spatialisation parameters exist, worst-case voice count fits the cap, mix levels sum within master gain, and music layer changes are bound to real game states.
---

# Audio-spec implementability check

Use before handing over an audio-spec.md: the spec reads well, but nothing proves the engine can actually play it. This check runs the spec against the code/kit and flags entries that will not survive implementation.

## Steps

1. **List the engine's real audio events.** Open the kit/game source (audio manager, event bus, interaction code). Write down every event a sound can actually hook: `onGrab`, `onRelease`, `onHit`, `onSuccess`, `onFail`, `onStateChange`, music layer triggers. Keep the list next to the spec.
2. **Map every sound to an event.** For each row in the sound list, the trigger column must name one of those events (or a clearly documented state enter/exit). A trigger like "when the player feels excited" or "on collision with soft objects" is not an event — rewrite it or mark it UNIMPLEMENTABLE.
3. **Check spatialisation against supported parameters.** Only claim what the engine exposes: typically position, distance model/rolloff, and maybe stereo pan. If the spec says "HRTF head-traced binaural" and the engine only does `PannerNode` distance rolloff, downgrade the spec to the truth.
4. **Check length and playback budget.** Note the engine's voice/concurrent-sound cap (e.g. 12–16 voices). Count worst-case simultaneous triggers per scenario (all sounds that can fire in one second during peak play). If the count exceeds the cap, specify which sounds are priority and which are dropped or stolen.
5. **Check mix levels add up.** Put every level on one scale (linear gain or dB). Verify the sum of worst-case simultaneous sounds does not exceed the master gain/clip cap. Confirm ducking rules exist for music-vs-voice and music-vs-critical-SFX, and that no two sounds are specified at the same level when one must clearly cut through.
6. **Check music layers are state-bound.** Every layer change must name a concrete, observable game state (screen, mode, or counter) that exists in code, plus the transition behaviour (crossfade length or hard cut).

## Verify before handover

- [ ] Every trigger names an engine event found in source, or is flagged.
- [ ] Every spatialisation claim matches parameters the engine exposes.
- [ ] Worst-case simultaneous voices ≤ cap, with a priority rule if not.
- [ ] Levels are on one scale; peak sum within master/clip limit; ducking specified.
- [ ] Every music layer change names a real state and a transition.
- [ ] Any spec line that failed a check is either corrected or explicitly marked as a gap with the reason.

## Common mistakes

- Inventing triggers the game never fires (check the interaction code, not the design doc).
- Mixing dB and linear gain in the same table so the mix cannot be summed.
- Assuming unlimited voices because the spec was written before the engine was known.
- Leaving "spatialised: yes" with no distance model, so the implementer guesses.
