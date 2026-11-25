---
name: learned-rescue-a-fix-row-that-keeps-ki-764e
description: When a builder ticket dies (32k output cap, max turns, no report) twice on the same fix row, especially a geometry, layout, transform or tuning row whose test keeps flipping between two failing asserts.
---

# Rescue a fix row that keeps killing builders

## 1. Find where it died, from disk (about 5 reads)
- NOTES.md: the last 'START <row>' line with no row after it is the row that killed the turn.
- logs/: count the trial logs for that row (red2, green, green2...). Each one is a guess. 5 or more guesses with asserts that alternate (A fails, then B fails, then A again) means the row is OVER-CONSTRAINED. The builder is not being careless.
- Quote the numbers from the last log: they are the state the next ticket inherits.

## 2. Find the constraint in the code, not in the builder's notes
- Read the code that sets the thing the asserts measure, and the code that sets its surroundings. Example: the card placement, plus the camera fit that decides how much of the frame is free.
- Ask what fixed quantity makes the asserts conflict. FORMSMITH G5: fitCamera filled 92% of the vertical FOV with the subject, so at 16:9 only the band NDC x 0.56-0.96 was free. A card beside the subject in world space could be big or in frame, not both.
- Check the test harness facts the maths depends on (camera aspect, FOV, canvas size) with one grep each.

## 3. Write a closed-form recipe, not a goal
- Give exact formulas with live inputs (cam.fov, cam.aspect) and constants, a predicted result for each assert, and where in the file the change goes.
- If the test measures through a proxy formula (distance-based size, toward-camera angle), replace it with the direct measure (projected pixels, edge-height ratio). Say why the direct measure is the honest one.
- If a bar you set yourself is infeasible under the constraint, change it as a stated decision, with the reason, and have it recorded in the game's docs. Never let a builder lower a bar on its own.
- Name three controls that must go red: the old placement, a broken orientation, the old size.

## 4. Put limits in the brief that stop the next death
- At most 2 edit-and-run cycles per row after its red. Then the row is NOT DONE with the numbers, and the builder ends the turn with a 'progress' report. A 'progress' report re-queues the ticket. A cap death leaves it person:failed, and it can only be revived by a new continuation ticket.
- No geometry or number reasoning in prose; print the numbers from the test.
- That row alone in turn 1 (BASE + the row), so a death costs one row and not the pass.
- Point to the unchanged rows by file:line in the previous TICKET.md instead of pasting them. This keeps the brief under the 12,000-char host cap. Verify the END marker in the new TICKET.md.

## 5. Decide the next fallback now
- Write in memory what happens if the recipe also fails: the row becomes NOT DONE and an open risk, and there is no 4th try. Also write the date when the game moves to a later gate day.

## Mistakes to avoid
- Sending your own 'scaling of the red' numbers without checking what else moves (the earlier x1.75 desktop scale ignored the camera fit, and the builder burned a turn on it).
- Messaging a person:failed ticket (it does not resume) or re-sending the same brief (it reproduces the death).
- Counting a running ticket as a met dependency for the disk-check item.
