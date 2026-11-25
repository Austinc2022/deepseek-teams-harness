---
name: learned-knowledge-conflict-verdicts-88bf
description: When adjudicating recorded facts that carry a dispute/check_note (status conflict) and need a confirmed/outdated/wrong/unclear verdict against ground truth.
---

1. Pull the fact with knowledge_get: read claim, kind, strength, valid_from, recorded_at, source_ref, check_note, and history (who flagged what, when).
2. Spot the knowledge-store restart artifact: facts recorded_at 2026-11-24T08:41:39.5x-.57Z are 2026-11-11-era records re-stamped at restart. For decisions, trust company.json decision fields (ts/askedAt/answeredAt/decidedAt), not the knowledge stamp. valid_from often holds the real date (e.g. backfills show 2026-11-11T06:26).
3. Read the files the claim names, at the named lines: .gitignore, plugin source (generic.js/engine.js/setup.js/super.js), state.json/company.json entries, ticket NOTES.md. Verify the dispute's line claims independently (they are usually right but not always).
4. Classify strictly: confirmed = source shows the claim; outdated = true at valid_from/its timestamp but superseded by later data or code; wrong = source contradicts it or never showed it (a claim recorded after the counter-evidence existed is wrong, not outdated); unclear = a figure/branch cannot be reproduced (say which part).
5. Mixed claims: one verdict per fact; pick the verdict for the load-bearing part (limits, kills, blocker claims) and preserve what still holds in the evidence text so future runs do not lose true sub-claims.
6. Gate/kill records: a faithful record of a verdict that was produced wrongly is "wrong" as a result fact — check the invocation (e.g. artifact root in the proposal record vs where the required files actually live) before confirming a failure.
7. Timestamped snapshots ("as of 12:48Z...") are usually outdated the moment state.json/company.json moved on — re-read the live record and cite the superseding field.
8. Keep claim strength (reportedly/about/simulated) untouched; cite ref as file:line, run id, or fact id. Numbers in evidence: counts, line numbers, ISO timestamps.
9. Glob patterns recurse into node_modules — for folder listings use exact file Reads or targeted Greps; count screenshots with **/screenshots/*.png and expect >100 hits under forge/super-agent/work.
