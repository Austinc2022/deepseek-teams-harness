---
name: learned-re-verify-a-claimed-complete-t-83f1
description: A later turn arrives and NOTES.md claims the previous turn finished everything but never reported; the done-when says the agent must check the conditions itself.
---

1. Do NOT re-edit: treat NOTES.md's claims as untrusted and re-run every done-when condition live, capturing each run to a log file you can quote.
2. Order: unit suite first (it is fast and catches drift), then the expensive real-browser smoke, then the static checkers (freeze-check, gate-lite), then any destructive proof (fork proof) last, deleting its artifacts after quoting.
3. Re-read the on-disk evidence JSON (smoke.json, look.json) and check every numeric field the done-when names (domCoverPct, materials fail count, audio scheduled/late/dropped, drawCalls, triangles > 0, luma delta vs threshold) — do not accept the summary in NOTES.
4. Audit doc claims against ground truth: a CHANGES.md quote of another tree's run must be checked against that tree's actual evidence file; file:line cites and mode-keyed row behavior get spot-checked by the live run output.
5. Watch locale/timezone traps: `find -newermt` parses the cutoff in LOCAL time (this box is AEDT = UTC+11), so convert your UTC cutoff before concluding a read-only tree was written; confirm with `stat -f '%Sm %N'` and the `date` timezone.
6. Harness quirk: a vitest run piped straight to the tool stdout can show only a failing-control child's stray stderr line; run it inside `sh -c '... > log 2>&1'` and read the log to see the real Test Files/Tests summary and exit code.
7. Keep the report within its line cap: quote the measured summary lines, list approaches tried, leave the proposal field empty when the ticket forbids gate proposals.
