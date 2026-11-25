---
name: learned-vr-kit-first-time-player-revie-f5cd
description: Reviewing a VR starter kit or shared scaffolding (not a single game) through the first-time-player lens: where the player is confused, bored, sick or stuck.
---

1. Map the player journey the scaffolding owns: load/title -> mode entry (enter VR / play on desktop) -> play -> pause/comfort -> session end -> re-enter -> exit-to-menu. The game fills content between these; the kit owns the transitions. Find where each transition can strand the player.
2. Verify every code fix by reading the BASE tree and the delivered tree side by side (Read both — you usually have no shell). Confirm the exact bug is gone and that nothing else changed. Do NOT trust NOTES.md/CHANGES.md.
3. Corroborate each "failing control" quote with transcript_search. An honest run shows the same error text in the builder's AND a verifier's AND a judge's transcripts; a quote found nowhere else is a red flag.
4. For every "restored/reset" claim, check it clears ALL the state the moment touches — translation AND rotation AND that the target DOM is visible+enabled — and that the TEST asserts each. A single matrix element (e.g. elements[0]) proves rotation only. The classic leak: snap-turn writes a pivot offset into world.position (comfort.turnWorld) that a rotation-only reset leaves behind.
5. Rank player harms: crash / soft-stuck (must fix) > scene/state leak > missing menu or affordance > cosmetic. For each name file:line and one concrete fix.
6. Weigh evidence strength out loud: measured (real run) vs simulated (MOCK/emulator) vs argued. A core player bug proven only in MOCK, with no real-browser path (e.g. WebXR missing from headless-shell), is weaker than it looks — say so and name what would measure it (IWER-in-headless-shell, or a headset run).
Common mistakes: trusting the builder's notes; calling a MOCK test "proof" the player won't be stuck; missing that startDesktop/showDom(false) hides the title and strands the player with no menu back; accepting a very low canvas-variance threshold as "rendered".
