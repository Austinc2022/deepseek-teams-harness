---
name: vr-own-gate-widening-two-sided-proof
description: "Prove a change that widens what a gate/checker accepts (allowlist entry, threshold, exemption, required-label swap) still rejects what it should: paired positive and negative controls with verbatim row outputs, config values written in the checker's own vocabulary, negative-control cleanup and re-green, and edit -> file:line -> test -> failing-control traceability. Use whenever you make or verify "
---
<!-- written by vr-skill-smith 2026-11-24T12:56:19.923Z: a method that delivered a ticket at the first check; audited by vr-auditor: gate-widening-two-sided-proof is safe to publish as agent guidance. It is a validation methodology for already-sanctioned gate widenings: read the checker's normalization before choosing config values
...[truncated] -->

# gate-widening-two-sided-proof

## When to use

Whenever you make (or re-verify) a change that **widens what a gate/checker accepts** — an allowlist entry, a threshold raise, an exemption, a required-label swap — and must show the widening is correct. A single green run after widening proves only that the gate got looser; discrimination must be proven in both directions. This is the method that let the studio kit v1.1 ticket (`allowedPng ["desktop"]` + `docLabels "Price thesis:"`) pass its first delivery check.

## Method

1. **Read the checker's comparison/normalization code before choosing any config value.** Basename/extension stripping, path-vs-basename, case, substring-vs-equality all matter. Measured example: `rowPngs` (tools/freeze-rows.mjs:127-130) maps every PNG path to `path.basename(f, '.png')` and compares the sorted list to `cfg.allowedPng` for exact equality — so config says `"desktop"`, not `"desktop.png"` and not `"screenshots/desktop.png"`. A brief's example value can still be silently wrong; the checker's code is the spec. Write config values in the checker's own vocabulary.
2. **Positive control.** With a policy-compliant item present, run the real check. Require the widened row's own specific PASS output (e.g. `PASS row 4 PNG set: 1 PNGs, allowed 1`) **and** a full green run with exit 0.
3. **Negative control.** Add exactly one item that must still be disallowed. Run the real check. Require it to FAIL with that row's own message and a nonzero exit (e.g. `FAIL row 4 PNG set: 2 PNGs, allowed 1`). Quote both outputs verbatim with run ids/exit codes. Confirm the failure landed on the intended row (the right reason), not a collateral error from the added artifact.
4. **Cleanup and re-green.** Delete the negative-control artifact and re-run to green, so the shipped tree is clean and the green is fresh. Quote the third run too (e.g. 13/13 PASS after deletion).
5. **Literal/label swaps (docLabels and friends).** No artifact to plant: the failing control is the checker run against the **OLD** text — `rowLabels` on pre-edit GAME.md returned `{"pass":false,"GAME.md labels missing: "Price thesis:"}` (freeze-rows.mjs:137-140 is literal substring inclusion) — versus the new text passing. The pre-edit file is the negative control; restore or stash accordingly.
6. **Traceability.** In the deliverable (CHANGES.md / NOTES.md / report) record every widening as **edit -> file:line -> proving test -> quoted failing control**. If the checker itself changed, that change needs its own failing control: the same test red on the pre-edit checker.

## Checks that prove it worked

- Verbatim quotes exist for **both** sides: the row's own PASS message and the row's own FAIL message — not paraphrases.
- Positive run: exit 0 over the full check. Negative run: exit nonzero — **measured**, and the runner actually propagates a failed row to the process exit code (an older `freeze-check.sh` never read test exit codes; don't assume propagation, check it).
- Negative-control artifact is gone from the tree, and a fresh post-deletion run is green.
- Every widening in the deliverable carries the four-part chain (edit -> file:line -> test -> failing-control quote); every checker edit has its own failing control.

## Pitfalls

- One green run after widening proves nothing about discrimination — it only shows the gate got looser.
- Never leave negative-control artifacts in the shipped tree; the cleanup run is part of the proof, not tidying.
- Don't assume the spec's or brief's value format matches the checker's normalization (`"desktop.png"` is wrong where `"desktop"` is right).
- A FAIL for the wrong reason (the artifact broke a different row) is not a negative control.
- If the wrapper prints FAIL but exits 0, rejection is not proved — fix or flag the runner first; a gate that cannot fail loudly is a separate defect.
