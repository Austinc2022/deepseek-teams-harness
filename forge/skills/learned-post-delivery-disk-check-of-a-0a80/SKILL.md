---
name: learned-post-delivery-disk-check-of-a-0a80
description: When a game fix-pass ticket reports delivered and verified, before planning the next fix pass, critique or gate proposal for that tree.
---

## Why
The verifier checks the ticket's done-when, not whether the shipped docs agree with the evidence. Builders regenerate evidence in a late battery and leave older numbers in GAME.md, GDD.md and REPORT.md. An auditor reads that as a contradiction. It was seen in 2 tickets on one day: Orbwend FIX PASS 4 and FORMSMITH B3.

## Steps (read-only, about 6 tool calls)
1. **Read the report, but trust the files.** Note the report's heading and dates. A ticket that ran several passes often keeps an old heading (e.g. 'FIX PASS 3' over FIX PASS 4 work). Grep NOTES.md for `^## |^### ` to see which rows landed and the last 'Next:' line.
2. **Evidence identity, in one call:** grep `"(status|generatedAt|srcHash|verdict|runId)"` over rc/evidence. Pass if every file has the SAME srcHash and every status/verdict is PASS. NOT RUN is acceptable only if GAME.md names it. A split srcHash means some file is from an older src. Name which one.
3. **Freeze log:** read evidence/freeze/rows.log (or wherever GAME.md's Freeze row points). Count the rows. The count GAME.md states must equal the log's 'N/N rows PASS'.
4. **Claim sync:** read GAME.md in full, then grep the evidence JSON for the fields each audit-index Command prints (e.g. g1ClearedAt, gameSeconds, wallSeconds, look.hero, human-sim generatedAt/srcHash). List every line where the doc number differs from the field, with both values. Check prose repeats too (Session, Pillars, Commercial, Open risks). They drift more than the table does.
5. **Counts and wording:** the 'N open risks' text must equal the length of the list. Any risk that says evidence is stale must be false-proof: it is true now, or it is phrased as a condition. Command cells must be reads, not prose like 'read that section'.
6. **Cross-doc contradiction:** grep GDD.md for the same numbers (value plan, session length). A GAME.md vs GDD.md mismatch is a must-fix even when both are 'measured'.
7. **Pixel rows:** if no battery ran after the last time you opened the PNGs, earlier pixel findings still hold; say so instead of re-opening. If a battery ran, open the hero frame and every PNG a must-fix row refers to.
8. **Record:** one knowledge fact (measured, with file:line for both sides of each mismatch), rate_work for the builder, and report_gap if the defect repeats across tickets. Put the surviving rows into the NEXT fix-pass plan item as ready recipes (what to change, file:line, the control that goes red on the old code). Never message an ended ticket that you keep as a proposal fallback.

## Remedy pattern to give builders (docs rows go AFTER the last battery)
- CLAIM SYNC: run every audit-index Command, write each printed value into its Claim cell and every prose repeat, grep the old values and quote 0 hits, then run the final freeze.
- Rewrite REPORT.md from the final files, not from memory.

## Mistakes to avoid
- Accepting 'verified' as proof that the docs are right. The verifier passed 8/8 on a tree with 9 stale doc numbers.
- Opening the next fix pass before the auto-critique that is already running replies, when there is slack. It splits the fix list, forces a second battery, and makes the worker read an addendum mid-ticket.
- Starting a second critique panel while the auto-critique for the same delivery is still running.
- Folding a reviewer's item without checking that the worker did not already fix it in a later turn (compare srcHash and mtimes).
