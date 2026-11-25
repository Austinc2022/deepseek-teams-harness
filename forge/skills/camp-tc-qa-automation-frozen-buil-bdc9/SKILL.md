---
name: camp-tc-qa-automation-frozen-buil-bdc9
description: Writing automated tests for a frozen/approved build artifact where you must report defects without touching the product source.
---

1. Read the source header first: it is the spec you assert against. Never assert current behavior (that just blesses the bug); assert the written rule.
2. Reproduce every suspicion with a real assertion (e.g. the suspected rounding case), not a console.log or a comment.
3. Keep unit tests (per-function rules) and smoke tests (end-to-end scenarios + invariant sweeps) as separate files; an invariant sweep over a range of inputs finds defect families, not just the one suspected case.
4. Runner: run both suites even if the first fails (capture per-suite status separately, combine at the end) so the report shows the full failure surface. Exit non-zero on any failure; verify the exit code unpiped (`sh run.sh > log; echo $?`) — piping through tee masks the real code, and in zsh it is lowercase `pipestatus`.
5. If tests crash at load (not at assertion), that is a harness problem, not a product failure — e.g. a parent package.json with "type":"module" makes Node parse CommonJS fixtures as ESM. Fix it with test infrastructure only (a local package.json with "type":"commonjs"); never edit the frozen source. Report the load failure and the fix separately from product defects.
6. Report every command with its observed exit code, each failure with expected vs actual quoted from the assertion output, the root-cause line in the source, and a recommendation the gate can act on. Leave failing tests failing; run twice to confirm results are deterministic (ignore timing lines).
