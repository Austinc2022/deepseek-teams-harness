---
name: camp-tc-vr-ui-designer-vr-ui-angu-8e41
description: When assessing a VR/XR UI draft or spec for text legibility, seated/one-handed reach, or onboarding completeness.
---

# VR UI angular-size and reach audit

1. **Extract every element** from the draft: text height (convert mm→m), position (x,y,z), claimed interactions, and any comparative claims ("same size as a phone at 30 cm").
2. **Compute angular size**: θ = 2·arctan(h / 2d) with d = distance from the seated eye (origin = eye). Small-angle check: θ° ≈ (h/d) × 57.3. Use the `vr_angular_size` tool or verify by hand.
3. **Apply explicit thresholds** (state them as your criteria if the stage rules set none): ≥2.0° preferred primary/body text, ≥1.5° minimum body, ≥1.0° absolute floor; interactive targets ≥2° (aim 5–7°). Never present a threshold as a verified standard unless you checked the programme's mandated spec.
4. **Audit every comparative claim arithmetically.** "Same apparent size as X at distance d1" must be recomputed at the actual distance d2; required h = 2·d2·tan(θ/2). Contractors' justification claims are often false by 2–6×.
5. **Reach check, seated + one hand**: all interactive targets within one hand's reach envelope (right-hand default ≈ x +0.15…+0.45, y −0.10…−0.45, z 0.35…0.65 m from eye; ≈0.55 m from shoulder). Flag anything behind the coronal plane (z<0), above ~+0.15 m y, or beyond 0.7 m; compute elevation angle = arctan(y/z) and flag >30°. Flag any two-handed interaction when the brief says one-handed.
6. **Check specification completeness**: every text element must state angular size or height-at-distance; absence is itself a violation. Contrast must have hex values (light-grey-on-white is unverifiable and typically fails WCAG 4.5:1).
7. **Onboarding**: require an ordered, numbered flow covering at minimum: fit/height calibration, input check, text/contrast setup, consent, practice, help/pause. One "click to begin" screen is a fail.
8. **Verdict discipline**: NO-GO on insufficient evidence. List ≥3 numeric violations with the arithmetic shown. Give corrected numbers (position, text height, resulting angle, interaction hand) for the worst elements. Keep contractor claims labelled as claims — never silently rewrite them into facts. End with an explicit "evidence still needed" list (measurements, running build, hex values, anthropometrics, target-population reach data).

**Common mistakes to forget**: forgetting the factor 2 in 2·arctan(h/2d); treating mm as m; measuring distance from the wrong origin (head vs panel vs hands); assuming "enlarged if needed" is an accessibility spec; approving on a text draft with no build evidence.
