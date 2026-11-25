---
name: camp-tc-narrative-designer-retent-fd88
description: When designing return/retention hypotheses anchored on playtest or demo telemetry.
---

1. Derive the per-unit pace from the baseline (e.g., median session ÷ units completed) before setting session-length targets; use it to decide whether difficulty grows via length or intensity. 2. Convert each retention rate back to raw event counts (e.g., 4% of 84 = 3 devices). 3. If any anchor number is under ~20 events, state in the doc that it is too thin to support a comparison claim and set the target on a subgroup with a larger denominator instead. 4. Every hypothesis gets its own measure, numeric target, and kill threshold expressed as "after N observations" so it is falsifiable. 5. Check the build constraints (no backend/accounts/network) against every measurement method: if the metric cannot be observed locally and exported, name the teammate and the exact artifact (schema + export path) needed to observe it.
