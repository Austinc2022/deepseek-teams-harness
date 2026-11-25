---
name: learned-department-report-race-and-cha-8446
description: When a department report or build request arrives that seems to ignore a correction you (or another of your threads) already sent, before you rate it, re-direct it or call it defiance.
---

## Why
Department heads run in separate runs. A correction sent a few minutes before a report lands often never reached the run that wrote it. Treating stale inputs as defiance wastes a directive cycle and mis-rates the unit. Corrections placed in some channels (e.g. the reason text of a dropped build request) have no proven path into the department's context at all.

## Steps
1. **Find the run that wrote the report.** Glob `forge/runs/<date>-HH*/agents/*<dept>*` around the report time and take the run whose transcript contains the report tool call (grep `report_to_coo`). Note its start time from the run id (YYYYMMDD-HHMMSS).
2. **Find when each correction was sent.** Grep your own eval runs (`forge/runs/*/agents/*eval_coo*`) for `direct_department` / `decide_build` and take each run's start time plus its duration from the `## Result (ok, Ns...)` line.
3. **Race test.** If the correction was sent after the department run started, the report is built on stale inputs. Do not penalise the unit for that item; say so in the rating reason.
4. **Channel test.** Grep the department run's transcript for a distinctive word of each correction (e.g. 'rename', the request id, 'trefoil'). Zero hits = the correction never reached it. Note which channel failed (a drop reason is the usual suspect) and from then on send corrections through `direct_department` with the initiativeId.
5. **Sibling-thread check.** Before acting on a build request or sending fixes, glob the other `eval_coo` runs that started within a minute of yours and grep them for `This turn is your` and the request id. If another thread owns it, do not decide it again. Read its result note and fold its fixes into yours instead of duplicating or contradicting them.
6. **One combined list.** Send ONE directive that merges every outstanding correction (yours, the sibling thread's, and anything new), states that it replaces earlier channels, and lists what is KEPT, so good parts are not undone. Give proof and kill criteria.
7. **Spot-check claims before rating.** Open 2-4 of the report's own URLs (and any colliding title the report only listed by name) and record what you measured as a fact, with the fetch URLs as source.
8. **Rate on what the unit controlled.** Credit fixed items; deduct only for errors in inputs it actually had (its own logic errors, vague items, missing arithmetic).

## Mistakes to avoid
- Re-sending the same correction without checking whether the department is already working on it: one combined message, not a series.
- Deciding a build request that a sibling thread already decided.
- Writing 'Design ignored X' without step 4's grep evidence.
- Asserting a fact you corrected yourself in an earlier message without re-reading the correction (check your own math; e.g. odd-twist band rules only hold for n=1).
