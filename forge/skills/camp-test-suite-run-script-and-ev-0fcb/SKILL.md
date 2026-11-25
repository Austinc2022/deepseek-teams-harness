---
name: camp-test-suite-run-script-and-ev-0fcb
description: Use whenever producing the tests/ deliverable: unit and headless smoke tests, the run script, and test-report.md with each command's exit code and failures.
---

# Test suite, run script and evidence report

Deliver three things: `tests/` (unit + headless smoke), one run script, and `test-report.md` that proves exactly what ran and what happened.

## 1. Layout
- `tests/unit/` — fast tests, no browser.
- `tests/smoke/` — headless browser smoke tests (see the headless-shell smoke skill for the cached browser; never download browsers).
- `tests/run.sh` — the single entry point, runnable from the repo root by a fresh agent with no arguments.

## 2. Run script requirements
- Use `set -uo pipefail` but NOT `-e`: the script must keep going after a failure so every command gets recorded.
- Run each command separately; for each, record the exact command line, its exit code, and the tail of its output (last ~10 lines).
- Order: unit tests first (fast signal), then smoke.
- Write a full log to `tests/last-run.log`. The script's own exit code is 0 only if every command exited 0.

## 3. Prove each test can fail
Before trusting a new test, run a failing control: break the behavior it checks (stub the function, comment out the fix, flip the default) and confirm the test exits non-zero; restore and confirm it passes. Record this control run in the report. A test that has never been seen to fail proves nothing.

## 4. test-report.md format
- Header: date, git commit, environment (browser/runtime versions).
- One entry per command: exact command line, exit code, pass/fail counts when available.
- For every failure: test name, error excerpt, and a one-line diagnosis — real bug, flaky, or environment problem.
- Flakes: re-run a failed test once. If it passes, mark it flaky and record BOTH exit codes. Never silently drop a failure.

## Checklist before handing over
- [ ] `tests/run.sh` re-runnable from repo root with no setup beyond what the README says.
- [ ] Every command in test-report.md matches a line in the run script (no ad-hoc commands in the report).
- [ ] Every new test has a recorded failing-control run.
- [ ] No "all green" claim anywhere without the log behind it; failures are listed with evidence, not summarized away.
