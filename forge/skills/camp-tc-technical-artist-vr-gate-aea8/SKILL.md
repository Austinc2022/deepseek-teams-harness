---
name: camp-tc-technical-artist-vr-gate-aea8
description: When choosing between competing VFX proposals under a frame-budget gate and shipping shader + cost sheet + pipeline rules in one short pass.
---

1. Read the gate note and any pipeline-rules reference first; extract the hard numbers (frame budget, current CPU+GPU cost, art effect cap, banned patterns like full-screen passes).
2. Evaluate each proposal against BOTH gate clauses: (a) budget arithmetic — write the literal sums (current + proposal vs budget, and current + proposal + required effects vs budget); a proposal that fits alone but crowds out the required effects fails; (b) feedback value — does it tell the player which core action fired? Atmosphere without per-action signal fails a 'clear feedback' gate.
3. Implement ONLY the winning proposal. Do not create stubs or files for the rejected one.
4. Shader file: header comment declaring quad size cap (px AND metres), exact ops per pixel (count actual calls in the body — one smoothstep, one sin, etc. — and verify with grep that code lines match the header), texture reads (0 for feedback effects), which gameplay action it feeds, budgeted GPU ms, and the colour-space contract (linear maths, engine does the sRGB encode).
5. Cost sheet (feedback.md style): one row per approved action with KEEP effect name, trigger, draw area in px (bounding pixel work is the cost metric, NOT draw-call count), budgeted cost; plus a REJECT row with the literal budget math and one sentence on why feedback beats atmosphere.
6. Pipeline rules: scale cap for local quads (bind the smaller of px radius and world metres), naming pattern prefix_action_variant with one example that ties to the shader file you shipped, colour-space rule (linear in shader, convert once at load, encode only in final engine pass).
7. Verify before reporting: grep the shader for op counts vs header claims; re-add the budget sums yourself; check the naming example maps to the actual file path.
8. Report honestly: costs in a no-render-test pass are BUDGETED, not measured — say so in the file and the report.
Common mistakes: quoting draw-call count as cost; putting sRGB pow() in the shader; leaving a rejected effect's file behind; claiming measured ms when nothing was rendered.
