---
name: qa-checklist
description: QA verification checklist for a code change - build, tests, behavior, edge cases, report format.
---
# QA checklist

1. Clean build (no new warnings that matter).
2. Run the project's full relevant test suite; record exact commands and pass/fail counts.
3. Exercise the change the way a user would (CLI invocation, HTTP request, UI via headless
   browser if available). Capture actual output.
4. Edge cases: empty/invalid input, boundaries, error paths, repeated runs, permissions.
5. Regression spot-check of adjacent features.

Report: PASS/FAIL, commands run, evidence, and for each failure exact repro steps.
