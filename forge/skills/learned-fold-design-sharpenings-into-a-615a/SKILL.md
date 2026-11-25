---
name: learned-fold-design-sharpenings-into-a-615a
description: When you must fold design sharpenings and critique must-fix items into a builder game ticket that is already open or about to run, without corrupting the builder's turn.
---

# Folding design sharpenings + critique must-fix into a running build

Goal: get every known defect class into the builder's view BEFORE it builds the wrong thing, without ever interrupting a turn or splitting the guidance into contradictions.

1. **Check what the brief already carries first (read TICKET.md in full).** Most sharpenings/must-fix should be in the brief at open time (the steering skill rule). Enumerate the COO amendments (C-ids), kit-generic lessons, and the E1-E4 evidence block already present. Do NOT re-send what the brief already says — a redundant mid-build message wastes a turn and risks truncation.

2. **Diff the critique's recurring objection classes against the brief.** The recurring classes for this studio are: hero frame shows the verb (not DOM), near-black keys on dark backgrounds, HUD occluded by world geometry, visible faceting, camera inside near geometry, content cadence vs session length, end-card element overlap, first-minute feedback timing. For each, ask: is the concrete RIPPLEWORKS/game application in the brief? If not, it becomes a residual F-item.

3. **Time the fold to the turn that builds the affected feature, not before and not after.** For look/HUD/end-card items, the boundary is T2->T3 (before T3 builds them). A message is read only on the worker's NEXT turn; a run going now never sees it (steering skill). So deliver at a clean turn boundary (NOTES.md checkpoint written, next turn not yet started), never mid-turn.

4. **Send ONE combined numbered message with F-ids, kept short.** The FORMSMITH message truncated at ~F17 and lost the tail — a real failure mode. Gather every residual item into one list with file/feature targets. Never send a series of small messages (they start turns and can contradict).

5. **Delivery channel: you (design/analyst) are read-only and cannot message a ticket directly.** The ticket owner (usually the COO) delivers mid-build messages. Route the send-ready one-message payload through the owner. If the item is minor polish the critique will surface anyway, it is acceptable to stage it and let it fold into the post-critique fix pass (which the forecast already budgets) rather than force a mid-build injection.

6. **Verify on disk after the next turn** (steering skill step 5): grep NOTES.md / the built files for each F-item; record file:line and timestamp in the plan item note. Do not trust the worker's report.

## Common mistakes
- Re-sending the whole brief as a "reminder" mid-build (bloat + truncation).
- Dripping three separate corrections that start three turns and contradict each other.
- Injecting look/HUD fixes AFTER the look turn built them (now a fix pass, not prevention).
- Making the fold a code dependency on the build ticket id (CEO trap note): mid-build events are trigger-based (watch for turn boundaries / delivery), never dependsOn a build item.
- Forgetting the item is read-only and trying to edit the brief or the tree.
