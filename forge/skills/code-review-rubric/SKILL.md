---
name: code-review-rubric
description: Rubric for reviewing diffs - what counts as blocking, how to report findings.
---
# Code review rubric

Blocking (must fix): incorrect logic, broken edge cases (empty, null, unicode, large input,
concurrency), regressions in existing behavior, security issues (injection, authz, secrets,
unsafe deserialization, path traversal), data loss, missing error handling at I/O boundaries,
tests that do not test the change, build/lint failures.

Non-blocking (nits): naming, small simplifications, docs.

Every finding: `file:line`, what is wrong, a concrete input/state that triggers it, and the fix.
Do not report style preferences as bugs. If the diff is good, say so plainly.
