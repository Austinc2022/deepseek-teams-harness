---
name: learned-verify-work-claims-before-scor-aaf6
description: Judging any agent's work that cites files, line numbers, knowledge facts, or measurements — before assigning a score.
---

1. Extract every checkable claim from the work: file:line citations, fact IDs, timestamps, ordering claims, numeric constants.
2. Verify a sample of at least 5-8 against the actual filesystem (Read/Grep/Glob). Check the cited line numbers AND nearby lines — a shifted line number often just means the tree changed after a time-stamped snapshot; confirm internal consistency rather than faulting it.
3. knowledge_get each cited fact ID. Note: argued facts return "Not available to you (not a measured fact)" — that is inconclusive, not a fabrication; do not penalize either way.
4. For contested or source-related claims, transcript_search the key terms. Prior runs often document the same finding (e.g. a source being unfindable or a number being user-specified); this separates "correct but under-corroborated" from "wrong".
5. Verify mechanism claims (e.g. "these tests build X from Y so changes flow through") in the code, not just the doc.
6. Judge completeness against the LITERAL ask separately from the spirit: check routing instructions were honored (or the deviation recorded), deferred items have a tracked artifact, and the fix list covers the root cause (e.g. a tool that computes from a bad constant, not just the doc that quotes it).
7. Score correctness/evidence/completeness/usefulness; never length or confidence. Distinguish measured / simulated / argued evidence and say which.
