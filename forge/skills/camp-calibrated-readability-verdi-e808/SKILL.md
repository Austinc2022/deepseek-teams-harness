---
name: camp-calibrated-readability-verdi-e808
description: calibrated-readability-verdicts-and-remedies
---

# Calibrated verdicts and concrete remedies

You lose most of your points in the closing report, not the build. Follow this procedure for every verdict, weakness note and shipping call.

## 1. Classify every claim before you write it
- **Quoted**: fixture text. Put the exact quote next to it.
- **Measured**: output of a tool you ran this run. Paste the exact output line, and keep the checker script in the deliverable so a reviewer can re-run it. If the reviewer's environment may lack your tool (no shell, no browser), say which numbers are single-source and unverifiable elsewhere.
- **Inferred**: your reasoning beyond the evidence. Label it — "inferred, not measured: ...". Never let an inferred claim sit beside a quote as if both were evidence.

## 2. Never state a mechanism the work does not show
If a feature reads weak at distance, either show the measurement supporting the cause (pixel extent, grid cell occupancy, run counts) or write "reads weak; cause not established". A false mechanism (e.g. "drops below a pixel" when the feature is 16-20 px in your own strip) is worse than no mechanism — the reviewer checks it against your own artefact.

## 3. Be honest about thresholds
A threshold you chose (Jaccard 0.35, occupancy delta, arcmin cap) is a working cutoff, not a perceptual standard. Say so. Report the **worst pair / worst case with its number and its ratio to the cutoff**, not "all ≫ cutoff". If the worst case clears by a small factor, that pair is your weak pair — treat it as one.

## 4. No blanket claims
Ban "everything reads at 3 m", "no prop can be mistaken", "all pass". Replace with per-item verdicts and the measured worst case. A collision/clearance metric proves shapes do not overlap, not that a viewer can tell them apart — do not present one as the other.

## 5. Every named weakness gets one prospective remedy
For each weak silhouette or readability failure, give a concrete remedy you have **not yet applied**, in the deliverable's own vocabulary: reduce element count (e.g. drop to two chunky tines), widen gaps beyond one coarse measurement cell, thicken strokes, increase mass separation, or re-test on a finer grid. State the expected effect on the number. A historical note ("I already thickened the bellows") is not a remedy — apply the remedy and re-measure, or state why you cannot.

## 6. Conditional calls stay conditional
If the final call depends on evidence someone else must re-check (QA re-verification against QA's own bar, a browser you could not open, a re-run in another environment), write the call conditionally **in their terms**: "ship provided QA re-verifies <criterion as QA stated it> against <QA's bar>", not against your self-authored proxy.

## 7. Consistency pass before sending
- Every number in the prose traces to a pasted output line or a quote.
- Code comments match the code exactly (transform-origin values, hinge points, sizes).
- Stated scales and real-world sizes are arithmetically consistent across the deliverable — check px-per-metre claims against your own markup before asserting cross-item proportions.

## Common mistakes
- "≈", "≫", "well clear of" without the underlying numbers.
- Presenting a self-chosen cutoff as if it had perceptual grounding.
- Quoting a fixture observation and then silently extending it to distances the fixture never broke down.
- Shipping call phrased unconditionally when the evidence is a self-check.
- Naming a weak item but offering only work already done as its fix.
