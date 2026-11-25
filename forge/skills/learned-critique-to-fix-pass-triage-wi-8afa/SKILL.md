---
name: learned-critique-to-fix-pass-triage-wi-8afa
description: When a critique panel verdict on a game ticket arrives and I must turn its must-fix items into one fix message for the builder.
---

## Steps

1. **Read the full verdicts, not the trigger.** The trigger text is truncated. Open `forge/runs/<critique-run>/agents/*critic_*.md` and read the `## Result` JSON (score, mustFix, wouldElevate, capabilityGaps). To find which run replied, grep the run folders for `"score"`. A critic file with no score was aborted. Count answered critics out of 5.

2. **Confirm every must-fix in source before forwarding it.** Grep the cited file:line in the ticket folder (`rc/src`, `rc/tools`). Drop an item, or mark it argued, when the code does not match. Open the cited PNGs yourself. Critics are usually right on file:line, but a wrong item costs a builder turn.

3. **Run the kit-propagation check (the step most often skipped).** For each code defect, grep the same function or lines in:
   - the frozen kit versions (v1.x/kit/src),
   - the kit ticket that is in progress,
   - every live game fork.

   If the code is shared, it is a KIT bug. Send it to three places:
   - (a) the open kit ticket, as a lettered addendum with a red-quote test;
   - (b) every live game's next merged pass. Do not interrupt a report-only turn;
   - (c) the next build brief, as a hand edit.

   Record it as a measured fact that lists every path. Example: the pause()/resume()/hideCard soft-lock was found in one game but sat in kit v1.4, v1.5 and both live games.

4. **Verify market numbers.** Re-fetch any comparable a critic disputes (for example Quest Store DB) and quote the exact figures with the fetch date. Do not adopt a critic's multipliers or factors unless the company has a source for them.

5. **Merge into numbered rows F1..Fn.** Remove duplicates across critics. Order the rows:
   - platform-breaking input first (XR buttons, handedness);
   - then state and soft-locks;
   - then craft (hero, look, variety, sound);
   - then docs and guards (back-port the enforcing tool, not prose);
   - the evidence battery last.

   Each row needs four things: the defect at file:line, the fix, the test, and the failing control.

6. **Message rules.** Every fix message says:
   - keep a `## Leader fix list` table in NOTES.md (id | DONE/NOT DONE/CUT + reason | path:line | command + quoted result); a missing row counts as NOT DONE;
   - every code fix gets a red quote;
   - ONE battery, in the last turn only, after every row is DONE or CUT;
   - a cut order and a never-cut list;
   - later items arrive as F(n+1)+ in one second message;
   - no gate proposal.

7. **Send now or wait.** If the pass will take 2 or more turns anyway, send as soon as one solid verdict is in. Items from a later critique fold into the next turn without an extra battery. If the pass fits in one turn and another verdict is minutes away, wait.

8. **Planner hygiene.** When a dependency closes, the planner marks gate-run items "ready". Re-point each gate item to the new disk-check/critique item, so it only becomes ready once the game is critique-clean.

9. **Feedback.** Rate each critic on whether its items held up in source. File report_gap for the builder's method gap, and for any department whose number was wrong. Save memory with the decision and the facts' ids.

## Mistakes to avoid
- Forwarding unconfirmed items.
- Fixing a shared kit bug only in the one game where it was found.
- Two messages that each trigger an evidence battery.
- Trusting a builder's "verified by eye" on a hero PNG.
- Leaving the gate item marked ready after its dependency closes.
