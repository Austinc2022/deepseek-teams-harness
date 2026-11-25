---
name: learned-routing-an-owner-locked-fix-to-3059
description: A department proposes a fix (agent role text, a verifier or harness rule) that is owner-protected or known to fail, for a failure class that keeps recurring in builder work.
---

## Routing a protected or blocked fix to levers the COO controls

1. **Check the claimed gap against the current source first.** Open the exact file and lines the report blames, in the newest frozen base (for example the kit version the next game forks), not the older tree the failing game came from. Reports often cite an old fork's code as if it were the current convention. Record what is really missing as a measured fact, with file:line.
2. **Sort each proposed lever by owner:**
   - Role text of a protected agent: owner-only. Do not ask; route it to step 3.
   - Harness or verifier change: check the knowledge base for a known reason repairs fail (for example 'repairs cannot pass the test step'). If repairs are known to fail, do not file one; route it to step 4.
   - Skill: check recent retirement data (for example builder skills retired at 59% against an 85% baseline). If the channel is underperforming or the skill-smith hit its daily limit, defer the skill.
3. **Brief text replaces role text.** Builders reread TICKET.md and the messages every turn. Write the rule as a short numbered block (E1..En). Each line is testable: what to re-open, what to quote, what counts as NO. Make it a standing plan item that every builder brief and fix message carries it word for word, and name the pending messages it must go into.
4. **Kit freeze rows replace verifier rules.** Turn each verifier check into a freeze or gate-lite row in the shared starter kit, each with a failing control: claim-vs-file status, a self-check answer tied to the measured capture record, cite drift. Put them in the next kit version's backlog, dependent on the current kit's disk check. Do not inject them into a kit ticket mid-turn (scope creep, output-limit risk).
5. **Proof with a date and a baseline.** Accept or define a count over the next N checked outputs (target 0, the baseline from the evidence). Make the counter also record whether each output's brief carried the block: a hit without the block counts against the rollout, not against the rule.
6. **Have the next approach ready.** Ask now, read-only, for the fallback if the count shows a repeat (for example an unprotected builder copy with the rule in its own role text, trialled on one kit ticket). Do not build it until the count says so.
7. **Set confidence honestly.** Brief text alone has a weak record when equivalent know-how was already attached and still ignored. Code rows reach only future forks. Say which outputs each lever can affect.

### Mistakes to avoid
- Accepting a 'capture is wrong by construction' claim without opening the current capture code.
- Filing a harness repair that is known to fail, or asking the owner about something that brief text can do.
- Adding items to a plan at its item cap: remove finished items that no open item depends on first.
- Deciding a build request that another thread is already handling. State your view in a plan note instead.
