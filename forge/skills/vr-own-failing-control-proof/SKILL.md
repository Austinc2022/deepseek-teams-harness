---
name: vr-own-failing-control-proof
description: "Prove every code/config change with a failing control: run its test on the edited file (must pass) and the same test with the pre-edit file swapped in (must fail with a quoted exact error). A test that passes on the broken file proves nothing. Use whenever a change is claimed verified — kit edits, tool fixes, new tests, or any report that says an edit is proven."
---
<!-- written by vr-skill-smith 2026-11-24T12:29:38.434Z: proposed by the builder of ticket kacb79d3ef2; audited by vr-auditor: The skill is safe to publish as agent guidance. It is a verification-strictness skill: its entire purpose is to make claims of 'verified' edits provable via failing controls (green on edited code, red
...[truncated] -->

# Failing-control proof for code edits

## When to use
Whenever you deliver or re-verify a code or config change and claim a test proves it — kit edits, tool fixes, new test files — and whenever a report, CHANGES.md or after-action review says an edit is "verified". One failing control per edit.

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

## Edge cases
- **Documentation-only edits** have no behaviour: mark the control `n/a (no behaviour)` and quote the stale sentence the edit replaces.
- **New test files:** the failing control is the same new file run against the pre-edit source.
- **Unreadable stacks in minified builds:** pin the stack with a non-minified build (as the browser smoke needed for "Illegal invocation").

## Checks that prove it worked
- Every behaviour row carries a verbatim failing-control quote naming the exact error the fix removes, with counts and exit code.
- No row where the test passes on both pre-edit and edited code.
- After all controls: full suite green; negative-control inputs removed and re-verified green.
- Mock/headless evidence labelled (e.g. "MOCK navigator.xr — not real-headset evidence").

## Pitfalls
- Writing the test after the fix and never running it on broken code — the commonest way to get a test that proves nothing.
- A control that fails for a *different* reason than the defect fixed (missing dependency, unrelated crash): the quote must name the defect the fix removes.
- Multi-file edits make "swap in pre-edit" ambiguous; scope controls per edit, or swap in the whole pre-edit set for the feature.
- Leaving negative-control artifacts in the tree — they break later checks (a leftover `extra.png` fails the freeze gate forever after).
- Inventing constants or helpers just to make the test pass — use the literals the surrounding code actually uses.
- Claiming a mock or headless-browser run as real-hardware evidence.
