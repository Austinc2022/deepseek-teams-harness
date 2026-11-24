---
name: learned-failing-control-proof-5078
description: Whenever you deliver or re-verify a code/config change and claim a test proves it (kit edits, tool fixes, new tests), or write a report/CHANGES.md that says an edit is verified.
---

# Failing-control proof for code edits

A test that passes on the broken file proves nothing. The only evidence a fix is real and its test is sensitive enough: the SAME test FAILING on the pre-edit code with the exact error the fix removes.

## Method
1. Before editing, keep the pre-edit artifact (save the original file or record a base hash) so the failing control is reproducible. Scope one edit (or one tightly-scoped block) per control.
2. Write or pick the test that proves the fix.
3. Run it on the edited file: must pass. Record counts + exit code ("3 passed (3)", EXIT0).
4. Swap the pre-edit file in — the diff must show only the intended block differs — and run the SAME test. It must fail with the exact error the fix addresses (e.g. "ReferenceError: title is not defined ❯ sessionEnded src/xr.js:128:14"). Quote verbatim: the error, the failing test name, the counts ("1 failed | 2 passed"), and the exit code.
5. Selectivity check: on the pre-edit file, tests unrelated to the change still pass (only the fixed path fails). If everything fails, the control is too broad — narrow it.
6. Restore the edited file; re-run to green. If the control needed a violating input (e.g. an unlisted file that must make a gate FAIL), delete the input and re-run green so the tree is clean.
7. Record one row per edit in the deliverable (not just logs): edit -> file:line -> test -> failing-control quote (CHANGES.md style).
8. Recovery/re-verification turns: do not redo work; re-measure each done-when on disk and cite the recorded failing control. Label unmeasured evidence (MOCKs, headless runs) as such.

## Edge cases
- Doc-only edits: mark control "n/a (no behaviour)" and quote the stale sentence the edit replaces.
- New test files: the control is the same new file run against the pre-edit source.
- If a minified build hides the stack, pin it with a non-minified build.

## Checks it worked
- Every behaviour row carries a verbatim failing-control quote naming the exact error the fix removes, with counts and exit code.
- No row where the test passes on both pre-edit and edited code.
- Final full suite green; negative-control inputs removed and re-verified green.
- Mock/headless evidence labelled (e.g. "MOCK navigator.xr — not real-headset evidence").

## Pitfalls
- Writing the test after the fix and never running it on broken code (commonest way to get a test that proves nothing).
- A control that fails for a different reason than the defect fixed — the quote must name the defect.
- Multi-file edits make "swap in pre-edit" ambiguous; scope per edit or swap in the whole pre-edit set.
- Leaving negative-control artifacts in the tree (they break later checks).
- Inventing constants/helpers to make the test pass — use the literals the surrounding code actually uses.
- Claiming mock or headless-browser runs as real-hardware evidence.
