---
name: learned-report-and-verify-recovery-tur-9d0b
description: A ticket whose build steps all landed (checkpointed NOTES.md) but whose turns died before the report — the work exists on disk and the turn must deliver without rebuilding.
---

1. Read NOTES.md checkpoints first; if they show the build complete through the freeze/done-when sweep, DO NOT rebuild — a rebuild risks the turn limit again and invalidates frozen browser evidence.
2. Write the report skeleton to disk IMMEDIATELY (one file, e.g. REPORT.md outside the rc/ tree so freeze caps ignore it): checklist of every done-when item, and sections Measured / Mocked / Not run / Cut. Fill it as checks land; the report must never exist only at turn end.
3. Re-run every cheap done-when condition on disk and report FRESH numbers (never trust the notes narrative alone): unit suite, vite build, freeze-check, the negative control the brief demands (e.g. an unlisted PNG must make freeze FAIL that row, then delete it and confirm PASS again), line counts with the exact command, PNG headers, evidence JSON field audits.
4. Fix doc-only deltas (labels/wording the brief requires) with string edits; do NOT touch src/ — any src edit invalidates the frozen browser evidence (freeze row: evidence started times must be newer than newest src mtime).
5. Do NOT re-run a long (≈11 min) browser evidence job over a PASS artifact: a flaky rerun that completes with FAIL overwrites the PASS evidence. Audit the artifact fields + freshness row instead, and say so plainly in the report.
6. Append one NOTES.md checkpoint line per landed step (step + exact command + measured result + next step) so a successor can resume even if the turn dies mid-report.
7. Report status 'ready' only after you checked every done-when item yourself this turn; list what was mocked, not run and cut. If the brief says no gate proposal, leave the proposal field empty.
Common mistakes: rebuilding instead of verifying; editing src after evidence (forces an 11-min rerun); trusting NOTES narrative numbers without re-measuring; saving the report for the last minutes; letting a verification rerun clobber good evidence.
