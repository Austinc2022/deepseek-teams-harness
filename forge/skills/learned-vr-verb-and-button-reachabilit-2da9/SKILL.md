---
name: learned-vr-verb-and-button-reachabilit-2da9
description: Playtest critique or close-out review of any VR game where players press buttons (Set/cards/menus) or use gesture verbs — especially when the evidence suite is bot-driven.
---

Bot/evidence runs hide unreachability: bots set input flags programmatically and auto-press card ids, so a green 12/12 run can coexist with a player who cannot advance. Audit every player-facing verb and button per platform:

1. List every verb/button the brief and GAME.md promise (e.g. Set, card buttons, rotate, pause, squeeze). For each, find EVERY writer of the input flag in src/ (grep for the field, e.g. `.press`, `buttons[`, `grip`) and every picker of the UI (grep `hover`, `pick`, `hit`, `click`).
2. Platform matrix: XR controllers, XR hands, desktop, bot. A verb is SHIPPED only if a non-bot path sets its flag on that platform. Check comments against code — a comment 'Space / A / X = Set' does not make A/X read.
3. Card/button reachability: trace the pointer's live gate (e.g. `pointer.update(app, live)`) to what the caller passes. Cards shown OUTSIDE pause are the classic miss. Compare with the base kit's call if forking — a changed gate argument is a regression red flag.
4. Modal-over-modal: what happens if the player pauses (or any other card opens) while a result card is up? If showCard replaces the card and drops its callback, and no re-show path exists, the player is permanently stuck.
5. Frame-space check for any rotate/transform verb: after the object rotates, are hand positions transformed into the rotated local frame before deformation? Pure translation of hands + a rotated mesh deforms the wrong region (2x the rotation error). Also check HUD panels are NOT children of the rotated group.
6. Assert the evidence suite touches each verb: if no test, screenshot, or bot behavior exercises it (bots never rotate or click by ray), mark the verb UNVERIFIED in the report — do not let green evidence imply it works.

Mistakes to avoid: trusting a test count over a reachability trace; assuming XR select works because desktop clicks do; assuming the bot's Set path means a player can Set.
