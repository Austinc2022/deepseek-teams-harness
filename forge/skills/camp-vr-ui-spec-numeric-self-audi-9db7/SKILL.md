---
name: camp-vr-ui-spec-numeric-self-audi-9db7
description: Run this after any VR UI spec, verdict or assessment is drafted and before the final reply or handoff, whenever the deliverable contains computed figures (angular sizes, viewing distances, contrast ratios, reach envelopes, ratios between sizes) or numeric threshold verdicts.
---

# Numeric self-audit for VR UI deliverables

Run this pass after the draft is complete and before you send anything. Every step is mechanical: if a step fails, fix the figure everywhere it appears (table, prose, verdict, summary), then re-run the step.

## 1. Recompute every published figure from its own stated inputs
For each row/claim that prints (size h, position p, distance d, angle θ):
- Recompute d as the Euclidean distance from the stated eye origin to the element position: d = sqrt(x² + y² + z²). Use the full-precision d for θ; round only for display. Never round d in one column and use unrounded d in another.
- Recompute θ = 2·atan(h / 2d) in degrees (degrees mode; atan result × 180/π).
- If the recomputed θ differs from the printed θ by more than 0.02°, the row is wrong — fix it.
- If a computed value sits just under a threshold you set (within 0.1°), it FAILS the threshold. Do not rescue it with a redefinition of the measurement (cap-height boxes, nominal vs. true distance). Either raise the element size/distance so it truly passes, or lower the stated threshold and say you did.

## 2. Swap-check adjacent rows
For every pair of rows that share a size or a distance, confirm each row's θ matches its OWN inputs, not a neighbour's. A tell-tale: a printed θ that exactly equals the value computed from a different row's inputs. Fix by recomputing both rows from scratch.

## 3. Cross-check table vs. prose vs. summary
Every number quoted in prose, worked examples, corrections, verdicts and the final reply must equal the table value. Check specifically: collapsed/secondary states, corrections of prototype flaws, and any 'same as above' shorthand — write the number out instead.

## 4. Contrast ratios: WCAG relative luminance only
For each foreground/background pair: sRGB channel c → c/12.92 if c ≤ 0.04045 else ((c+0.055)/1.055)^2.4 per channel; L = 0.2126R + 0.7152G + 0.0722B; ratio = (Llighter + 0.05)/(Ldarker + 0.05), rounded to 1 decimal. Show L values in the worked note. Never state a ratio you did not compute this way in this pass.

## 5. Ratios and multiples
When you write 'A is N× B', compute N from the two values in the same document and state both values. Verify by dividing both directions. 'Approximately' requires the computed value first.

## 6. Threshold verdict audit
List every acceptance floor you assert (e.g. ≥1.0° body, ≥2.0° alert) and every element judged against it. For each: print the true computed value and pass/fail. Any element used as evidence of compliance must actually pass at its true distance.

## 7. Rubric coverage checklist
Before sending, list every deliverable item and evidence requirement the task text names (e.g. dominant-hand data, tracking volume, measured reach, settings/large-text access step, caption-miss recovery). Each must appear explicitly in the deliverable body — not implied, not only in an appendix. If the brief lacks the fact, name it as missing.

## 8. Unverified-input labelling
Any figure taken from a draft, prototype or note that you did not measure (reach envelopes, comfort cones, cited studies) must carry '(unverified)' at EVERY place it appears, including tables and corrected-value sections, and be listed under still-needed evidence. Never let an unverified figure read as established outside its flag paragraph.

## Common mistakes to avoid
- Rounding d early and reusing it; recompute from full precision.
- Letting a near-miss pass via a measurement redefinition.
- Quoting a contrast ratio from memory or from the source draft instead of computing it.
- Fixing a number in the table but not in the prose or the final summary.
- Treating 'missing from the brief' as 'assume the convenient value'.
