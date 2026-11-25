---
name: learned-critique-to-fix-message-send-a-361f
description: When a critique reply on a game ticket arrives and you must turn it into one fix-pass message to the builder (message_ticket), especially a long one.
---

## Steps
1. **List the must-fix items and remove duplicates.** Two critics often flag the same defect (for example a hygiene claim). Count the distinct items, and note which lenses did not score. An auditor lens with no score is its own NO-GO on go/no-go line 11d, whatever the scores are.
2. **Confirm each item in source before you forward it.** Use Grep and then Read with offset/limit on the exact file:line the critic cites, in the ticket's live tree. Also run Glob for files the critic says exist (for example hidden dot-folders that plain `ls` misses). Write each row as: what the critic said, then what you saw at file:line. Drop or correct any item that fails this check.
3. **Decide the open design choices yourself.** Where a critic offers "fix X or re-cut the plan", pick one and give numeric targets tied to an evidence field (for example the hero frame's dark/mid/bright tiers in session.json). Give a fallback: one tweak and one re-run, then NOT DONE with the numbers.
4. **Scope rule.** Send craft lifts only when the must-fix items already force a source edit and a new evidence battery. Name the would-elevate items you are leaving out, so the builder does not guess.
5. **Build the message in this order:**
   - the evidence and turn-end rule blocks, word for word;
   - a base line with the expected baseline test count;
   - must-fix rows, each with id, file:line, fix and control (red then green at the claim's own level);
   - gate-prep rows;
   - craft rows;
   - ORDER, with at most 3 items per turn and all source edits before the single battery;
   - a short-time priority list;
   - an `END OF ...` marker.
6. **Length.** The host stores about 12,000 characters per message_ticket, the same cap as a ticket brief. Aim for 10,000 or fewer. When a message is long, put ORDER early or split it into two messages, each ending with its own marker.
7. **Verify on disk after sending.** Grep the harness state.json for the END marker; a count of 1 means it arrived whole. If the count is 0, grep the last distinctive phrase you sent with `.{0,40}` to find where the text was cut. Then send a TAIL message that names the cut point, repeats only what was lost and ends with the marker, and grep again.
8. **Record and plan.**
   - Write the critique scores and your source confirmations as one measured fact.
   - Mark the fix-message plan item as doing.
   - Add the disk-check item for the fix pass, with concrete checks per row and the PNGs you will open.
   - Add the next critique item, depending on the disk check, with its focus (for example "the auditor lens must score").

## Common mistakes
- Sending critic claims unchecked. Critics cite drifted lines or wrong colours; the builder then spends a turn disproving them.
- Assuming a message arrived whole because the tool said "Delivered". Delivery does not mean the full text was stored.
- Splitting must-fix and gate-prep rows into separate messages while a critique is running. Edits made during a review change the tree under the critics.
- Asking for more than about 5 turns when the ticket's turn limit (maxAssignments plus extraTurns) leaves fewer. Check the turns used first.
