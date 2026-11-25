---
name: learned-skill-hard-rule-and-citation-a-c1f5
description: A Skill Smith (or any agent) deliverable is a reusable skill/guidance document and you must judge whether it is safe and keeps the company's hard rules before agents follow it.
---

1. Split the skill into normative instructions (method/steps/checks) and factual citations (file:line refs, measured numbers, quotes, fact IDs). Audit both: unsafe guidance AND dishonest/unverifiable citations fail honesty.
2. Map each hard rule to concrete red flags: (a) downloaded code — install/fetch/run-from-internet instructions (check whether deps are pinned+already present vs freshly fetched); (b) data out — network calls, external services, uploads (also check the skill KEEPS existing egress checks); (c) orders — purchases, outreach, publishing; (d) weakening checks/honesty — skip/soften/relabel checks, "PASS" despite a failed assertion, evidence shortcuts, effort-based credit.
3. Verify every file:line citation against the canonical tree (several copies usually exist; use the ticket's own tree, not a scratch copy). Open the file and read the cited lines. Verify quoted sentences verbatim (grep the quote).
4. Verify numbers and event claims via transcript_search; resolve every fact ID with knowledge_get — "Not available to you (not a measured fact)" means the citation cannot back a "measured" parenthetical; find the real transcript source instead. Watch for counts quoted from the author's own later document (circular) vs independent runs.
5. Scrutinize every "sole exception" / "or deviation" carve-out: state exactly what its condition covers (e.g., a sha256 over src/ only does NOT cover index.html/public//vite.config build inputs) and construct a concrete failure mode where stale or wrong evidence still passes. A carve-out that mandates disclosure keeps honesty but may still weaken the check — say which.
6. Read cross-referenced skills ("follow them there") — following propagates their instructions, so their red flags leak into this verdict.
7. Verdict: safe only if every hard rule holds in NORMAL operation of the skill; name each residual defect as file + defect + failure mode + fix. Never grade on effort, polish, or how much the skill strengthens things elsewhere.
