---
name: learned-market-claim-evidence-sweep-c7aa
description: When auditing a game's store-facing commercial docs (hook, audience, peer table, price thesis, $10M path) before judging its market case.
---

# Market-claim evidence sweep

Use when you must judge what a store page could honestly claim, and the docs cite evidence files and store pages.

1. **Re-open every measured number at its source.** For each number in GAME.md/GDD.md that says MEASURED or cites an evidence key, open the named file and read that exact key. Do not accept a number because another doc repeats it. In one audit, GAME.md said `look.hero` = 80.5/19.2/0.3 while the cited `evidence/session.json` said 54.7/40.2/5.1; GDD.md had been updated, GAME.md had not.
2. **After any evidence regeneration, grep every doc for every old number.** A stale sweep that only names a few numbers misses others. Search the old values across all docs (GAME.md, GDD.md, REPORT.md, NOTES.md) and confirm each hit either cites its own older measurement or is corrected.
3. **Never drop a comparable count on an agent's say-so.** If a report says a store page "exposes no review count", re-fetch it yourself with an explicit English locale (`?l=english` on Steam) and grep for `user reviews` / `ratings`. A default-locale or partial render can hide the count. In one audit the claim was false: the English page showed "Very Positive (50) — 100% of the 50 user reviews". Restoring it changed the peer story materially.
4. **Keep instruments separate.** Ratings (Quest) and written reviews (Steam) are different units; never put them in one column without a per-row instrument label, fetch date, URL and verified/unverified mark.
5. **Ground the $10M path with a calculator, not arithmetic alone.** Convert to copies, percent of Quest MAU, and the buyer footprint of the best comparable (ratings x review-to-buyer factor). State the gap as a decision for the owner (content scope + packaging + featuring), not a list of gaps.
6. **Judge the hook from pixels.** Open the hero thumbnail. If the mechanic's hero object is ~1% of the frame, a poetic tagline cannot rescue it at 256px; say so and ask for a mechanism-first store subtitle with category keywords.
7. **Praise honest labelling when it exists.** A MEASURED / PLANNED / NOT-claimable block and a dated decision line are real strengths; report them so they are not lost in the next fix pass.
