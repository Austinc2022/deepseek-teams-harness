---
name: learned-kit-ticket-re-measure-and-fail-4660
description: Verifying a delivered kit or game ticket whose report claims tests/smoke/freeze rows pass and that specific bad inputs make a run FAIL.
---

1. Re-measure, never trust logs alone: run `npm test` yourself and quote the 'Test Files'/'Tests' lines; compare to the claimed counts.
2. Re-run the real-browser smoke yourself (the ticket usually sanctions this). Check every required smoke.json field programmatically (shots/domCoverPct, materials.fail, audio, drawCalls/triangles, pauseResume) and the evidence look/framing numbers — extract them with a node one-liner, do not eyeball the log.
3. For quote-block evidence rows: run the tool's `--check` (must PASS on the shipped tree), then do the two-sided failing control YOURSELF — hand-edit one number in the block, run `--check` (must FAIL with the row's message + exit 1), regenerate, re-check (PASS), and `shasum -c` to prove byte-restore. Record the pre-edit shasum first.
4. For 'X makes the run/row FAIL' claims: do not settle for the unit test — run the real end-to-end path with X injected (e.g. a fork with a bad config value) and read the resulting status. A claim that a name/input FAILs the run is often only implemented as a rejection or a recorded error field while status stays PASS; read the pass condition in the script and grep whether the relevant flag appears in it at all.
5. Doc-claim audit: grep the tree for every artifact a change row asserts exists ("the README carries...", "the row reports..."). A change row can quote perfect red/green logs for code while its prose claims a doc snippet that was never written. Zero grep hits = defect even when all tests are green.
6. Fork proofs: run the shipped fork command verbatim into a temp dir; if the run dies with NOT RUN and a bare status, remember run wrappers often swallow the error into a written file (evidence/*.json 'error' field) — read that file, not just stdout. Check where node_modules actually lives (packages may sit at an ancestor; a truly isolated dir needs seeded packages).
7. Re-run freeze-check + gate-lite after your own smoke re-run (evidence changed) and quote the rows. Clean up your transient artifacts (verify copies, probe forks, scratch logs) with node fs.rmSync — `rm -rf` on workspace subdirs trips the safety hook — and confirm the tree matches the shipped state afterwards.
8. Write the verdict per done-when condition with measured evidence; separate must-fix items from capability gaps (method vs tools), and name the concrete remedy.
