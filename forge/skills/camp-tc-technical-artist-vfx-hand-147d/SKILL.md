---
name: camp-tc-technical-artist-vfx-hand-147d
description: Reviewing a contractor VFX/effect handoff for a 90 Hz mobile XR build, deciding certify / fix / refuse per effect.
---

1. Extract per effect from the handoff: geometry footprint (local vs screen-space), pass/draw count, overdraw layers, covered pixels, colour handling (hex/linear/output), and exactly which measurements are attached.
2. Grade evidence, not vibes: a desktop profile is not transferable to a mobile tile-based GPU; "1 draw call" is not a cost metric (one draw can shade both eyes full-screen); covered pixels must be stated at the build's actual render resolution — a monitor resolution (e.g. "1080p") is a red flag.
3. Verdicts: CERTIFY when footprint is local, cheap, and colour path is correct; FIX & CERTIFY when exactly one correctable defect (usually colour space: sRGB hex fed into shader) exists and footprint is safe; REFUSE / NOT ENOUGH EVIDENCE when cost is unverifiable (missing device trace, resolution, refresh rate, or pass breakdown) or the shape is banned (full-screen pass in gameplay feedback).
4. In the REFUSE row state the minimum measurement that would change the decision (device, resolution in pixels, refresh rate, pass-by-pass breakdown) — reference your budget doc for the threshold; never invent a counter-number.
5. Deliverables: review table with exactly one row per effect citing concrete grounds; repaired effect file with a hex→linear→uColorLinear path and documented uniforms (no composer/RT/fullscreen pass); a pipeline-rules doc with metre scale caps, naming table, and linear/sRGB authoring + renderer output rules.
6. Verify what you can run: node --check the module, a stub-THREE smoke test asserting no hex leaks into GLSL and both ColorManagement paths convert once; say plainly that GLSL compilation needs a GL context and was not run.
