---
name: learned-attribute-screenshot-artifacts-0d01
description: When a screenshot shows an unexplained rendering artifact (bands, ribbons, ghosts) and code reading cannot attribute it with confidence.
---

# Attribute screenshot artifacts by measurement, not by eye
1. List the candidate scene objects from the code (trail strips, preview arc, panels, halos) and their colours/widths; compare with the artifact's colour and edges in the PNG.
2. Write a small Node probe (no browser) that builds the REAL scene (the App on the mocked renderer from tests/fake-env.js works) and drives it through the exact frame sequence the screenshot implies (e.g. N stationary setOrb frames).
3. Read back the geometry: traverse the field group by mesh name and print min/max/span of the position attribute, plus the first/middle/last vertex pairs. A buffer bug shows up immediately as vertices at (0,0,0) or a span far larger than the object.
4. Confirm the model explains the pixels: predicted direction, camera-relative size, twist/occlusion behaviour and frame-to-frame variation (an artifact that vanishes when the object is edge-on to the camera is a camera-facing strip).
5. Report: one defect line = root cause + measured numbers + prepared fix + failing-control assertion; do NOT land src edits in a turn whose frozen evidence must stay fresh (a src edit stale-ises the battery and breaks the freeze freshness row) - queue it for the fix pass.
Common mistake: guessing from the image alone (the Orbwend 'ribbons' were read as a preview arc for two turns; a 20-line probe showed the trail buffer shifting the wrong way, tail at zeros = a strip drawn to the camera).
