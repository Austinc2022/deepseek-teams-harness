---
name: learned-advisor-findings-merge-with-so-f1f6
description: When you lead an advisory review and must merge several advisors' findings into one graded review with scorecard, ranked recommendations and follow-up verdicts.
---

1. Read the company facts file (CONTEXT.md) first; mark every number the advisors cite as matching, wrong or stale (spot-add the spend series, count open tickets, check unit scores and KPI block yourself).
2. Re-verify the highest-stakes claims at the source before merging: code-line citations (e.g. maxTurns in agent yaml, counter increments in super.js, slice() caps in org.js) and decision records in company.json. Advisors cite paths loosely (org.js vs plugins/super-agent/lib/org.js) — resolve the real path and read the line.
3. Check for state drift between the advisors' snapshot time and merge time: re-read every decision status. A 'held' question may have been asked after the advisors wrote; rewrite that recommendation (it changed) instead of repeating it, and flag the outdated knowledge facts with the new evidence.
4. Merge recommendations across advisors by theme (spend question, harness caps, ticket dedup, gate decision execution, KPI anchoring, gate-slot protection); keep at most 8, rank by value to the north star; drop stale sub-claims (e.g. 'stop ticket X' when X is already ended/stopped); assign one owner, one KPI and one measured label per recommendation.
5. Follow-ups: one verdict per earlier recommendation id; correct advisors' verdicts where the schema disagrees (non-adoption = not-done, not no-change; action taken but effect unknown = too-early).
6. Watch for meta-channel defects: if the facts file claims 'first review' while earlier review folders exist on disk, the advisory→company channel is dropping outputs — report it as a finding and record it as a knowledge fact.
7. Record new measured facts (decision status changes, verified unexecuted decisions) and flag the ones the merge made obsolete; write the structured output last.
