---
name: learned-survive-capped-output-on-multi-f181
description: When a multi-turn build/kit ticket died (or keeps dying) with 'response exceeded the NNNN output token maximum', or when planning any turn that must write a large deliverable (CHANGES.md with verbatim quotes, a report, a big test suite) under a harness output cap.
---

# Survive a capped-output harness on multi-turn build tickets

The failure mode: one assistant turn emits a giant tool call (a whole CHANGES.md, a report with pasted logs, a re-printed file) and the API kills the turn with 'response exceeded the 32000 output token maximum' — the work may be on disk but the report is lost and the ticket reads as failed. Claude Code docs (code.claude.com/docs/en/env-vars): for model IDs it can't resolve, CLAUDE_CODE_MAX_OUTPUT_TOKENS defaults to 32000 and is capped at 128000 (only the operator can set it — never try to change config yourself).

## Procedure
1. PLAN THE WRITE BUDGET BEFORE WORKING: list every file the turn must create/extend; each lands in its own tool call of at most ~250 lines. Never one call per file if the file is large — one call per SECTION (e.g., one CHANGES.md row group per call, Edit/append, not Write).
2. CAPTURE EVIDENCE TO FILES, NOT TO YOUR OUTPUT: run controls with output redirected to logs/<id>.log; in prose quote at most 2-3 verbatim lines per control plus the log path. Never paste a full log or a full file into a tool call or the report.
3. CHECKPOINT AFTER EVERY EDIT (edit id, files:lines, measured result, 'Next: <action>', timestamp from date -u) so a mid-turn death costs one edit, not the turn; on resume, re-open the file to see what actually landed before redoing anything (disk beats NOTES).
4. KEEP THE FINAL REPORT TINY AND CITED: the report quotes only evidence-file fields and file:line, one line each; all bulk lives in the files already on disk. If the report needs a table, the table was already written to a file during the turn.
5. DELIVERABLES FIRST, REPORT LAST: finish and verify all files (including CHANGES.md) before composing any report text; the report is an index into on-disk evidence, never the only copy of it.
6. If you still approach the cap: stop extending prose, land the checkpoint with 'Next:', and end the turn — a clean resume beats a dead one.

## Verify
- Every deliverable section is present on disk (re-open and grep for its heading) before the report is written.
- No tool call in the turn exceeds ~250 lines / ~8KB of written text.
- The report contains no log longer than 3 quoted lines.

## Common mistakes
- Writing the full CHANGES.md in one Write at report time (the classic killer).
- Quoting a whole smoke.json / test log in the report instead of its fields.
- Re-printing a file 'for the record' — read it in slices instead.
- Trusting NOTES over disk after a death (see learned-disk-vs-notes-divergence-check-296f).
