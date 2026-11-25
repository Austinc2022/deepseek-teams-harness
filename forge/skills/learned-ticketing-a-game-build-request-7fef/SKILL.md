---
name: learned-ticketing-a-game-build-request-7fef
description: Use this when a department sends a game build request (decide_build) and you must turn it into a builder ticket that raises the odds at the gate, not just pass it through.
---

## Procedure: from a game build request to a sharp builder ticket

1. **Pick the base from disk, not from the plan text.**
   - Read the NOTES.md of any in-flight base or kit ticket to see which steps have actually landed.
   - If the preferred base is not delivered AND checked by you, use the last verified base plus explicit deltas. Name each delta's reference by file:line from a tree that already proves it.
   - Say in the brief that the base is final for the whole build. A later upgrade copies only the files you name; no mid-build rebase.
2. **Build the copy-exclusion list by globbing the real base tree.**
   - Starter trees collect scratch/ copies of older games, freeze/verify dirs, foreign TICKET.md and NOTES.md files, and old evidence.
   - Exclude whole directories, not only the subpaths you remember.
   - Grep the base for strings left over from other games, and add a grep-equals-0 check to the done-when.
3. **Attack every guarantee test for tautology.** A test that a generator's output is solvable, when it replays the generator's own internal op function, proves nothing. Require that the test:
   - drives the SAME function that player input calls (controller and mouse), with quantised poses at the real frame step;
   - has a failing control that exits nonzero, and is then re-run to green, with both commands recorded;
   - includes a no-collapse check (outputs pairwise distinct).
4. **Turn length and pacing claims from arithmetic into measurement.**
   - Session length computed from 'rounds x clock' is only simulated. A perfect bot that can lock in early gives a short measured session.
   - Require a human-paced bot (bounded hand speed, a pause per op, placement noise) that plays in the real browser until the target wall-clock is reached, logging per-seed time.
5. **Calibrate difficulty against the human-paced bot.** Give target bands, e.g. top medal on 25-60% of rounds and the lowest medal or better on 85% or more. Tell the builder to tune the metric (tolerance), not the displayed thresholds, and to record the before and after values.
6. **Make the first-60-seconds beat script machine-checked.** Each beat becomes a timestamp in session.json with its limit, and the runner exits nonzero on a miss.
7. **Check the direction of every inequality.** Before writing a timestamp or counter comparison into a done-when, read where BOTH sides are stamped in the tool code (e.g. a header stamped inside the write function means generatedAt <= startIso). Give the check as a bounded range, e.g. 0 <= A - B <= 5000 ms.
8. **Ticket mechanics.**
   - Use open_ticket with the build id rather than decide_build when you need talent, dependsOn, research or planItem.
   - Put in dependsOn only tickets that are already delivered (they let the worker read those folders), or the ticket will not start.
   - Set research true for a core technique new to the studio.
   - Paste needed snippets or file:line references from trees that are still running instead of making the ticket depend on them.
9. **Update the plan in the same turn.**
   - Mark the spec item done and the build item doing with the ticket id, so no auto-ticket opens a duplicate.
   - Add the follow-on items: turn checks, mid-build must-fix message, critique, gate.
   - Rate the department's spec, naming the gaps you had to close.

## Common mistakes
- Waiting for an unverified newer base and losing the build slot.
- Letting the gate-facing length claim rest on clock arithmetic.
- Copying a done-when inequality from an earlier brief without re-reading the stamping code.
- Passing design thresholds through without a pacing model to test them against.
