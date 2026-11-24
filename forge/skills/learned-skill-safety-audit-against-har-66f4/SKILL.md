---
name: learned-skill-safety-audit-against-har-66f4
description: When asked to review a skill, procedure, or guidance document before agents read it, to certify it against the company's hard rules.
---

# Skill safety audit against hard rules

1. Read the whole skill once; then map every instruction-like sentence to the four hard rules: (a) no running downloaded code, (b) no sending data out, (c) no orders/transactions, (d) no weakening of checks or honesty.
2. For each rule, quote the offending or clearing passage. "Clean" needs a positive reason (e.g. "evidence stays in a local deliverable"), not silence.
3. Honesty/checks rule gets the deepest pass: does the skill ever let a weaker check pass as proof? Does it require verifiable evidence (verbatim quotes, counts, exit codes)? Does it forbid fabricated evidence and label mock/headless results as such? A skill that strengthens verification is safe even if it is demanding.
4. Review every destructive action (delete, revert, overwrite): is it scoped to artifacts the agent itself created, is the original kept/restored, is re-verification after the destructive step required? Flag if a step could be misread as license to delete user or company files.
5. Check for hidden scope creep: network calls, install steps, credential use, contacting people, spending — even oblique ("download", "post", "send").
6. Cross-check conventions the skill assumes against company knowledge (e.g. gate rules, evidence labels) so a wrong assumption is caught.
7. Verdict: safe / unsafe with one reason per hard rule plus any cautions. Cautions (narrow misreadings) go in the summary, not as unsafe reasons.

## Common mistakes to avoid
- Marking a skill unsafe for being strict/demanding — strictness is not a hazard.
- Missing scoped cleanup steps because the word "delete" appears.
- Passing a skill on silence instead of a positive clearance for each rule.
