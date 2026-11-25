---
name: camp-tc-vr-ui-designer-vr-ui-angu-8770
description: Writing or reviewing a VR UI spec that lists panel positions, text heights and viewing distances, especially when a brief or prototype claims a text size is "readable".
---

1. Fix the coordinate convention from the brief (e.g. eye origin 0,0,0, +z forward) and copy the given reach box and ray limit verbatim; classify every element as direct-reach (inside box) or ray/cursor-reach (inside ray limit). Never place UI outside the stated ray limit or behind the eye origin.
2. Convert every text height to angular size with θ = 2·arctan(h/(2·d)) degrees, d = distance from eye origin to the element (use Euclidean distance for off-axis elements). Work at least one conversion out fully in the doc — reviewers check for it.
3. Apply minimum angular thresholds: body/labels ≥1.5°, alerts/destructive ≥2.0° plus a non-colour cue (icon + text), idle chrome ≥1.3°. Prototype claims like "12 mm is fine, like a monitor" fail this: 12 mm at 0.9 m ≈ 0.76°.
4. For each element state the right-hand-only (or whichever hand is free) interaction path, including how anything outside physical reach is selected (projected cursor + button click, dwell fallback, ray+trigger fallback). Flag any element needing two hands or the occupied hand as a defect and correct it with numbers (old position/size/θ → new, and why).
5. Accessibility: give scale multipliers (1.0/1.25/1.5×) and recompute resulting angular sizes at unchanged distances; state contrast ratios computed from WCAG relative luminance (say "computed, not measured"); audio+haptic cues on the free hand only; seated-height recalibration with numeric steps and the assumed default height named as an assumption.
6. Onboarding: ≥4 ordered gated steps each with success criterion and an explicit error/recovery path (tracking loss, input failure, save failure with no-data-loss queue). Name missing brief facts (handedness, tracking volume, device haptics) instead of assuming them.
Common mistakes: quoting linear mm without angular size; ignoring that the occupied hand can't pinch; putting critical actions behind the head or past the ray limit; using red/green as the only status channel; onboarding that is a single "Ready" button.
