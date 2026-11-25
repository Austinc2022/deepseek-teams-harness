---
name: learned-tracked-leader-fix-list-for-a-9a1e
description: When you send fix items, craft notes or forwarded must-fix items to a builder ticket by message (not in its brief), and when that ticket reports back and you have to judge whether the items landed.
---

## Why
The ticket verifier checks the ticket's done-when conditions only. Items sent later by message are invisible to it: a ticket can be 'delivered and verified at the first try' with none of them done. Measured once (n=1, FORMSMITH k0c22b4712d turn 6, 2026-11-24): 11 items G1-G11 went as one free-form message. None of the checkable ones landed (no self-check block, no look.json, no DOC-CHECK line, no struggling-bot test). The verifier still passed the turn. The fix is to make every message item tracked and checkable on disk.

## Steps
1. **Collect all inputs first.** Hold the message until every input for this pass is in: critique verdicts, the Quality list and your own disk-check items. A message to an idle ticket resumes it, and two messages mean two turns and two evidence batteries. Send ONE merged message.
2. **Number every item F1..Fn**, one line each, in this form: what changes | the file or artefact | the command or observation that proves it | the expected result line. Example: `F3 HUD on top | src/hud.js | npm test -- hud | 'depthTest false' test passes and fails with the line reverted`. Leave out anything you cannot state as an observable check, or rewrite it until you can.
3. **Split must-fix from nice-to-have.** Mark nice-to-have lines OPTIONAL. Everything else is must-fix. Do not mix design ideas into a polish-only pass.
4. **Require a `## Leader fix list` table in NOTES.md** with columns `id | DONE / NOT DONE / CUT + reason | path + quoted content | command + result line`. Say it in the message: a missing row counts as NOT DONE, and the report must quote the table word for word.
5. **Make what you can code-enforced.** If an item would recur in any game (hero shot in play, HUD order, evidence timestamps), also put it on the kit backlog as a freeze row or test, so the next fork fails without it. A message item is a request; a freeze row is a guard. The hero self-check became kit v1.4 row 15 this way.
6. **When the ticket reports, check the table against the disk, not the NOTES.** For each DONE row: open the path and find the quoted content (quote content, not line numbers, because line numbers drift). Check that the evidence file's generatedAt/runId header matches what the report quotes. Open each PNG yourself. Any item with no row is NOT DONE. Any DONE row the disk does not show is a false claim: record it with report_gap (instructions) and rate the work on it.
7. **Carry over what is not done.** NOT DONE and CUT rows become the first lines of the next fix message, with the same ids so the history stays readable. Do not renumber.

## Mistakes to avoid
- Free-form paragraphs or bullet lists without ids. Builders drop items silently.
- Trusting NOTES.md or the report's PASS lines. Notes are claims; the disk is evidence.
- Sending a correction while the ticket is mid-turn. A turn that has already started cannot see it. If the item matters for a slot or an irreversible step, put it in the brief or stop and reopen.
- Re-proposing the same skill text to the skill-smith after a daily-limit refusal. Apply the format by hand in the message and record the rule here.
