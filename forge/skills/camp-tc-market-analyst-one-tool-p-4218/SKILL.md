---
name: camp-tc-market-analyst-one-tool-p-4218
description: At the start of any run where you plan to use build_tool, before writing deliverables.
---

1. Decide up front which single build_tool call this run needs (usually one verifier for the deliverable's core arithmetic).
2. Call build_tool exactly once, early, before the long output work; it returns pass/fail on the example input immediately.
3. Do not attempt a second build_tool call in the same run — it returns "Not built: one tool per run" and wastes a call. If you also want a learn_skill, that is a separate budget (max 2/run) and is fine alongside one build_tool.
4. If the tool fails its test, fix the logic via the run's other channels (inline checks) rather than rebuilding; save the improved version as a learn_skill or in agent-homes/files for next run instead.
