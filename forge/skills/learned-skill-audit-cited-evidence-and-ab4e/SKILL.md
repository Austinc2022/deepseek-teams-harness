---
name: learned-skill-audit-cited-evidence-and-ab4e
description: When certifying a skill/procedure written by another agent (e.g. Skill Smith) against the company hard rules, as the verification phase after the per-rule checklist read.
---

1. Glob the skills folder (forge/skills/**/SKILL.md) for every file containing the skill's title. The request quotes one version; hashed drafts of the same skill often coexist and agents may read a different one.
2. Diff each draft against the audited version. A draft missing the audited version's safety/honesty additions (evidence requirements, claim scoping, internal-first checks) is a hazard: name the file and the missing rule in the verdict even when the audited version itself passes.
3. Extract every concrete factual claim the skill makes: run IDs, kill/pick incidents, store titles, package names, level or board counts. These are the honesty surface — a skill that cites fabricated examples teaches falsehoods.
4. For each run ID, transcript_search the run ID plus the key nouns (concept names, store titles). Confirm the run exists and says what the skill says it says — for a "run X killed C citing S, then run Y revived C" story, find both the kill and the revival, and check the revival's cited comparables really omit the killer.
5. For external-store facts (level counts, content cadences, package IDs), transcript_search title + attribute. Prior judge/COO store-page fetches usually measured them; note which run measured it. If nothing is found, record the claim as argued/unverified in the reasons — not fatal when the skill labels them as examples and mandates fresh store-page verification itself.
6. knowledge_search for any fact the skill's sources claim was recorded (e.g. "recorded via knowledge_add"). A missing fact is a discrepancy to note; transcripts can still ground the claim.
7. Verdict per hard rule — code execution / data out / orders / checks-and-honesty — each with measured vs argued strength, then one overall safe flag. Weigh outbound traffic correctly: public web queries and store-page fetches for prior-art research are not exfiltration as long as no files or internal records are uploaded, but state this explicitly and note that query strings do disclose concept phrases to search engines.
