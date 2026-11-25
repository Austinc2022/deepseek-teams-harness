---
name: learned-promote-critique-craft-defects-9a4a
description: When a game forked from the studio kit gets critique or audit must-fix items that any game could repeat (hero shot, contrast, materials, HUD order, false evidence rows, leaked files), and a kit ticket is being scoped.
---

Goal: every future fork inherits the fix by code, not by a message the builder may never read.

1. **Sort the must-fix list into two piles.**
   - Kit-generic: hero shot, value contrast, effect materials, HUD draw order, evidence-row wording, file hygiene, doc claims.
   - Game-only design: mechanics, levels, tuning.
   Only the kit-generic pile goes into the kit. Game-only points go to the game's fix message.

2. **Find the kit-level cause on disk for each kit-generic item before you write the brief.** Read the frozen kit source and quote file:line. Typical finds:
   - The HUD panel keeps depthTest on, so scene geometry covers HUD text.
   - The smoke run takes a full-page screenshot with no DOM-cover check, so a DOM menu passes as a hero.
   - An evidence row prints kit wording inside a game.
   - The base/identity folder copies far more than the identity map needs, so foreign tools leak into every game.
   - The fork sets no mode, so rows cannot tell a kit from a game.
   If you cannot find a cause in the kit, the item stays in the game's message only.

3. **Give the kit a mode flag first** (kit vs game, written by the fork tool together with the ticket id). Game-only rules then FAIL in game mode and are REPORTED or NOT RUN in kit mode. Without it, a strict row either breaks the kit's own run or is too soft for games.

4. **Turn each item into a measured guard, not advice.** Examples:
   - DOM-cover share at capture <= 2%, and capture the canvas only.
   - Subject-vs-surround luma delta (mark the threshold ARGUED; a game changes it only through config, with a reason).
   - Material lint: opacity < 1 without transparent = FAIL; 1-px line materials = REPORTED.
   - HUD option sets depthTest off and a high renderOrder.
   - Self-check text block in the GAME.md template, plus a freeze row that FAILS on missing or 'no' answers.

5. **Ask for two-sided proof on every edit.** The test goes red with the fix reverted (the red output is quoted verbatim), then green. Add a fork proof: fork with a fake ticket id into a folder outside the kit, and show the game-mode rows FAIL on the unfilled template.

6. **Protect the base.** Build in a new folder copied from the frozen kit, and never write to the frozen one: it stays the fallback base. The brief's first line bars any gate proposal.

7. **Guard against the output-limit death.**
   - About 12 edits at most, in priority order (craft first, hygiene second).
   - Files of 250 lines or fewer per tool call.
   - A 3-line NOTES checkpoint after each edit, timestamps from `date -u`.
   - Report of 60 lines or fewer.

8. **Plan the next step at once.**
   - Add a disk-check item that depends on the ticket and mark it blocked: a dependency on a ticket id does not hold the item back, so the plan shows it as ready.
   - Note in the next game's brief: fork the new kit if it passed the disk check, else the frozen one plus hand-pasted lines.

Mistakes to avoid:
- Shipping an advisory checklist as a skill only. Skill writing can be rate-limited, and builders skip text.
- Applying game rules in kit mode, so the kit fails its own smoke run.
- Expecting draw stats to stay the same after replacing a wireframe placeholder with a solid mesh. They change; that is not a regression.
- Accepting 'red: none' or a paraphrased control as proof.
