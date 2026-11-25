---
name: learned-ticket-verification-stale-run-de2c
description: Verifying a finished ticket whose report quotes green runs (suite, smoke, gate, freeze): decide whether the green quotes still describe the tree as it sits on disk now.
---

1. Build an mtime chain: stat every file the last turns EDITED (source, tests, docs, NOTES) and every log/EVIDENCE file the report QUOTES as green. Any edit that is NEWER than a quoted green run makes that run stale — re-measure that claim yourself (run the test/script) and report the fresh number, not the quoted one.
2. Watch the last-pass trap: final-polish edits (README first line, NOTES summary sections) usually land AFTER the last verification run. They break (a) tests that pin the old literal (grep the old value in tests/ before the builder changed it) and (b) status-lint rows that parse NOTES lines (e.g. a `<name>.json` token followed by PASS/FAIL on the same line).
3. Re-run the whole battery AFTER confirming there are no newer edits: npm test, then every row script (gate-lite, freeze-check) with output to your own agent-home log. Compare rows/counts to the quoted logs; any new FAIL row = the quote is stale.
4. Check evidence-location rules separately from content: grep every `logs/<name>.log` cite in the deliverable's docs and verify each file exists in EACH required location (e.g. ticket-root ./logs/ AND the kit's own logs/ for fork resolution) — a cite can resolve for machines while failing the ticket's stated evidence rule.
5. Attribute writes outside the ticket folder with mtimes vs the builder's run start (transcripts give run start times): a file modified before the builder's first run is provisioning/infrastructure, not a builder violation.
6. Open every quoted screenshot yourself; tie logs to evidence files via shared unique fields (e.g. identical variance number in log and JSON).
