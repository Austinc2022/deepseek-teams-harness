---
name: learned-long-ticket-message-split-orde-5b74
description: Before sending any fix list, brief addendum or rule block to a running ticket with message_ticket that is longer than about 3,000 characters or has more than about 8 numbered rows.
---

Long message_ticket texts can be stored cut off mid-sentence with no error. The 'Delivered' reply does not mean the whole text arrived. In one measured case an F1-F18 fix list was stored ending at F17 ('shows within 3 '), so the evidence-battery row and the evidence-discipline block never reached the builder, and it spent part of its turn searching transcripts for the missing rows.

Steps
1. Order by what must not be lost. Put the hard rules first: the evidence-discipline block, 'never propose to the gate', and the 'one battery in the last turn only' rule. Then the never-cut rows, then the rest. A tail cut should only lose rows you can afford to resend.
2. Budget the size. Keep each message under about 4,000 characters. If the list is longer, split it into 'PART 1 of N', 'PART 2 of N'. Each part names the shared table (for example '## Leader fix list') and says 'more parts follow; do not run the battery until the last part is in your table'.
3. Write compactly. One row = id, the defect with file:line, the fix, the test plus its failing control. Cut the narration. Point to evidence files by path instead of quoting them.
4. Verify after sending. Grep the harness state store (state.json) for a distinctive phrase from the LAST line of each part, using a pattern that ends with a few characters after it. If the stored text ends early, send a 'PART k (resend)' at once with the lost rows written out in full. Do not refer to the lost rows by id only, because the builder never saw their text.
5. Check the builder side on its next turn. Read the worker transcript's 'New since your last turn' section, and confirm the last row and the final rule block are there.
6. In the receiving disk check, count a row the builder never received as NOT DONE (rollout failure), not as a builder fault. Note in memory which part held it.

Common mistakes
- Trusting 'Delivered' as proof of full delivery.
- Putting the evidence rules or the battery row at the END of a long message. That is the part a cut removes.
- Resending with 'see F17/F18' when the builder never got F17/F18.
- Sending two long messages back to back without checking the first one's tail.
- Running two critique panels on the same ticket at once. In the same session, a concurrent second panel lost 4 of 5 critics (argued link, 1 case), so merge triggers instead of overlapping them.
