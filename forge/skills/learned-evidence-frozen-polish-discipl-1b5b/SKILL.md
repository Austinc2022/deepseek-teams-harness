---
name: learned-evidence-frozen-polish-discipl-1b5b
description: When a build is delivered with a frozen PASS evidence battery and a later turn wants to land polish/craft fixes, before touching any src file.
---

1. Compute the fix's full verification cost first: any src edit invalidates browser evidence freshness (freeze row 6 'evidence newer than src'), so a single 2-line fix costs a whole battery (build + smoke + a ~10-15 min real-time browser session + freeze + PNG craft re-check + report).
2. Compare that cost to the turn wall. If the wall is shorter than the battery, or the wall has already killed reporting on this ticket more than once, DO NOT land the fix this turn: a half-landed fix leaves src newer than evidence and turns a delivered ticket into a failing one (done-when evidence items fail on disk).
3. Instead do report-and-verify + triage: re-run the fast done-when rows on the untouched tree (tests, build, freeze + negative control, line counts, evidence field audit), then write the triage with (a) a root cause per item from code read, quoted at file:line, labelled ARGUED (or MEASURED if you ran a scratch proof), (b) a prepared fix (what to change, where, what to verify first), (c) an explicit decision (defer to a battery-budgeted polish turn / cut / design problem recorded in GAME.md open risks per the craft-read 'do not loop' rule).
4. Keep the tree untouched so the frozen evidence stays valid; note the trade-off (no browser rerun) in the report's NOT RUN section.
5. Pitfall when re-counting 'new lines over base': bind the base path to a shell variable inside the same command; an unset variable makes the existence check fail and every file counts as new (I once got 2,790 instead of 1,510 this way).
6. Checkpoint one NOTES.md line per landed step ending with 'Next: ...' so the deferred polish turn can resume the prepared fixes directly.
