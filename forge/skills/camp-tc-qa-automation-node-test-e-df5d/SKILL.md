---
name: camp-tc-qa-automation-node-test-e-df5d
description: Writing automated QA tests against a Node.js fixture/production module that must not be edited, and producing an evidence report of one real run.
---

1. Read the fixture first and diff its behaviour against the spec by hand before writing assertions; predict which assertions will fail and write them at spec strength anyway (never weaken to get green).
2. Check module loading early: run `node <fixture>.js` directly. If an ancestor package.json has "type": "module" and the fixture uses `module.exports`, Node throws "module is not defined in ES module scope". Fix with a local package.json declaring `"type": "commonjs"` in the test folder — do NOT edit the fixture. Record the fixture's sha256 before and after to prove it is untouched.
3. Invoke the runner as `node --test 'tests/*.test.js'` (glob form). `node --test tests/` fails with "Cannot find module" because a bare directory path is treated as a module entry, not a scan root.
4. Keep run-tests.sh minimal: `set -u; cd "$(dirname "$0")"; node --test 'tests/*.test.js'` — the shell's exit code is the runner's. No installs, no external packages.
5. Run the suite once as the recorded run. Then capture a second run to a log file (`./run-tests.sh > test-output.log 2>&1`) and splice that log into the report mechanically (awk replace of a placeholder), then `diff` the extracted fenced block against the log to prove it is byte-identical. Never hand-transcribe runner output.
6. In the report: exact commands with real exit codes, a passed-tests table, every failure with expected vs actual values and the runner's assertion message, plus a root-cause note marked informational. Disclose diagnostic/failed invocations in their own section. Leave failures failing.
7. Boundary coverage per function: low edge, exact threshold, one point past the threshold (this is where cap bugs hide, e.g. capping the input instead of the output).
