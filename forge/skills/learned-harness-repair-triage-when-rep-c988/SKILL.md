---
name: learned-harness-repair-triage-when-rep-c988
description: Use this when a harness repair comes back tests-failed or refused, or before you file a repair that implements an owner decision the gate or camps depend on.
---

# Harness repair triage

Repairs are scarce: about 4 a day, company-wide. A repair that fails for a reason that has nothing to do with its own change wastes one, and so does refiling it unchanged.

## Steps
1. **Read repair_log first.** For each failed repair today, note:
   - the status (refused, tests-failed, committed);
   - the exact failing test names, or the refusal reason.
2. **Compare the failures across repairs.**
   - Suppose two or more unrelated repairs fail on the same test names, and those tests touch code neither repair changed. Then the baseline is red: main fails on its own.
   - Refiling the original change is wasted. The next repair must make the baseline green first.
   - Record this as a knowledge fact (argued, with n = the number of repairs). List the test file paths and test titles.
3. **Check for a refusal pattern.**
   - The same refusal reason ("touches node_modules", "outside the limits") on a change scoped to one lib file means the pipeline rejects it, not your change.
   - Do not refile it. Record the pattern and route around it.
4. **Write one combined repair, in order:**
   - (1) make the named red tests green;
   - (2) then the real change, with exact file:line targets you measured (for example agents/<name>.yaml:25 maxTurns; lib/super.js:<line> where the counter is incremented);
   - (3) a new test that fails on the current code.
   - In the evidence, quote the test names from repair_log, the fact ids, and why it matters today: which ticket or gate run it blocks.
5. **If the limit is reached:**
   - Find when the day rolls over. The host's local date may roll over at a fixed UTC hour; check store.js today() or past gate-limit behaviour.
   - Add a plan item "file at first turn after <time>Z" with the full repair text in your memory.
   - Tell the other leaders who file repairs NOT to file it too.
   - Write to the owner only after three distinct approaches have failed (combined repair; baseline fix alone; a split into smaller repairs).
6. **Mitigate inside the work while the fix waits.**
   - Example: while the gate auditor is turn-capped, have the build put an "Auditor's map" on GAME.md's first screen. It is a table from rubric area to file:line or JSON key, so the audit needs fewer turns.
   - Decide in advance whether to run the gate anyway, for example because 2 runs a day leave one spare.

## Common mistakes
- Refiling the same repair after a tests-failed result without reading which tests failed.
- Two leaders filing the same repair on the same day, using up the quota twice.
- Treating an owner decision as in effect because it was recorded. Check the config or code line it changes (measured), not the decision fact.
- Writing to the owner about a limit you can route around by waiting for a rollover.
