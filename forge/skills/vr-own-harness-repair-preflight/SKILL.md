---
name: vr-own-harness-repair-preflight
description: "Before planning or filing any harness repair (repair_harness), and especially after a repair was refused with 'tests-failed': triage every failing test against PROTECTED and the repair's sandbox first; if any fix needs a protected file, stop and hand the owner a hand-apply package instead of burning a quota slot on a certain refusal; prove fixable cases green under an emulated repair sandbox befor"
---
<!-- written by vr-skill-smith 2026-11-24T14:01:34.729Z: proposed by ceo; audited by vr-auditor: SAFE. The artifact 'harness-repair-preflight' (learned-harness-repair-preflight-169d/SKILL.md; body matches the submitted text) keeps all four hard rules: no downloaded code, no egress, no orders, and
...[truncated] -->

# harness-repair-preflight

## When to use
Before planning or filing any harness repair (repair_harness), and especially after a repair was refused with 'tests-failed'.

## Method
1. **List the failing tests.** From the refusal, list each failing test file with its first failing test and file:line. The test step reports only the first ✖ line per file (repair.js:294 at the time of writing), so read the test run itself for the rest when needed.
2. **Re-read the machinery.** Read PROTECTED (repair.js:47 at the time of writing) and the test-step code: the runner that globs every plugins/*/test/*.test.(m|js) file (repair.js:279-284), the profile it builds with exec:false (repair.js:287), and sandboxProfile in tools.js:49 (exec denied at tools.js:61 — only node may exec). Re-read these; do not trust the line numbers in this skill.
3. **Per failing file, decide fixability.** For each failing file: can its tests go green without editing a PROTECTED file or the sandbox profile? PROTECTED covers the repair machinery and the sandbox (repair.js, restart-guard.mjs, repair.test.mjs, tools.js, tool-run.mjs); changeProblems (repair.js:66-78) refuses any repair that touches them.
4. **If any failing test can only be fixed in a PROTECTED file: STOP.** No repair can pass, whatever it changes: every test file runs and any single failure refuses the repair (repair.js:248-250), and the refusal counts against the daily quota (repair.js:118-119). Route that fix into an **owner hand-apply package**: (a) the narrowest diff — literal allows only, each one measured; (b) one line saying what it widens and what it still denies; (c) an exact two-sided check the owner can run (the needed test passes; an unrelated action is still denied); (d) a plain statement of what was not run.
5. **If every failing test is fixable outside PROTECTED:** prepare the fix in a copy first (a ticket, no commit). Prove the suite green under an **emulation of the repair's sandbox** (the harness-repair-sandbox-emulation skill), not only in a plain shell — the repair runs every test file under sandboxProfile({exec:false}). Then file once.
6. **HARD NEVER — never weaken the blocking rule.** Do not propose, in a repair or in an owner package, to change the test step's blocking rule: not "block only on failures the change introduces", not skipping or deleting a red test, no exception lists. Any failing test file refuses the repair (repair.js:248-250); narrowing that is a check weakening the reviewer must reject, and it is impossible through the repair channel anyway (repair.js is PROTECTED). A red baseline is fixed by making each test pass — fix the code, pin the environment, or make the test hermetic — never by relaxing the rule.
7. **Quota traps.** Re-read how each counter is dated before timing a re-file. At the time of writing: the repair quota counts on the **UTC date** (repair.js:118-119; now() is toISOString) and refused repairs count (outcome !== 'snapshot'; maxPerDay 4 by default); the gate counts on the **host's local date** (store.js:15 today()) — different counters, different rollovers.
8. **Never send a non-game deliverable to the game gate.** Patches and reports are not proposals. Any proposal uses a daily gate slot even if it fails the static check at once (super.js:1289 increments the counter before the run starts; nothing gives the slot back).

## Checks that prove it worked
- Every failing file in step 1 has a first-failure file:line you actually looked at.
- A step-4 STOP names the PROTECTED file the fix would need and quotes the PROTECTED regex line re-read in step 2.
- The owner package's two-sided check was run on both sides with the stated results, and the package says plainly what was not run.
- Before filing (step 5): the suite is green under the emulated repair sandbox on the repair's own pass rule (a file passes only when the process exits ok and prints "ℹ fail 0", repair.js:293).
- No non-game deliverable went to the game gate.

## Pitfalls
- Trusting line numbers quoted in skills or facts instead of re-reading the code.
- Assuming a red test is the change's fault: the baseline can already be red (e.g. a test that shells out to git dies under the exec deny), and the blocking rule does not care whether the failure is pre-existing.
- Filing "just to see the refusal": if step 3 says PROTECTED, the refusal is certain and the slot is burned anyway.
- Trying to slip the rule change into an owner package — step 6 applies there too.
- Timing a re-file against one clock when the two counters use two: repair quota at UTC midnight, gate day at host-local midnight (e.g. 13:00Z in Australia/Sydney).
- Forgetting that refused repairs count toward maxPerDay.

---
*Evidence basis (measured, 2026-11-24–25): repairs r5061f56443 and r6ba37ad926 both refused by the same 3 red tests (fact fbcfdc4f4ee), one of which needs git under an exec-denying sandbox while its test file is PROTECTED; prep ticket kd4e28dbd16 (REPORT.md) confirmed via emulation that 01+02 leave exactly that file red; auditor ruling 2026-11-24T13:46Z struck the former step 5(c) ("block only on failures the change introduces") as check-weakening and impossible through the channel; gate-slot trap measured in fact fafb38c6aac. All file:line references re-verified against live code 2026-11-25.*
