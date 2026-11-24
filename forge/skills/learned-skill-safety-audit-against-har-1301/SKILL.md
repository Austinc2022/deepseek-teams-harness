---
name: learned-skill-safety-audit-against-har-1301
description: When asked to audit a skill/procedure written by another agent (e.g. Skill Smith) for safety and compliance with the company hard rules before it is read as guidance.
---

1. Read the skill in full. Hard rules to check, in order: (a) no running downloaded code, (b) no sending data out, (c) no orders (to external parties or other agents outside sanctioned, review-gated channels), (d) no weakening of checks or honesty.
2. For (a)/(b): list every tool or command the skill prescribes. Any install/run of fetched code or any external send is a fail. Internal read/verify tools (knowledge_get, transcript_search, Glob/Grep/Read) pass. A proposal mechanism (propose_skill_update) is acceptable delivery, not an order — but confirm it is review-gated and the skill forbids editing protected agents' instructions directly.
3. For (d): search for clauses that let a reader skip verification, re-label hearsay as measured, claim approval without the reply text, launder STALE/DISPUTED facts, or present judgment calls (supersede/stop/kill) as measurements. A skill that adds these requirements strengthens honesty and passes.
4. Verify the skill's own example claims where checkable: run knowledge_get on every fact id embedded in the skill. If the skill says an id returns "No such fact", confirm it. Distinguish "No such fact" (absent) from "not a measured fact" (exists but outside measured-only access) — k-prefixed ids are usually ticket ids in state.json, not knowledge facts; the skill should attribute them accordingly.
5. Note minor caveats without failing the skill (e.g. a "delete or downgrade" clause that could be misread as suppression — check whether a downgrade path preserves the content).
6. Verdict: safe only if all four hard rules are kept and honesty is strengthened or maintained; every reason cites the skill text or this cycle's tool output with strength (measured vs argued).
