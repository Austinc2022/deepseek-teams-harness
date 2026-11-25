---
name: learned-ticket-brief-length-and-tail-c-6c24
description: Whenever I open a ticket or send a ticket message with a long fix list (more than about 6,000 characters, or rows numbered past 8), and whenever a builder's report or NOTES refers to rows I sent that it seems not to know.
---

# Ticket brief length and tail check

**Why.** The host silently truncates text. An open_ticket brief is cut at 12,000 characters (plugins/super-agent/lib/super.js:1032 `str(a.brief, 12000)`). A message_ticket text is cut at 8,000 (super.js:686). Neither gives an error. A brief cut mid-list leaves the builder with a done-when that names rows it was never given. It then invents them or marks them NOT DONE, and the verifier fails the ticket. Measured once: FORMSMITH continuation kfa7d628be6 lost G10(c)-(e), G11, G12 and the turn ORDER (fact fc238159c61).

## Before sending
1. **Budget the text.** Briefs stay under about 11,000 characters and messages under about 7,500. The standing blocks take about 2,000 characters of that: E1-E5 evidence discipline, T1-T3 turn-end, S1-S4 anti-overflow, the no-gate-proposal line and BASE. Count them in the budget.
2. **Order by importance.** Put the gate-critical rows first: must-fix items, comfort features and evidence rows. Put stretch rows, docs lines and the turn ORDER last, so a cut costs the least.
3. **End with a marker.** The last line is `END OF BRIEF (<ticket name>). If you cannot see this line, the brief was cut: say so in NOTES.md and in the report.` Messages end with `END OF <NAME>` in the same form.
4. **Split when over budget.** Open the ticket with the first rows and the full done-when. Send the rest at once as ONE message labelled 'BRIEF TAIL'. It must arrive before the builder's first item; the builder reads messages at the start of its next turn.

## Right after sending
5. **Check the ticket file.** Grep the ticket folder's TICKET.md for the end marker and for the last row id. Read the last 5 lines before '## Done when'. A sentence that stops mid-way means the brief was cut.
6. **Check messages.** Grep forge/super-agent/state.json for the message's end marker. Expect 1 hit.
7. **Repair a cut at once.** Find the intended text in your own memory note or plan note (the state.json copy is cut too). Send it as one BRIEF TAIL message:
   - Say in the first line that the brief was cut and that the message adds no new rows.
   - Repeat the standing blocks (E1-E5, T1-T3).
   - Then the missing rows, then the ORDER, then the end marker.
   - Before sending, check NOTES.md: if the builder has already started rows, say which rows the ORDER now changes.

## Checks when judging a report
8. If a builder's NOTES table lacks a row id that the done-when names, check whether the brief was cut before blaming the builder.
9. When writing an open-ticket note in memory, list every row id with one phrase each. That list is the only full copy if the brief is cut.

## Common mistakes
- Trusting the read_ticket display. It shows '...[truncated]' for display reasons too, so check TICKET.md on disk instead.
- Appending a long addendum to a message that already holds the standing blocks, which pushes it past 8,000.
- Assuming a sibling ticket's brief was fine. Check every brief you opened in the same burst.
