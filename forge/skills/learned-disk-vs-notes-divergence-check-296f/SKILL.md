---
name: learned-disk-vs-notes-divergence-check-296f
description: After reading NOTES.md of a timed-out or lost-run build ticket and before classifying its state or writing the methods brief — amends learned-scout-a-build-ticket-from-note-9757, whose 'checkpoint lines are ground truth' is wrong in the mid-work-death failure mode.
---

1. Read NOTES.md checkpoints and note the LAST recorded test/build counts (e.g. 'npm test = 24 files / 90 tests', 'forked 164 files'). These are a snapshot in time, not the current state.
2. Glob the work tree for what should not exist yet at that checkpoint: game modules (src/core, src/game, putty/ghost/match-style domain keywords in src/), t-*.test.js files, dist/, evidence/*.json, screenshots/*.png. Grep src/ for domain strings to see what is wired into the runtime vs. pure modules.
3. Compare: if test files or modules exist that postdate the last recorded counts (e.g. 30 test files vs. a recorded 24-file run), the work LANDED UNCHECKPOINTED AND UNVERIFIED. Disk proves existence; only a green run proves working. State it exactly that way in the brief.
4. Classify per area, not per ticket: e.g. 'T1 core landed+unverified, T2 wiring not started, T3 evidence missing' is more useful than one global label.
5. The recovery lead is always the same: run the suite once, backfill one checkpoint line per landed step stamped 'landed, verified at <ISO>' only after its check runs green, never rewrite old lines, never rebuild landed work.
6. Ground every count in a file you read this run (path + number); label the ordering claim (which landed first) as an inference from counts, not as fact.
