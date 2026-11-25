---
name: camp-tc-qa-automation-node-builti-c2d2
description: Writing or running `node --test` suites in a harness work folder (no npm installs allowed) where test files fail to load or the runner rejects paths.
---

1. Check the module scope BEFORE writing tests: `node -e "require('./src/x.js')"` or just run the suite once. A `package.json` with `"type": "module"` in any ancestor directory (e.g. the harness repo root) makes `.js` files load as ES modules; a CommonJS fixture (`module.exports`) and `require()`-style tests will both crash with ReferenceError.
2. Fix scope without touching fixtures: add a new `package.json` in the task root with `{"private": true, "type": "commonjs"}`. It is a new file (fixtures stay byte-identical — checksum before/after with `shasum -a 256` and record both in the report). Node resolves the NEAREST package.json to each file, so this covers `src/` and `tests/`.
3. Do not pass a directory to `node --test` (e.g. `node --test tests/`): some Node builds reject it with `Cannot find module '<...>/tests'` (exit 1). Use bare `node --test` from the task root (recursive discovery of `*.test.js`) or explicit file paths.
4. Capture exit codes defensively: sandbox shell wrappers may run with errexit, so `cmd; echo EXIT=$?` silently drops the echo when cmd fails. Use `set +e; cmd > out 2>&1; ec=$?; echo EXIT_CODE=$ec` and save output to `$TMPDIR` for verbatim quoting.
5. When a report quotes run output as "verbatim", diff the pasted block against the saved output file (`diff saved.txt extracted-block.txt`) before finishing; hand-retyping timing values drifts. Extract the fenced block with awk and diff; fix any mismatch.
6. Failure reporting: never edit the code under test or weaken assertions; record expected vs actual, root-cause ANALYSIS clearly labelled as such, and checksum proof that fixtures were unmodified.
