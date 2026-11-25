---
name: camp-tc-technical-artist-mobile-v-b581
description: Reviewing/reworking delivered WebXR shader snippets for a mobile-VR (Quest-class) art pipeline where units, colour space, or GPU cost claims look suspect.
---

1. Fix units first: confirm world scale (usually 1 unit = 1 m) and re-derive every radius/speed constant; unit mismatches between a varying and a uniform are the classic hidden bug (e.g. r computed in cm compared to vDist in metres = factor 10).
2. Fix colour space: convert authoring sRGB hex to linear with the standard sRGB EOTF before any shader math; upload linear via a uTintLinear uniform; never do lighting/blending math on raw sRGB values. Verify conversions numerically (script) and cite them.
3. Localize the effect: ring mesh or one bounded quad sized to max effect radius + small margin; no full-screen quad, no post pass. Quad footprint = the fill cost, so oversizing quads is the real expense.
4. Cost note inside each shader file: draw calls, blend mode (premultiplied additive ONE/ONE, depthWrite off), overdraw area in MP and % of eye buffer (assume stated per-eye resolution, declare the assumption), and ms labelled "estimate - no device capture". Never present derived numbers as measurements.
5. For any post-process claim, do the budget arithmetic against the stated GPU budget (claimed ms / budget %), apply conservative desktop->mobile scaling factors (2x/3x/5x) to show the failure range, and list explicitly which evidence is missing (device capture, per-pass split, test conditions, TBDR resolve cost, benefit A/B). A desktop-only claim cannot clear a mobile gate.
6. Keep deliverables to a few small files (2 effects + decision + rules); put conventions in one rules file: scale (metres, radius range), naming (subject_state.glsl + unit-suffixed uniforms), colour space (working linear, decode at CPU boundary, encode once at output).
