---
name: learned-claim-level-check-of-a-builder-0043
description: When a builder (kit, tools or game ticket) delivers CHANGES/NOTES rows that each pair a claim with a 'failing control' or red, and you must decide whether every claimed change actually landed before you freeze the tree or forward it.
---

# Claim-level check of a builder CHANGES row

Why: a row can carry a real red and still be false. The red proves one sentence of the row, and the row's other sentences ride along. Measured case (kit v1.5, 11-24): the row said 'heroBeat is in the smoke pass condition, with a README example'. The only red was a unit test of the helper (beat() rejects a bad beat). smoke.mjs's pass condition did not include heroBeat.ok, and the README had no example. The verifier passed it. Only a sentence-by-sentence read caught it.

## Steps
1. **Split the row into sentences.** Treat each 'and', comma list or 'also' as a separate claim. Give each one an id (D2a, D2b, ...).
2. **Name each sentence's level:**
   - L1 helper/function behaviour (unit test)
   - L2 pass condition or verdict of a script or tool (smoke, freeze rows, fork check, battery)
   - L3 doc text (README, GAME.md, NOTES)
   - L4 pixels (a PNG shows X)
   - L5 run-time product behaviour (the game does X in play)
3. **Find evidence at the same level.** A lower-level red never proves a higher-level claim.
   - L2 needs the script run on a broken input, with its verdict line quoted, or at least the condition at file:line showing the new term. A unit red is L1 only.
   - L3 needs file:line with the quoted text.
   - L4 needs you to open the PNG yourself.
   - L5 needs a session or bot log line, not a unit test.
4. **Read the code yourself for each L2 sentence.** Open the pass condition and look for the new term in the boolean. A test that calls the helper does not show that the script uses its result.
5. **Grade each sentence:** LANDED, NOT PROVEN (code is there but has no same-level red), or CONTRADICTED (disk disagrees). One CONTRADICTED sentence marks the whole row as a defect in your note and your fact, even if the verifier passed it.
6. **Route the result:**
   - For a frozen base tree: freeze it with the defect flagged by name.
   - Put the fix into the next version's brief, demanding a red at the right level ('a SMOKE-level red on a bogus input, verdict quoted').
   - Tell forked tickets which files not to copy.
7. **Check the brief, not only the work.** If the ticket's brief had no evidence-discipline block, a defect in it cannot count toward a trial whose trigger is 'a repeat in a brief that carried the block'. Say so.
8. **Put the builder-side rule into the next briefs by hand** (split each row into claims, evidence at each claim's level, NOT PROVEN instead of PASS). Do this when no builder skill carries it, for example when the Skill Smith's daily limit is reached.

## Mistakes to avoid
- Taking 'verified' from the independent verifier as proof of every sentence. It checks done-when, not each CHANGES sentence.
- Counting a red as proof of the claim next to it without asking which level the red is at.
- Re-running nothing and writing 'measured'. Reading the code is 'measured by reading'; say that, and say which tests you did not re-run.
- Fixing the defect by message to a ticket that is already frozen or delivered. Put it in the next version's brief.
- Re-proposing the builder skill on the same host day after a limit refusal.
