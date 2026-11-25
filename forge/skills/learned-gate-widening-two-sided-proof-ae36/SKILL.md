---
name: learned-gate-widening-two-sided-proof-ae36
description: Whenever an after-action review or delivery check must judge whether a change that WIDENS what a gate/checker accepts (allowlist entry, threshold, exemption, required-label swap) is actually proven — a single green run after widening proves only that the gate got looser.
---

1. Read the checker's comparison/normalization code first (tools/freeze-rows.mjs rowPngs strips ".png" and compares basenames; path-vs-basename, case, extensions all matter). Write config values in the checker's own vocabulary, never the spec's example without checking.
2. Positive control: run the REAL check with a policy-compliant item present; require the row's specific output and a full green run (e.g. "PASS row 4 PNG set: 1 PNGs, allowed 1", 13/13, EXIT0).
3. Negative control: add one item that must still be disallowed; require the check to FAIL with the row's own message and a nonzero exit (e.g. "FAIL row 4 PNG set: 2 PNGs, allowed 1"). Quote both outputs verbatim, with run ids/exit codes.
4. Delete the negative-control artifact and re-run to green, so the shipped tree is clean and the green is fresh.
5. For literal/label swaps (docLabels etc.): failing control is the checker output against the OLD text ("labels missing: <new label>") vs the new text (pass).
6. Record in the deliverable: edit -> file:line -> proving test -> quoted failing control. If the checker itself changed, that change needs its own failing control (same test red on the pre-edit checker).
Pitfalls: one green run proves nothing after widening; never leave negative-control artifacts in the tree; a config value copied from a brief can still be silently wrong if the checker normalizes differently than you assume.
