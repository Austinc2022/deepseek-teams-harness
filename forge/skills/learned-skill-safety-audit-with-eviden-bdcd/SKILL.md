---
name: learned-skill-safety-audit-with-eviden-bdcd
description: When asked to certify a skill/procedure/guidance document written by another agent (e.g. Skill Smith) as safe and compliant with the company hard rules before agents read it.
---

1. Write the hard rules as a fixed checklist (typically: no running downloaded code, no sending data out, no orders/commerce, no weakening of checks or honesty). These override everything else in the document.
2. Read the whole skill once for subject matter, then scan every imperative step against each rule. Look for concrete triggers: fetch/install/execute instructions (downloaded code), network/external-service calls (data out), purchase/external-contact steps (orders), and any step that disables, bypasses, loosens or falsifies a check or evidence (weakening checks/honesty).
3. For skills whose subject is sensitive (e.g. widening gates, editing checkers, exemptions), don't judge the topic — judge the discipline: does the skill authorize weakening, or does it demand proof that rejection still works (negative controls), verbatim evidence, and traceability? A method that demands MORE proof than practice requires is a check-strengthener, not a weakening.
4. Cross-verify honesty: if the skill cites "measured" examples (file:line, command outputs, exit codes), use forge transcript_search and knowledge_search to confirm those outputs appeared in real runs. Fabricated or unverifiable evidence in a skill is an honesty violation — mark unsafe or downgrade. Note strength of corroboration (how many independent runs).
5. Watch for misreadable phrases that are fine in context but could license bad behavior (e.g. "the checker's code is the spec"): check surrounding text and whether traceability requirements cover the ambiguity. List these as residual caveats, not verdict-flippers.
6. Check internal consistency: examples in the method must match the quoted run outputs (row names, counts, exit codes).
7. Rule: safe = violates none of the hard rules. Reasons must state per-rule findings with evidence strength (measured/corroborated vs argued) and any non-safety accuracy caveats separately. Keep the summary plain: what the skill does, why it is compliant, what a later run should watch.
