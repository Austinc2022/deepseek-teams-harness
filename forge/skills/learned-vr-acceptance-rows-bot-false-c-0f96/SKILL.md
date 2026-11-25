---
name: learned-vr-acceptance-rows-bot-false-c-0f96
description: Writing or reviewing acceptance/playtest rows for a VR game that will be verified by automated (bot/headless) runs as well as humans.
---

1. Tag every row with one of: PASS-TESTABLE (a bot/headless run can genuinely prove it), BOT-FALSE-CLEAR (a clean bot run does NOT prove it), OPEN-RISK (no in-sandbox run can close it; carries to GAME.md as open risk).
2. BOT-FALSE-CLEAR pattern: rows about comfort feel, quitting, persistence across restart, or forgiveness/assist behavior pass in headless smoke while failing for real players (bots never feel motion, never need to quit, never get frustrated). For each such row, write the human probe that would close it (e.g. n>=5 pilot, first-success time on a human clock) and keep the row open until that probe runs.
3. Capability vs discoverability: an affordance row must count unprompted first uses, not whether the interaction is possible. "Verb works" and "player knows the verb exists" are different rows or different FAILS IF clauses.
4. Clock rules: measure fun-latency on the player clock from first rendered frame, never on the tutorial clock; scripted/tutorial-gated success inflates the number. Tie any accelerated test run's time-scale to the game's audio/clock source and require the evidence to state it.
5. Watch for modality gaps: if no row covers a failure mode (e.g. muted device audio, hand-tracking-only controllers), list it as residual risk rather than assuming the default device state.
6. Numbers: every row needs a threshold (seconds, degrees, dB SNR, cm) and an explicit FAILS IF clause; tag rows in the deliverable so the reviewer can sort them.
