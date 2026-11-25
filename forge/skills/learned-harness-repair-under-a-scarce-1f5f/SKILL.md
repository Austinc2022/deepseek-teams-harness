---
name: learned-harness-repair-under-a-scarce-1f5f
description: When a harness fix (owner decision, cap, bug) must land through repair_harness and the daily repair limit is tight, or repairs keep failing at the test step.
---

## Why
Each repair uses 1 of a few daily slots, and that includes refused repairs. A repair is refused if ANY test in the full suite fails, even a test unrelated to the change. One red baseline test therefore burns every slot you have. On 2026-11-24 two good repairs failed on the same 3 unrelated red tests. A third repair was refused because the limit was reached. I had assumed the limit reset at the local-date rollover; the code counts it by UTC date.

## Steps
1. **Read the counter's clock in code before planning around a reset.** Do not assume one daily limit uses the same clock as another. On this host, repairs count by `now().slice(0,10)` (UTC date, repair.js:118), while gate runs count by local date (store.js:15). Record the reset time as a measured fact with file:line.
2. **When two unrelated repairs fail on the same tests, treat the baseline as red.** List the test names and files verbatim from repair_log.
3. **Prove the patch in a copy first, without using a slot.** Open a ticket with the harness-engineer worker (sandboxed, copy only, no commit) that:
   - copies the repo into its folder and runs the repair step's exact test command on the unchanged copy (baseline.txt);
   - gives the root cause of each red test with file:line and a class: code regressed, test stale after a deliberate change, or environment-dependent;
   - writes patches as diffs: 01 for the baseline, 02 for the real change. Each comes with tests and a failing control (revert the change and show the new test failing). The full suite must end at 0 failures with the patches applied in order;
   - reports what might differ between its copy and the live repo.
4. **File the repairs one at a time, smallest risk first.** The repair right after the reset carries the green-baseline patch plus the most urgent change, citing the prep ticket's REPORT.md and diffs. Wait for its outcome before filing the next one. A repair filed while the baseline is still red fails too.
5. **Plan how to use the slots:** urgent change, next change, small fixes, and 1 spare for a failure. Write the order into the plan with dependencies, so nobody else files and spends a slot. Name one filer.
6. **Protect what depends on the fix.** If a gate run, for example, needs the change, hold it until the change is visible on disk (read the yaml or code line), with a hard deadline. After the deadline, run with the best mitigation available. Check that holding does not cost a slot of a different counter.
7. **Close the loop.** Once a repair lands, read the changed line on disk, then mark the advice or decision done with the commit and line as evidence.

## Mistakes to avoid
- Retrying the same repair after a test-step refusal without fixing the baseline: it uses another slot for the same result.
- Bundling many unrelated changes into one repair: one failure sinks all of them.
- Letting two leaders file the same repair.
- Trusting a note's assumed reset time instead of the counting code.
