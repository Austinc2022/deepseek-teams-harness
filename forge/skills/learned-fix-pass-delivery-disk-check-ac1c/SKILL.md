---
name: learned-fix-pass-delivery-disk-check-ac1c
description: When a builder ticket reports a fix pass (numbered leader rows) as delivered, before any critique result or gate decision is acted on.
---

## Fix-pass delivery disk check (leader side, read-only)

Goal: decide from disk, not from the report, which rows really landed and what the next pass must hold.

1. **Collect every id you sent.** Grep the ticket's stored inputs (state.json) for each part of every fix message. Note each part's `read` flag and its last line, because long messages get cut off in storage. Make the full id list (F1..Fn across all parts).
2. **Diff the ids against the builder's '## Leader fix list' table** in NOTES.md. A missing id is NOT DONE, even when the message shows read:true. Then check each claimed row in the file it names (e.g., GAME.md wording, constants). Count dropped rows. A repeat means a report_gap (method) on the builder.
3. **Open every shipped PNG yourself.** Never trust the builder's craft-read or self-check. For each frame, check:
   - is it in play (not DOM or menu)?
   - is the subject fully in frame (top and bottom)?
   - does any UI card or panel cover the subject?
   - is text clipped?
   - is the camera tilted?
   - is the frame actually showing what its filename promises (e.g., 'error-colour' shows both error colours)?
   - are there mesh artifacts (flat polygonal lobes, hard edges)?
   - does any frame show forbidden text such as 'VR isn't available here'?
4. **Compare each row's headline claim with the images.** Tests often prove the claim for a default fixture (a sphere, round 0) while real frames show the failure on other cases (tall forms). A row whose headline the shipped PNGs contradict counts as a contradicted claim.
5. **Read the look-defining constants in source** (palette, shader). Two feedback states with the same hue, or an unlit shader that flattens form, are readability defects that no test caught. Cite file:line.
6. **Read the evidence headers.** For look.json, session.json and human.json, take the status, the key numbers and generatedAt. A FAIL the builder lists as an open risk is still a must-fix, unless the threshold is argued and you decide to accept it.
7. **Check hygiene directories by glob.** Leftover freeze/verify workspaces and full base trees beyond the hash-identity files are the common ones. Freeze tools recreate them, so hygiene must be the very last step of the next pass.
8. **Self-check honesty.** A hero self-check must be judged on hero.png. Lines answered by citing other PNGs while the hero has known defects are evasion: the matching line should be 'no'.
9. **Record and plan.** Write one measured knowledge fact (file:line and PNG names, 'n of N PNGs opened'). Rate the work. Record the next pass's rows as a draft in memory. If a critique is already running, do NOT start a second panel (panels on the same ticket abort each other) and do NOT message the builder mid-critique (the tree would move under the critics). Merge the critique must-fix items with your rows into ONE message, sent in parts under about 4K chars each with E1-E4 first, and verify the stored tail.
10. **Second-pass rule.** A must-fix item that survived one pass in changed form (e.g., the card moved but still covers the subject) gets a decided design answer in the next message, not another open-ended 'fix it'.

Common mistakes: counting the builder's 'craft-read' as evidence; accepting a row because its test is green when the test fixture never reaches the failing case; sending the fix message before the running critique returns; forgetting that dependent plan items need their dependsOn moved when you add new items.
