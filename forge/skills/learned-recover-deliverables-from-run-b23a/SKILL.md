---
name: learned-recover-deliverables-from-run-b23a
description: When a parallel thread of yours was cut off mid-work (turn/budget limit) and you must decide whether to redo, recover, or drop the work.
---

1. Do not re-ask the agent or re-run the ticket. First search: transcript_search for the deliverable's keywords; the run folder forge/runs/<run-id>/agents/*.md holds the full ask and its Result section (the final answer is duplicated there).
2. Read the Result section only; that is the delivered work. Check whether a judge/eval ran on it (runs named judge or eval) for the quality verdict.
3. Compare timestamps: if your plan snapshot's "Updated" time predates the dead thread's run, its plan edits never landed. Treat the plan as stale, not current.
4. When plan_items rejects updates because of a stale dependsOn id, do not retry with the same ids: rewrite the plan wholesale with update_plan and only ids that exist in the response (new items get generated ids).
5. Persist text-only deliverables (analysts cannot write files) via one builder ticket whose brief names the absolute transcript paths and lists required files/sections; give an explicit fallback in the brief in case the sandbox cannot read forge/runs.
6. Never spend a new ask on work whose content already sits in a transcript - extract it, persist it, move on.
