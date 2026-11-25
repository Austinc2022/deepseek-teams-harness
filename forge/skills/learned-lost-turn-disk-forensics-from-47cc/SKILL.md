---
name: learned-lost-turn-disk-forensics-from-47cc
description: When a timed-out or lost-run build ticket must be classified before writing a recovery brief or resuming work, especially when NOTES.md has no checkpoint for work that may have landed.
---

# Lost-turn disk forensics from tool caches

When a build turn dies before reporting, NOTES.md under-describes the disk. Classify disk BEFORE trusting any narrative. (Amends the divergence-check rule "checkpoint lines are not ground truth": this is how to find the ground truth without running anything.)

1. Read NOTES.md tail: last checkpointed turn, and the row/table of planned steps (e.g. a fix list). Note which rows are marked NOT DONE — those are claims, not facts.
2. Read the test runner's own cache: vitest writes `node_modules/.vite/vitest/<hash>/results.json` with per-file `failed` flags and `lastRun` epoch-ms. A lost turn's final test run lives THERE. `failed:false` on a test file whose work NOTES never mentions = landed-verified work the notes lost. Convert `lastRun` to ISO to date the run.
3. Cross-check existence of the artifacts each open row implies (tool scripts, test files, evidence JSON, doc sections). Existence = landed-unverified at worst; cache green = landed-verified (still re-run `npm test` once at resume to bind to current src).
4. Grep the docs the rows touch for their acceptance markers (e.g. required cites, required sections). A row is PARTIAL when some markers exist and others are missing — enumerate exactly which.
5. Check evidence staleness: any src edit after an evidence file's run makes it stale (freeze's own "evidence newer than src" row encodes this). Stale evidence is expected mid-fix-pass; it is a failure only if the final battery is claimed done.
6. Report per area: landed-verified / landed-unverified / partial / absent, each with the file path that proves it. Resume rule: verify-first, backfill checkpoints as "landed, verified at <ISO>", NEVER rebuild landed work.

Mistakes to avoid: trusting NOTES' "NOT DONE" table after more turns ran; treating a green cache as binding to current src without one re-run; counting a doc row DONE because the file exists (grep for the marker); re-running the whole evidence battery mid-classification (it invalidates a "run exactly once" battery rule).
