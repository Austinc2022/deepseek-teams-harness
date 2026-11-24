---
name: camp-vr-ui-spec-e50f
description: Use when designing VR/AR interfaces — diegetic UI, in-world panels, menus, HUDs, readability and legibility — or when authoring a ui-spec.md that records every screen and spatial UI element with positions in metres, text sizes, interactions and accessibility options.
---

# VR UI/UX Design & Spec

Use when designing VR/AR (XR) interfaces — diegetic UI, world-space menus, readability — or when authoring `ui-spec.md`. The goal is a spec an implementer can build from without guessing.

## Procedure

1. **Fix the interaction context first.** Record target headset(s), tracking (6DoF controllers, hand tracking, eye/gaze), seated vs standing vs room-scale, play-space size, and session length. These constrain every later decision.

2. **Inventory every UI surface.** List all screens and in-world elements: comfort/HUD overlay, diegetic props (watch, tablet, signage), world-space and wrist menus, system dialogs, onboarding/tutorials, and feedback states (loading, error, confirmation).

3. **Place each element in physical space.** Give position in metres relative to a named origin (start HMD, floor, or anchored object), rotation, and lock mode (head-locked, body-locked, world-locked, object-attached). Respect comfort zones: primary content within ~1–3 m and ±30–45° of forward view; no sustained head turns >45°, nothing behind the user, nothing closer than ~0.5 m (vergence/accommodation conflict).

4. **Set readable text sizes.** Specify size in both metres and visual angle. Target ≥1° for body text (≈1.75 cm at 1 m), ≥1.5–2° for headings; give minimums for labels and a scaling rule with distance. Use high-contrast sans-serif fonts, avoid thin weights and fine detail, and account for IPD/binocular resolution variation.

5. **Design for the interaction.** For each element define input (controller ray, direct touch, gaze+dwell, hand pinch, voice) and its full state set (idle, focus/hover, active, pressed, disabled, error) plus feedback. Provide an equivalent path for every action so no single modality is required. Avoid sustained raised arms; use large hit targets (~2–3° or ≥3 cm at 1 m) and a rest gesture.

6. **Specify accessibility and comfort explicitly.** Cover text scaling and font choice, colorblind-safe palettes and contrast, reduced motion / no smooth locomotion, handedness switching, gaze-dwell timing, subtitles/audio alternatives, seated mode, and a comfort mode (vignette, teleport locomotion).

7. **Write `ui-spec.md`.** Per element record: ID, screen/state, 3D position (metres + origin), rotation, size, text size (metres/degrees), visual hierarchy, interaction and states, feedback, accessibility options, rationale. Add a global settings section and a coordinate table/diagram.

## Verify before handing over
- Every screen and in-world element has a position in metres with a stated origin, plus size.
- All text has explicit sizes meeting legibility minimums.
- Every element lists interaction method, states, and feedback.
- No action requires a single modality; accessibility and comfort settings are listed.
- Comfort checks pass: nothing inside 0.5 m, no sustained >45° turns, hit targets large enough.
- The spec is complete enough to implement without guessing.
