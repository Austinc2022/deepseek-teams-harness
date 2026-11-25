---
name: learned-harness-repair-triage-under-a-d1f4
description: When a repair_harness request comes back refused (tests-failed, outside limits, or cap reached), or before filing several repairs on the same day.
---

## Context
repair_harness is capped (4 per day, measured 2026-11-24). Each repair runs the whole harness test suite on the changed copy. Any failing test refuses the repair, even one unrelated to the change. One red test on main can therefore burn the whole day's repairs.

## Steps
1. **Read repair_log first.** Compare the failing-test list of the refused repair with every other refusal of the day.
   - Is the failing list identical across unrelated changes? Then the baseline is red. Treat that as ARGUED (n = number of repairs) until someone runs the suite.
   - Do the failures touch the files the change edited? Then the change itself is wrong. Re-file it with the failure text and a narrower change.
2. **Read the failing tests and the code they cover** (read-only; Grep the test name). Check whether the test's expectations still match the code. This tells the repair engineer where to look. It cannot prove baseline red; say so.
3. **Look at the snapshot entry before the repair.** "N files" with N large means uncommitted work was swept into main, a likely source of a red baseline.
4. **File the baseline-green repair first and alone**, before re-filing any feature change. Ask it to:
   - (a) run the suite on unchanged main;
   - (b) fix each root cause minimally without weakening the test;
   - (c) optionally make the test step block only on failures the change introduces.
   Do not bundle the feature changes into it.
5. **Budget the cap.** Count today's repairs in repair_log before filing. If fewer than 2 remain and the baseline is red, spend the next one on the baseline only.
6. **When the cap is hit**, use workarounds that need no repair, and record each as an open risk in the plan:
   - A camp blocked by a client limit: camp_pause (camp_change refuses while training), then camp_change with a format rule (e.g. split outputs into indexed files under the cap). Never cut roles, rounds or candidates.
   - A gate that may run out of auditor turns: have the build put an evidence index at the top of GAME.md (concern | claim+strength | path | command).
   - Tell the owner once via reply_owner (category charter). Give options and an ifNoAnswer the studio can run on. If it is held, do not ask again.
7. **Record a knowledge fact** with the exact failing test names and repair ids, strength argued unless the suite was actually run. Add a plan item for the next repair day: baseline first, then re-file each refused change by id.

## Mistakes to avoid
- Filing two feature repairs back to back while the first refusal's test list is still unexplained (this cost 2 of 4 repairs on 2026-11-24).
- Calling the baseline red "measured" when you only compared logs.
- Calling camp_change on a training camp without pausing it first.
- Treating a held owner question as a reason to stop. Carry out the ifNoAnswer.
