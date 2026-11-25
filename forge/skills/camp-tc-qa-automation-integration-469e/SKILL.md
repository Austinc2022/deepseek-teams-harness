---
name: camp-tc-qa-automation-integration-469e
description: When asked to review an integration plan (or similar coordination doc) against stated acceptance criteria, acting as a critic rather than a co-author.
---

# Integration plan acceptance review

1. Fix the acceptance criteria first (e.g. deliverables accounted, conflicts name both parts, missing items have owners, order concrete). Score the plan against each one explicitly in a summary table.
2. Check inventory coverage mechanically: list every artifact the plan's own manifest names, then trace each through the body steps. Any artifact named in the manifest but absent from the steps, or handled in two contradictory places, is a finding.
3. For each finding: quote the exact line(s) with line numbers, name the violated criterion, state the concrete downstream risk (what ships broken and when it is discovered), give a specific fix with an owner or a checkable command. Never rewrite the plan.
4. Distinguish established defects from speculation: hedged language ("may", "should", "automatically", "ready") without a cited mechanism, file, or value is "unverified" — record it in a separate section, do not count it as a confirmed conflict.
5. Cross-check internal consistency: the step sequence vs the stated order line, the Conflicts section vs contradictions found in the body, Missing section vs "pending" notes elsewhere. Plans often contradict themselves; that counts against the criteria even without two external specialists.
6. Include at least two genuinely correct aspects with line references — cite the form the plan got right (e.g. a well-shaped conflict entry) so the author has a template to copy.
7. Verdict up top: accept or request changes. Add a criteria-to-findings table at the end.

Common mistakes: co-authoring the plan (adding facts you cannot verify), counting a hedged claim as a real conflict, quoting without line numbers, giving fixes without owners, skipping the "done correctly" section.
