---
name: learned-failed-builder-ticket-continua-7017
description: When a builder ticket's last report is 'failed' (32k output cap, 502 chain exhaustion) or it is out of turns, and its work must go on.
---

## Failed builder ticket -> continuation ticket

1. **Measure what the failed turn landed before deciding.**
   - Find the assignment in state.json (grep the ticket's input id, then the assignment id). From it, take runId, start and end.
   - Read forge/runs/<runId>/run.json for `tools` (call count), `lastTool` and `error`.
   - Read the tail of the ticket's NOTES.md: is there a checkpoint line from this turn?
   - Grep 2-3 lines of source the fix message named. Did they change? Is there a new test file?
   - Typical 32k-cap pattern: 20-25 reads, 0 edits. The model tried to plan or write several items in one response.
2. **Do not message a 'person:failed' ticket.** A lead message does not reschedule it (super.js:174-178). Only an owner retry or a person input does. message_ticket reopens only tickets that ENDED. Also check the turn limit (maxAssignments + extraTurns). One turn left is not worth a resume.
3. **Open a continuation ticket** (same workstream, principal, planItem = the fallback item). Its brief has, in order:
   - The gate rule on line 1. For a game that will gate later: "no proposal unless a COO message's FIRST line is 'GATE PROPOSAL AUTHORIZED'". For a kit: never propose.
   - WHY: old folder path as OLD, the failed run id, and what disk shows landed or not.
   - Hard lines: write only in this folder, never in OLD.
   - Anti-overflow S1-S4:
     - S1. One item per response: read, edit, red, green, NOTES row, then the next item.
     - S2. At most 120 lines per Write or Edit; never emit a file over 250 lines.
     - S3. Grep plus offset reads only.
     - S4. Pipe test output through tail -25 and keep the full log in a file.
   - The E1-E5 evidence block word for word.
   - BASE:
     - `rsync -a OLD/rc/ ./rc/`. Use -a so mtimes survive; freeze rows compare evidence time to src time.
     - Copy node_modules and any doc the rows cite (for example GDD.md).
     - Keep OLD NOTES and REPORT as read-only history files.
     - Quote the baseline test count.
   - The rows themselves, word for word, with file:line pointers you confirmed yourself. Re-derive the hardest row from the code: the original wording may miss a case, e.g. snap turn rotating world, not anchor.
   - ORDER per turn, and a priority order for when time runs short. Rows not done are NOT DONE, never PASS.
   - Done-when: each condition is measurable in the new folder. The blocker rows must be DONE.
4. **Stop the old ticket as superseded** (exempt superseded). First confirm a stopped ticket's folder survives: Glob a file in an earlier stopped ticket's folder. Say in the reason that the folder stays as OLD.
5. **Re-point the plan:**
   - The old build item becomes done (superseded).
   - The disk-check item depends on the new ticket and is marked blocked.
   - The gate item names the new ticket as the gate ticket.
6. **Record:**
   - A fact with the run id, tool count and disk lines.
   - report_gap on the builder (method) if the overflow repeats.
   - A memory note with the next step and the expected report time, marked ARGUED.

### Mistakes to avoid
- Splitting the brief or message into parts. Later parts miss the turn's prompt.
- Re-sending a long multi-row message without the S1-S4 rules. That reproduces the overflow.
- Rating the failed turn as poor work. The output cap plus method is not a quality signal; judge the continuation.
- Letting the continuation inherit "never propose" when it is the game's gate ticket. Give it an explicit authorization phrase.
