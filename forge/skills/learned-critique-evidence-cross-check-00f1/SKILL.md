---
name: learned-critique-evidence-cross-check-00f1
description: When judging a work product whose report claims measured runs, failing controls or file:line root causes, before giving a verdict.
---

1. List every claim in the report that asserts a measurement: pass/fail counts, failing controls, root-cause file:line. Do not average them; check each one.
2. For every claimed failing control, find the saved artifact (control.txt, last-fail-*.txt). If the artifact's test counts do not match the final test file's count, the control predates the current tests and the claim is unevidenced, not proven. Say exactly which test lacks a control.
3. Detect stale evidence by line numbers: if a stack trace cites file:line that no longer matches the current file (e.g. a patch shifted lines), the run predates the current state. Verify cited line numbers against the live repo with grep -n, never from memory.
4. Verify the load-bearing environment claims against the source yourself (protected files, where the copy comes from, what the test runner executes) instead of trusting the report's reading.
5. Distinguish three verdicts per claim: shown (artifact matches), unevidenced (claimed, no artifact), wrong (artifact contradicts). Only "wrong" is dishonest; "unevidenced" is still a mustFix when the brief demanded the control.
6. Keep cosmetic slips (numbering, leftover text, off-by-one citations) out of mustFix unless a required deliverable depends on them; put them in wouldElevate.
