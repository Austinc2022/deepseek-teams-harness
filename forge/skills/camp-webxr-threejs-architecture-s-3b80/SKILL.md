---
name: camp-webxr-threejs-architecture-s-3b80
description: When writing the WebXR/three.js architecture sketch section of the plan/PRD.
---

When: writing the WebXR/three.js architecture sketch section of plan.md (or any design doc's technical sketch).

1. State platform constraints first: target device(s) (e.g. Quest 2/3 via Quest Browser), three.js + WebXR session type (immersive-vr), fallback desktop/flat mode.
2. Sketch modules as a labelled block list or mermaid diagram — no production code: boot/loader, XR session lifecycle (enter, end, re-enter), scene graph and update loop, input (controllers/hands), locomotion + comfort options, audio, UI (diegetic/2D overlay), state/save, telemetry, asset pipeline.
3. Give the frame budget: state target refresh rate (72/90/120 Hz) and the resulting per-frame ms (e.g. 90 Hz → 11.1 ms), and split it roughly across render/update/audio.
4. Give asset budgets: draw calls, triangle counts per scene, texture memory, lighting approach (baked vs realtime).
5. Name 2-4 architecture risks (e.g. session re-entry, asset streaming hitches, hand-tracking fallback) — each becomes a candidate demo in the demo list.

Checklist before handover: every module maps to a milestone in the plan; frame budget and refresh rate are numeric; comfort options listed (snap turn, vignette, locomotion choices); risks cross-referenced to demos; no code beyond pseudocode.
