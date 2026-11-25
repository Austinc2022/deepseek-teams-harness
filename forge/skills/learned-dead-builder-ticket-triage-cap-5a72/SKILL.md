---
name: learned-dead-builder-ticket-triage-cap-5a72
description: A builder ticket ended 'failed' at the 120-call cap or the 32k output cap (person:failed, no report) and I must decide what its folder is worth and what the continuation does.
---

## Why
A ticket that dies at the 120-call or 32k cap ends as person:failed. A lead message cannot resume it (super.js:176-177). It leaves no report, so the only truth is on disk, and the last thing it did is usually an unverified edit. A continuation built on its NOTES alone carries a red tree forward.

## Steps
1. **read_ticket** for the brief's row list and the done-when. Read the ticket-root NOTES.md, all of it: it is short, and the last checkpoint is the frontier.
2. **Rows vs CHANGES.** Grep `^### ` in CHANGES.md and compare with the brief's row ids. A row in NOTES but not in CHANGES did not land as a deliverable.
3. **Last run verdicts.** Glob `logs/*`. Results come oldest first, so the last entry is the last run. Read the verdict lines of the last suite, smoke and gate-lite logs. Do not trust an earlier green that NOTES quotes.
4. **Edits after the last run (the key check).** Do ONE Glob whose brace pattern includes the last suite log, the last smoke log, `kit/src/*.js`, the changed tests, CHANGES.md and `evidence/*.json`. Its oldest-first order tells you:
   - every source or test file listed AFTER the last suite log is an unverified edit;
   - every evidence file listed BEFORE a src edit is stale, so the freshness row will FAIL.
5. **New run-time numbers: measured or derived?** For each new metric in evidence JSON (phase, counts, leads), grep where it is computed. If the value equals a formula of a parameter or constant, it is not a measurement. Example: phase 0.7714 = 1 - 80/350. Also check WHEN it is sampled compared with the event it claims to describe (before or after the capture).
6. **Feel constants.** Grep new timing constants in player-facing code (audio leads, settles, fades). Anything over about 50 ms between an action and its sound or visual is a feel defect, even when every test is green.
7. **Open the hero PNG yourself** (E2). Say what it shows.
8. **Decide.** Open a continuation ticket in a NEW folder: rsync PREV/kit and node_modules; copy PREV NOTES as read-only history; do not copy logs or control forks. Its rows:
   - R1: the red suite fixed at product level, not by editing tests only;
   - one row for each derived or late defect;
   - one claim-sync row for CHANGES rows that cite pre-break logs or promise quotes that do not exist;
   - then FINISH.
   Brief: under 11k chars, with an END marker. Include T1-T5 plus **T6: the FINISH turn lands no row, and runs at most 2 smokes**. Order the rows so no turn carries more than 3 items.
9. **Bookkeeping.** Record a knowledge fact (measured, with file:line). rate_work the builder: credit the rows with real reds, and debit the red tree and the derived metrics. Retarget the disk-check plan item to the new ticket and list the specific numbers that must change, e.g. 'phase must not be 0.7714'. Save a memory note.

## Mistakes to avoid
- Trusting the NOTES checkpoint 'suite 57/241 green' when a later log says 12 failed.
- Messaging the dead ticket (it will not run).
- Accepting a metric because it lies in the passing band (0 < phase < 1) without checking how it is computed.
- Letting the continuation's FINISH turn absorb unlanded rows. This is how the v1.7 ticket died: its turn 2 skipped 3 rows, and FINISH plus 6 smoke runs hit the cap.
