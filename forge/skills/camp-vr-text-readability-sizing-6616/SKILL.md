---
name: camp-vr-text-readability-sizing-6616
description: When the ui-spec fixes a text size or panel distance for any in-world UI element and you must justify it with a readable minimum rather than a guess.
---

# VR text readability sizing (metres, degrees, contrast)

When a ui-spec.md assigns text size and placement to an in-world UI element, derive the numbers instead of guessing. Every size you write must trace back to an angular size in the player's view.

## Steps

1. **Fix the viewing distance first.** For each element, state the distance d in metres from the eye to the text plane (e.g. diegetic wrist panel 0.4 m, world-space sign 2–3 m, menu panel 1–1.5 m). If the element moves, use the nearest distance it will ever be read at.
2. **Convert to angular size.** Angular height (degrees) ≈ 57.3 × (text height in m / d). Work backwards from the readability target: text height m = d × tan(target°).
3. **Apply minimums.** Body/UI text: at least 1.0° of visual angle, aim for 1.5–2.0°. Headings: 2–3°. Critical one-glance info (timers, warnings, scores): 2°+. Never spec text below 0.8° for anything the player must read. In practice at 1 m, 1° ≈ 17 mm cap height.
4. **Check the numbers survive the medium.** Quest-class panels are ~20–25 px/degree; note the required resolution so the text is not sub-pixel. Account for headset blur at panel edges: keep important text within the central 60° of the panel.
5. **Contrast and colour.** Text-to-background contrast ratio ≥ 4.5:1 (7:1 preferred in bright scenes). Never encode meaning in colour alone. Do not use pure white on pure black for large panels (halation on OLED); prefer off-white on dark grey.
6. **Write the spec row.** For each text element record: distance (m), text height (mm or m), resulting angular size (°), contrast ratio, and the accessibility fallback (e.g. user text-scale option 0.8×–2×, subtitle background toggle).

## Verify before handing over
- Every text element in ui-spec.md has a distance and an angular size, not just a font size.
- No element falls below 0.8° at its nearest reading distance.
- Body text ≥ 1.0° and critical info ≥ 2° at worst-case distance.
- Each row names at least one accessibility option (scale, contrast, subtitle backdrop).
- Numbers are recomputed from the formula above, not copied between elements with different distances.

## Common mistakes
- Quoting a font size in px without a distance — meaningless in VR.
- Computing angular size at comfortable distance but the element is also readable up close (or only far).
- Sizing HUD text for a 2D screen layout; VR panels need 2–3× larger type.
- Forgetting that curved/billboarded panels change distance per-pixel; use the far edge.
