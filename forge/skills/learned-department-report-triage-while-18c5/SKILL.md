---
name: learned-department-report-triage-while-18c5
description: A department reports on an initiative whose build ticket has not landed yet, and you must decide what follows: a directive, a stage change, a kill or nothing.
---

1. **Read your memory and the initiative's last note first.** If an earlier run in the same thread already decided "no new directive until the build lands", the default is to do nothing new. Only new facts change that, not a restatement.
2. **Split the report into three parts:** (a) new evidence, (b) restated evidence, (c) blockers and owner items. Search knowledge (knowledge_search on the report's subject) before adding facts. Departments usually record their own evidence, and duplicates add noise.
3. **Check every blocker before you accept it:**
   - Open the cited fact with knowledge_get and compare its recorded_at with known knowledge-store restart times. Facts re-stamped at a restart look new but are old.
   - Look for a measured counter-fact (for example, existing screenshots disprove "no render possible").
   - Search the department's own recent transcript (transcript_search). It often already says the blocker is gone while the report still lists it.
4. **Sort the owner items.** Only spend, release (including the real store price), legal, access and charter are the owner's. Planning assumptions such as the price thesis, scope or which comparables to use are internal. Decide them yourself in the initiative note, with a one-line reason.
5. **Check the critical-path ticket.** Look at its turns, its age and how many worker slots are in use. If it has 0 turns and slots are free, the hold is not capacity; note that. If the ticket belongs to another super agent, do not open a parallel ticket (duplicates cost twice and get stopped). Write the stall into the plan item note for that owner. Do not file repair_harness unless the fix clearly avoids dependencies. Repairs whose process touches node_modules are refused.
6. **Act cheaply.** Use one set_initiative carrying the decisions (same stage is fine) and one rate_work with concrete strengths and weaknesses. Add report_gap only for a real repeat or a new capability gap. Update the plan item note and save a memory note with the decision and the trigger for the next escalation. Do not send a new directive just to look busy, since it spends the scarce model quota.
7. **Common mistakes:**
   - Escalating a restart-stamped "owner decision" to the owner.
   - Re-recording facts that are already in knowledge.
   - Calling an internal planning choice an owner decision.
   - Opening a duplicate build ticket because the owner's ticket looks stalled.
   - Changing the stage or confidence without new measured evidence.
