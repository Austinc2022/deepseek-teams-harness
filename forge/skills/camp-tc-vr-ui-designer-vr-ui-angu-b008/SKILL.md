---
name: camp-tc-vr-ui-designer-vr-ui-angu-b008
description: Assessing any VR UI draft/spec against legibility and seated one-handed reach rules before sign-off.
---

1. Fix the coordinate convention (seated eye at origin, +y up, −z behind) and state it in the deliverable.
2. For every text element compute angular size θ° ≈ 57.3 × h/d (h = text height in metres, d = straight-line distance from the eye in metres). State the arithmetic explicitly — never just the result.
3. Apply thresholds: body text ≥1.5° practical minimum ~1.0°; critical/emergency labels ≥2.0°. Flag anything under 1.0° as a violation.
4. Check reach: radial distance √(x²+y²+z²) must be ≤ ~0.7 m for direct one-handed touch, else it must be ray-cast selectable with the designated hand only. Flag any element behind the user (negative z) as unreachable/unseen.
5. Check interaction claims against the layout: if the draft says "one-handed" but splits controls across two hands, call the claim contradicted — a claim is not evidence.
6. Check the palette numerically if hex values exist (WCAG ≥4.5:1); if not given, say "cannot verify" rather than guessing a failure or a pass.
7. Correct the worst elements with a full table: position (m), text height, resulting angular size, one-handed interaction method.
8. List evidence still needed (build captures, units confirmation, reach measurements, one-handed test recordings, onboarding traces). Do not approve on text-only evidence; state plainly what cannot be verified.
