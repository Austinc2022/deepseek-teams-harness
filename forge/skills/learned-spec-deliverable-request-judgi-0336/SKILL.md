---
name: learned-spec-deliverable-request-judgi-0336
description: When scoring an agent report against a request that names a concrete deliverable (spec text, plan, checklist) with numbered constraints, possibly referencing other tickets/agents.
---

1. Restate the request as a checklist: each numbered requirement plus the negative ones ("do NOT ..."). Identify the ONE artifact the request asks for and its format/line budget.
2. Locate the requested artifact in the work text (headings, verbatim block, line count). If absent, completeness-for-what-was-asked is ~0 and the score stays low no matter how polished the surrounding content is. A report that re-delivers content the request explicitly closed ("already delivered and accepted") is a task-comprehension failure, not credit.
3. Verify every measured claim by reading the cited file:line on disk (read-only). Check internal consistency of cited artifacts: timestamp order (generatedAt vs header startIso), required fields null, hash/runId matches. The bug the request complains about is often visible in the very file the work quotes.
4. If the request references sibling tickets/agents ("mark what X already does"), open the sibling tree and grep for the named fixes yourself before accepting any claim. Confirm the work actually consulted it — "already building on it" is not a per-candidate backport mark.
5. Weigh the axes with completeness-as-asked primary: correctness and evidence discipline of off-task content earn only small credit. Anchor: 0 = no relevant output, 50 = partially fulfills with major gaps, 100 = best in field (deliverable complete, evidenced, all cross-references done).
6. Keep `why` to two sentences (what is good, what is missing) and make capability gaps concrete: who, category, gap, file:line evidence, remedy.
