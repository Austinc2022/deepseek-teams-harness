---
name: learned-coaching-charge-verify-at-sour-0edc
description: Whenever a growth trigger, reflection or critique claims an agent or team fell short (method, instructions, knowledge, tools), before any report_gap, update_agent or camp_retrain.
---

Steps for every coaching wave:

1. Lay out each critique as written: who raised it, the alleged failure, the artifact or run id it points at.
2. Open the primary evidence yourself — ticket folder files (REPORT.md, NOTES.md, patches/, tests/) or raw agent transcripts (transcript_search / run ids). Quote exact file:line. A critique's own summary is not evidence.
3. Classify each critique against the FINAL state of the artifact: SURVIVES (failure present in what was delivered), STALE (describes an intermediate state the final patch already fixed), WRONG (evidence contradicts it), UNVERIFIABLE (evidence is outside my access). Charge only SURVIVES.
4. Split failure class before choosing a category: agent negligence (method/instructions/knowledge) vs environment or access limit (e.g. checks labelled NOT RUN because the sandbox cannot execute them = tools/access gap, not method). Charge the right category or the wrong remedy gets applied.
5. Keep counter-evidence in scope: if the same agent does this correctly in other contexts (e.g. single-critic panels vs multi-critic panels), say so — it points to a narrow instruction fix, not a model or staffing change.
6. File one report_gap per root cause, not one per repeat: category + remedy from the allowed list, evidence with file:line and strength (measured / simulated / argued). Two tickets repeating one cause get one remedy, noted in both.
7. If the remedy is a role/instructions edit via update_agent: pass the role text WITHOUT the hard-rules block — the harness re-appends it, so passing it duplicates the block (seen in vr-harness-engineer.yaml 2026-11-24). Read the config file once afterwards to confirm exactly one block.
8. Arm exactly one successor watch: the next checked output is judged only on the charged classes. One clean read closes the watch; a first repeat escalates to the coach (camp_retrain) with concrete wrong examples. Never re-litigate the same critique twice.

Mistakes to avoid:
- Charging from the critique text or a summary alone.
- Charging an intermediate state the final patch fixed (always diff against the delivered state).
- Charging an access/environment failure as method or instructions.
- One gap per ticket instead of one per root cause.
- Editing role text that includes the hard-rules template (duplicates it).
- Closing a watch on promises instead of one checked read of real work.
