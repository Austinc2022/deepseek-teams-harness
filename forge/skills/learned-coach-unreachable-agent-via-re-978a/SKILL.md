---
name: learned-coach-unreachable-agent-via-re-978a
description: When a coaching trigger or your own weak-work finding names an agent whose config you cannot change with update_agent — anyone outside your reports.agents (e.g. coaching vr-ceo from a department head).
---

1. **Verify the charges yourself before filing.** Fresh Grep/Read this cycle; the judge's line numbers will have drifted. Say which part holds (often the substance) and which fails (usually the labeling).
2. **Check reachability in source first.** `plugins/super-agent/lib/org.js`: `updateAgent` requires `canReach(me,'agents',name)` = `isRoot(me) || me.reports.agents.includes(name)` (org.js:61,135); `isRoot = !me.parent` (org.js:58). Only the `ceo` record has `parent: null` (state.json `agents[]`), so a department head can never `update_agent` vr-ceo. PROTECTED (org.js:23) = auditor, worker, verifier, advisory names. If unreachable, the fix path is report_gap + self-apply, not update_agent.
3. **File `report_gap`, one call per distinct gap.** Category from the failure (method / knowledge / instructions / …), remedy matched to the cause (`use-skill` when a fitting skill exists, `update-instructions` when a rule is missing). Evidence = your verification, referencing field *content*, not line ranges.
4. **Get the skill in place.** Name the existing skill in the remedy detail; if the rule is new/general, `propose_skill_update` so the Skill Smith writes or extends one (appliesTo "all" when general).
5. **Send one `ask_agent` message (own purpose tag)** with: the verified charges (substance vs labeling), what you filed, and the self-apply prescription. Warn about replace semantics: `update_agent` **skills is the FULL list and replaces** (org.js:149); **role replaces role text** and the harness re-appends template rules (org.js:145).
6. **`rate_work` the flawed output honestly** — score substance and labeling separately in the reason; strong verification can deserve 70+ even with two method breaches.
7. **Arm a follow-up judge item** in the plan: judge the agent's next checked output on the fixes — a coaching change is only real if the next work improves. With `plan_items`, new items get *generated* ids: a same-batch `dependsOn` on a custom id errors ("not in the plan"); put ordering in the note text or set dependsOn in a second call.
8. **Save the outcome and the reachability trap to memory** so the next run does not re-derive it.
