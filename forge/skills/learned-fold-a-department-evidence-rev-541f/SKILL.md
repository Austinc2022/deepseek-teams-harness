---
name: learned-fold-a-department-evidence-rev-541f
description: When Quality or another department sends a pre-gate evidence-integrity / go/no-go list for a game whose fix or continuation ticket is still running, and I must decide what reaches the worker and when.
---

## Goal
Get every true, new defect into the running ticket at the turn where it can actually be fixed. Do not resend rows the brief already holds. Do not forward reviewer errors.

## Steps
1. **Find the tree the reviewer read.** A review made mid-flight may describe the previous ticket's tree, which was rsynced into the live one. Open the live ticket's TICKET.md (its ORDER and done-when) and the latest 'START'/'Next:' lines in NOTES.md. Then you know which rows are in flight and which turn does what.
2. **Sample at least 3 must-fix items, ideally most of them, on the LIVE tree.** Use Grep for fields (srcHash, generatedAt, status, verdict, runId, absolute paths like '/Users/') and Read with offset/limit for doc lines. Check the content, not the cite: reviewers often put lines of one file under another file's name (e.g. an evidence block embedded in session.json cited as clip.json).
3. **Classify each item** as one of these:
   - HOLDS
   - HOLDS, BUT THE MECHANISM IS WRONG. Example: 'the stale row is broken' when the summary file is simply older than the last src edit. Fix by re-running, not by changing the tool.
   - DOES NOT HOLD
   - DUPLICATE OF THE LIVE BRIEF (the row is in the brief and scheduled for a later turn)

   Count each class; the counts go into rate_work and the memory note. Check undercounts too (e.g. "5 cells" when grep finds 8).
4. **Check whether each true defect is kit-generic.** Grep the same pattern in the other live forks and the kit. Kit-generic goes to the next kit spec and to the other games' fix lists. Game-only stays with this ticket.
5. **Map each surviving item to the evidence lifecycle, not to the reviewer's order:**
   - tool/src edits -> BEFORE the one battery (put them with the existing tools row)
   - audit-index command cells and docs that do not depend on numbers -> with the docs row before the battery
   - every quoted number / runId / count -> right AFTER the battery, from the final files
   - cross-file agreement (one srcHash, manifest) -> AFTER the final freeze-check, before the frozen rehearsal

   Keep the per-turn item cap by adding sub-letters to existing rows, not new top-level rows.
6. **Write ONE short message** (well under the host cap, END marker last), starting 'COO ADDENDUM Qn'. Include:
   - The first line is NOT a gate authorization.
   - 'FIRST STEP next turn: paste this block into NOTES.md', so later turns see it.
   - The rules that apply, by TICKET.md line (they are already verbatim there).
   - Per row: the measured evidence (file:line + values), the cause (code read, ARGUED), the fix, a test with a control, and the read-only check command whose output must be quoted.
   - PRECEDENCE: evidence rows outrank stretch rows. Name which stretch row is cut first.
   - 'Already in your brief, not repeated:' plus the list of duplicates.
7. **Bookkeeping:**
   - Add every Q check to the disk-check plan item for that ticket's final report.
   - Add a blocked item for a final-tree recheck by the same department before the gate proposal. It is blocked by hand, because the planner counts a running ticket as met.
   - Record a measured fact with the paths you read.
   - rate_work the department with hold / not-hold / duplicate counts and the reason.
   - Write a memory note.

## Mistakes to avoid
- Forwarding the whole list unchecked: it carries wrong mechanisms and items already done.
- Sending docs-number fixes for the current turn. They go stale at the next battery; schedule them after it.
- Opening a new ticket for a review that fits the live ticket's remaining turns.
- Asking the worker to remember a message across turns without writing it into NOTES.md.
- Letting stretch craft rows crowd out evidence rows in the battery turn.
