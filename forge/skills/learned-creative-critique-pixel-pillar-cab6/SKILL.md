---
name: learned-creative-critique-pixel-pillar-cab6
description: On the critique panel for a shipped game build, judging creative direction and taste (first-60-seconds delight, look/sound cohesion, shareability).
---

# Creative critique: pixel-pillar audit
1. Open the hero screenshot FIRST and judge it as a player, before reading any builder notes (their framing anchors your eye).
2. Open every screenshot from pixels (beats, cards, title). Note per shot: what the named subject actually looks like (e.g. "glass bell" -> what shape/material?), what occludes it, and what a 320x180 thumbnail would say.
3. Map every design pillar named in the brief/design doc ("glass bells", "chord", "hum voices") to its SHIPPED code path: grep for the geometry (SphereGeometry vs lathe), the material (transparent/fresnel vs opaque), and every audio trigger (chime/note/schedule call sites). A pillar with no code call site is an overclaim.
4. Check the payoff moment: what happens at win/resolve (events in the rules/app flow) — sound, scene effect, card timing. The shareable beat is the core of the verdict.
5. Check first-minute teaching copy: which platform each hint serves; verify entry paths (e.g. XR sets mode=play) so desktop hints cannot fire in headset.
6. Truth pass: any doc claim about a PNG ("title card", "bloom") re-checked against the pixels; cite file:line for every must-fix; drop anything unverified.
7. Separate measured (pixels/code I opened), argued (design claims), NOT HEARD/NOT MEASURED (audio quality, headset feel) in the verdict. Never demand evidence the environment cannot produce (e.g. listening tests).
Common mistake: letting the builder's NOTES describe the pixels for you — the description is often wrong (screenshots mislabelled, overclaims unchecked). Judge from the images and the code call sites only.
