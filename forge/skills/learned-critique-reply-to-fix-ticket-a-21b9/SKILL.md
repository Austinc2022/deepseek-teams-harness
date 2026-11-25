---
name: learned-critique-reply-to-fix-ticket-a-21b9
description: When a critique panel replies on a game ticket while a continuation or fix ticket on that tree is already running and its brief reserves a turn for a 'CRITIQUE ADDENDUM'.
---

## Steps
1. **Get the full critique, not the trigger text.** The trigger is cut short, often in the middle of the second critic. The full verdicts are at `forge/runs/<critique-run-id>/agents/00N-critic_<lens>.md`. Find the run id with `transcript_search` on a distinctive phrase from the cut text. Then Grep `"mustFix"|"score"` across that agents/ folder to get each line number, and Read about 30 lines from there. Note which lens gave no score (usually the auditor); that matters for the go/no-go line on the auditor score.
2. **Read the running fix ticket's TICKET.md once.** You need its row ids (X/D/N/GP), its ORDER, its turn plan and its cut order. That is how you drop must-fix items the ticket already covers.
3. **Confirm in source, cheaply.** Run one Read of the hot function region in the PREVIOUS tree, which is the tree the critics read. Then run one Grep with an alternation of the key symbols (storage calls, the uncalled function, the constant, the axis index). Open at most one PNG, the one behind a claim that is in dispute. Mark each item confirmed-by-me, or 2+ critics agree (not read), or single-critic.
4. **Triage into rows:**
   - First: headset-only defects the desktop and bot evidence cannot see (lifecycle, input double-binding, DOM-only text in XR). Then desktop-fallback correctness, because the auditor plays the desktop. Then cheap one-line truth fixes.
   - Put cheap related fixes in the same files into ONE row, so the 3-items-per-turn rule holds.
   - Make docs-only truth fixes their own row in the NEXT turn, before the battery, with a call cap. Put it first in the cut order.
   - Craft rows (audio, materials, shaders, composition) do not go into a turn that is already full. They go into a NEW plan item for the next fix pass, blocked on the disk check, with the rows listed in the item text.
5. **Write the message.** The first line is the agreed header and the last line is 'END OF ADDENDUM'. Keep it under 6,000 characters, well under the host's 12,000-character cap. Say which turn it starts at, and that the earlier turns keep ORDER. Each row gives: the PREV file:line (with 'Grep first, earlier rows moved code'), the defect, the decided fix (decide the design question yourself, e.g. which axis), and a test that is red on ./pre/ and then green. Restate the cut order, and the rows that must never be cut.
6. **Market numbers from a critic** go in labeled 'reported by <critic> <date> from <source>, not rechecked'. Check the arithmetic yourself: net = price x 0.7; copies = target / net; reviews = copies / ratio.
7. **Record:** a knowledge fact (measured) of the contradicted claims, which feeds the builder-reliability count; report_gap on the builder if it wrote claims from intent; a memory note with the scores, the rows sent and the forecast.

## Traps
- The plan has a 30-item cap. Make room by removing a DONE item of your own thread. Do not remove another thread's done items: they may be dependsOn targets.
- Do not open the next fix pass as an auto-opening ticket while the disk-check findings still need merging. Keep it as a blocked item owned by you.
- Budget the turn at about 25 calls. Save the memory and the plan before any optional extra reads.
