---
name: camp-tc-qa-automation-spec-vs-shi-df24
description: Writing an automated QA suite that checks a shipped module against a written spec (e.g. game scoring/promised behavior), where honest pass/fail reporting matters more than a green build.
---

1. Read SPEC.md and the shipped module side by side BEFORE writing tests. Note where the code comments or logic contradict the spec — those are candidate defects, not behaviors to encode.
2. Write assertions from the SPEC wording, never from observed code behavior. If the code has a known bug (e.g. an extra multiplier increment), the test encodes the SPEC value and goes red on purpose.
3. Test each promise twice: black-box (public API deltas, result shape deep-equal on exactly the promised keys) and white-box (internal state probes). Use score-delta probes (score before vs after one call) to verify multipliers that the public result does not expose.
4. Keep a deliberately short pure run (e.g. no-hidden-inflation sweep over 39 hits) separate from the band where a known bug lives, so one defect does not mask other checks.
5. Smoke test: spawn a fresh `node` child process (child_process.spawnSync(process.execPath, [driver])) with a driver that requires the shipped module and prints a JSON envelope (trace + result + end-state). Assert exit 0, pid differs, exact deterministic trace. This proves "loads without browser/WebXR" honestly.
6. Prefer Node built-in `node:test` + `node:assert/strict` — zero npm installs, no network. Note: `node --test <dir>/` failed on Node 24 (Cannot find module); use a shell glob `node --test tests/unit/*.test.js` instead.
7. Top-level script runs each suite, captures each exit code into a variable, prints every exit code, exits 1 if any suite failed. `npm test` delegates to it.
8. test-report.md must list every suite command with its real captured exit code (re-run to capture, never guess), quote exact failure assertion text (actual vs expected), give one root-cause defect entry per distinct bug, and a promise-by-promise matrix including "could not verify — not shipped" rows for missing artifacts. Never invent files the spec says were not delivered.
9. End the report with a clear verdict (RED is acceptable and often correct); state that failing tests will pass once the product fix lands, without fixing product code yourself.
