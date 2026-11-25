---
name: learned-gate-widening-two-sided-proof-17e6
description: Whenever you must MAKE a change that widens what a gate/checker accepts (allowlist entry, threshold, exemption, required-label swap) and deliver it with proof — pairs with the review-side skill for judging such changes in after-action reviews.
---

# gate-widening-two-sided-proof (delivery side)

## When to use
Whenever you are making (or re-verifying) a change that widens what a gate/checker accepts — an allowlist entry, a threshold raise, an exemption, a required-label swap — and must show the widening is correct. A single green run after widening proves only that the gate got looser. This method is what let the studio kit v1.1 ticket (allowedPng + docLabels changes) pass its first delivery check.

## Method
1. **Read the checker's comparison/normalization code before choosing any config value.** Basename/extension stripping, path-vs-basename, case, substring-vs-equality all matter. Measured example: rowPngs (tools/freeze-rows.mjs:127-130) maps each PNG path to `path.basename(f, '.png')` and compares sorted lists for exact equality — so config says `"desktop"`, not `"desktop.png"` or `"screenshots/desktop.png"`. A brief's example value can still be silently wrong; the checker's code is the spec. Write config values in the checker's own vocabulary.
2. **Positive control.** With a policy-compliant item present, run the real check: require the widened row's own PASS line (e.g. `PASS row 4 PNG set: 1 PNGs, allowed 1`) AND a full green run with exit 0.
3. **Negative control.** Add exactly one item that must still be disallowed. Run the real check: require it to FAIL with that row's own message and a nonzero exit (e.g. `FAIL row 4 PNG set: 2 PNGs, allowed 1`). Quote both outputs verbatim with run ids/exit codes. Confirm the failure is on the intended row (right reason), not a collateral error.
4. **Cleanup and re-green.** Delete the negative-control artifact and re-run to green, so the shipped tree is clean and the green is fresh. Quote the third run too.
5. **Literal/label swaps (docLabels and friends).** No artifact to plant: the failing control is the checker run against the OLD text — rowLabels on pre-edit GAME.md returned `{"pass":false,"GAME.md labels missing: "Price thesis:"}` — versus the new text passing.
6. **Traceability.** In the deliverable record every widening as edit -> file:line -> proving test -> quoted failing control. If the checker itself changed, that change needs its own failing control (same test red on the pre-edit checker).

## Checks that prove it worked
- Verbatim row quotes exist for BOTH sides: the row's own PASS message and the row's own FAIL message.
- Positive run exit 0 over the full check; negative run exit nonzero — and the runner actually propagates row failure to the exit code (older freeze-check.sh never read test exit codes; measure, don't assume).
- Negative-control artifact deleted; a fresh post-deletion run is green.
- Every widening in the deliverable carries the four-part chain; every checker edit has its own failing control.

## Pitfalls
- One green run after widening proves nothing about discrimination.
- Never leave negative-control artifacts in the tree.
- Don't assume the spec's value format matches the checker's normalization.
- A FAIL for the wrong reason is not a negative control.
- If the runner prints FAIL but exits 0, rejection is not proved — fix or flag the runner first.
