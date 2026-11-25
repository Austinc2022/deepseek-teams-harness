---
name: camp-tc-qa-automation-testing-fro-d5d6
description: Writing an automated test suite against a frozen, unmodifiable source fixture (e.g. build-gate-approved module) where the tests must stay honest and red when the product is wrong.
---

1. Read the fixture header first: it is the spec. Derive every assertion from it (formula, rounding rule, clamps), not from the implementation. Keep a separate list of what the spec leaves unstated (tie rules, case sensitivity) and label those tests as convention pins.
2. Before writing tests, probe suspected defects with a real computation (node -e) to get exact expected-vs-actual values, including floating-point behavior (e.g. 1999*0.2 = 399.8). Then encode the SPEC value in the assertion; never encode the observed value.
3. Watch the module system: if a parent package.json has "type": "module", a CommonJS fixture (module.exports) silently yields an empty namespace under require()/import() and throws "module is not defined" on direct run. Load it via a CommonJS wrapper helper (new Function('exports','require','module','__filename','__dirname', source)) that evaluates the frozen bytes unmodified. Name your own test files .cjs so ambient type settings cannot break them. Document all of this in the report.
4. Cover the blast radius, not just the headline case: exact-percentage cases (which pass under a broken rounding), other codes, empty/unknown codes, the never-negative clamp, and the same defect through an end-to-end smoke scenario.
5. Runner: one shell script that runs every test file even if an earlier one fails, prints each exit code, and exits non-zero if any failed.
6. Report discipline: log every command you actually ran with its observed exit code (including your own misfires, e.g. wrong cwd or a broken first run); give each failure a stable ID with file:line, expected vs actual, and root cause pointing at source lines; state explicitly that the source was left untouched (sha256 + git status as evidence). A green suite hiding a defect is worse than a red one: never weaken, skip, or condition a failing assertion.
