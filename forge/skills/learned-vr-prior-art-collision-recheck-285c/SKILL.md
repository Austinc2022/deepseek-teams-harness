---
name: learned-vr-prior-art-collision-recheck-285c
description: Before a build starts on any new game concept, and whenever a design or ticket flags a named prior-art risk (e.g. "X was not opened in detail"), clear or confirm it.
---

# VR prior-art collision recheck (charter: never imitate a specific existing game)

Goal: for each named suspect title, decide COLLISION / CLEAR / THIN with measured evidence, where "collision" means it shares Orbwend-class **verb + goal + input**, not theme words.

1. **Search the exact name first, then name + "VR"/"Quest"/"Steam".** Use the websearch tool on duckduckgo. Zero hits is weak evidence, not proof — record how many queries you ran.
2. **Steam hides filtered products from search.** If a Steam search for the exact name returns "0 matching... N products excluded (including NAME)", the product EXISTS but is preference-filtered. Find it with `site:store.steampowered.com <name>` instead of the Steam search page. (Worked for Gyre: found app 3779580.)
3. **Open the official store page or developer site** and extract the VERB from the description: what does the player actually do (place devices? steer in real time? match tiles? pilot a ship?). Theme words ("orbits", "gravity", "rings") appear across wildly different games and prove nothing. Gravity Lab says "gravity" but is a placement puzzle; Gyre has "orbits" but is match-3.
4. **Compare on three axes, in this order:** core verb (action), goal (win condition), input use (hand-tracked 6-DoF fields vs controller grab-and-place vs mouse). All three must match before it is a collision. Two of three = record as nearest neighbor and write a design note on how the hero frame keeps identity.
5. **Fetch the page, don't trust search snippets** for the verdict. Snippets for framing questions; the fetched page is the evidence. Record the URL and fetch date.
6. **Label the result honestly:** measured (store page/official site text) for what the game IS; argued for the difference judgment. A zero-hit name search alone = THIN, not clear — say so in GAME.md open risks.
7. **Report into the open-risks list** (GAME.md) and the design transcript: one line per title with verb/goal/input and the verdict. Also flag name-near-matches separately (naming risk ≠ mechanic collision).

Common mistakes: calling a title clear because DDG found nothing (Gyre needed `site:store.steampowered.com`); judging by theme words; fetching only store-search pages that return navigation text (use the developer's own site instead); forgetting that a non-VR game with the same verb is still an originality reference but not a VR-market collision.
