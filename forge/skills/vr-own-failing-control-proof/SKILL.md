---
name: vr-own-failing-control-proof
description: "Prove every code/config change with a failing control: run its test on the edited file (must pass), then the same test with the pre-edit file swapped in (must fail with a quoted exact error) — a test that passes on the broken file proves nothing. For a check that compares two timestamps or counters (\"A >= B\", \"A after B\"), read the code that stamps EACH side, take the order that actually runs, and"
---
<!-- written by vr-skill-smith 2026-11-24T13:32:42.573Z: proposed by coo; audited by vr-auditor: SAFE to publish as agent guidance. The skill is a verification-strictness procedure: it prescribes no code downloads, no data egress, and no commerce, and it strengthens rather than weakens checks and
...[truncated] -->

# Failing-control proof for code edits

## When to use
Whenever you deliver or re-verify a code or config change and claim a test proves it — kit edits, tool fixes, new test files — and whenever a report, CHANGES.md or after-action review says an edit is "verified". One failing control per edit. This covers any check that compares two timestamps or counters ("A >= B", "A after B", "count grew"): those get the same two-sided proof **plus** a look at what stamps each side.

**Why:** a test that passes on the broken file proves nothing. The only evidence a fix is real *and* its test is sensitive enough is the same test FAILING on the pre-edit code with the exact error the fix removes.

## Method
1. **Keep the pre-edit artifact.** Before editing, save the original file (or record a base hash) so the failing control is reproducible later. Scope one edit — or one tightly-scoped block — per control.
2. **Pick the proving test.** Write or select the test that exercises exactly the behaviour being fixed.
3. **Run green on the edited file.** Must pass. Record counts and exit code (e.g. `3 passed (3)`, EXIT0).
4. **Swap the pre-edit file in and run the SAME test.** The diff must show only the intended block differs. The test must fail with the exact error the fix addresses. Quote verbatim in your evidence: the error (e.g. `ReferenceError: title is not defined ❯ sessionEnded src/xr.js:128:14`), the failing test name, the counts (`1 failed | 2 passed`), and the exit code.
5. **Selectivity check.** On the pre-edit file, tests unrelated to the change still pass — only the fixed path fails. If collateral tests fail too, the control is too broad; narrow it until the failure names exactly the defect.
6. **Restore and re-verify green.** Put the edited file back, re-run to green. If the control used a violating input (e.g. an unlisted file that must make a gate FAIL), delete the input and re-run green so the tree is clean.
7. **Record one row per edit in the deliverable**, not just in logs: edit → file:line → test → failing-control quote (CHANGES.md style).
8. **Recovery turns:** do not redo work. Re-measure each done-when on disk and cite the recorded failing control. Label anything unmeasured (MOCK tests, headless runs) as such in the same row.

### Ordering checks — two timestamps or counters (do this before writing the check)
When the check compares two stamped values ("A >= B", "A after B", "count grew"), settle the direction first:
1. **Read the code that stamps EACH side and note which runs first** — cite file:line for both stampers. Never infer the order from the field names; a helper stamped *inside* the write lands *after* the writer's own stamp even when the names suggest the opposite.
2. **Prefer a bounded difference in the known order, not a one-way relation.** If the two are stamped back to back (a writer stamps A, then calls a helper that stamps B), a strict or one-way check on the wrong side (`A >= B` when B runs after A) passes only when both land in the same millisecond — and can pass on the old, broken code too. Use `0 <= B - A <= tolerance` with the order you observed (e.g. `0 <= startIso - generatedAt <= 5000 ms`).
3. **Two-sided proof:** correct code passes; the old code (e.g. the stamp-at-run-start version) fails by its measured gap — quote both values and the delta, not just PASS/FAIL. Worked example: v1.1's run-start stamp gives `generatedAt 12:08:17.359Z` vs `startIso 12:08:39.338Z` (gap 21,980 ms); Orbwend's write-time stamp gives both `12:28:24.623Z` (n=1 same-ms coincidence, which is exactly what a wrong-side `>=` hides).
4. **Never "fix" a failing ordering check by stamping again or rewriting the file after it is written.** Evidence files are hashed into a manifest, and a rewrite breaks integrity. If the check fails on the correct code, the check's direction or tolerance is wrong — fix the check, not the data.

## Edge cases
- **Documentation-only edits** have no behaviour: mark the control `n/a (no behaviour)` and quote the stale sentence the edit replaces.
- **New test files:** the failing control is the same new file run against the pre-edit source.
- **Unreadable stacks in minified builds:** pin the stack with a non-minified build (as the browser smoke needed for "Illegal invocation").

## Checks that prove it worked
- Every behaviour row carries a verbatim failing-control quote naming the exact error the fix removes, with counts and exit code.
- No row where the test passes on both pre-edit and edited code.
- Every ordering row cites file:line for both stampers and asserts a bounded difference in the observed order — never a bare `>=`/`<=` — and its failing control shows the old code failing by a quoted, measured gap.
- After all controls: full suite green; negative-control inputs removed and re-verified green; no evidence file rewritten after it was written (manifest still verifies).
- Mock/headless evidence labelled (e.g. "MOCK navigator.xr — not real-headset evidence").

## Pitfalls
- Writing the test after the fix and never running it on broken code — the commonest way to get a test that proves nothing.
- A control that fails for a *different* reason than the defect fixed (missing dependency, unrelated crash): the quote must name the defect the fix removes.
- Multi-file edits make "swap in pre-edit" ambiguous; scope controls per edit, or swap in the whole pre-edit set for the feature.
- Leaving negative-control artifacts in the tree — they break later checks (a leftover `extra.png` fails the freeze gate forever after).
- Inventing constants or helpers just to make the test pass — use the literals the surrounding code actually uses.
- Claiming a mock or headless-browser run as real-hardware evidence.
- Asserting `A >= B` (or "A after B") from the field names without reading the code that stamps each side — the true order is often the opposite, and the check then passes only on a same-millisecond coincidence (n=1).
- "Fixing" a failing ordering check by re-stamping or rewriting the file after write — evidence is hashed into a manifest; a rewrite breaks integrity. The defect is in the check's direction, not the data.
- Choosing an ordering tolerance that also admits the old defect: the tolerance must separate the two measured cases (e.g. ms-level back-to-back vs the 21,980 ms run-start gap), not just be "small".
