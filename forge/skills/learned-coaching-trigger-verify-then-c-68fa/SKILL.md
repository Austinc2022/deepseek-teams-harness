---
name: learned-coaching-trigger-verify-then-c-68fa
description: When a growth/coaching trigger arrives ("X fell short on <category> N times"), before any charge, remedy or role edit.
---

1. Take each critique in the trigger as an ALLEGATION, not evidence. Find the primary source first: transcript_search for the raw output/run file it cites, or knowledge_search for the fact id, and open the cited file:line yourself (Read/Grep). Stale or misquoted critiques get no charge.
2. Classify the root cause before choosing a remedy: agent negligence (fix with report_gap + update_agent role/skills), environment/tool impossibility (report_gap with the "access" or "tools" remedy; say plainly the agent's conduct was correct if its disclosure was), or panel/system artifact (instructions rule, e.g. a NO VERDICT fallback).
3. File report_gap with measured evidence lines (file:line, run ids, fact ids) and remedy; state sample sizes and keep counter-evidence (e.g. the same agent giving a good verdict elsewhere) in the gap text so the coach sees real scope.
4. Apply the durable fix where reachable: update_agent role/skills for agents in your reports list (check state.json reports.agents first), propose_skill_update for protected agents (auditor, worker template, verifier). TRAP: update_agent's role branch REPLACES role text and the harness RE-APPENDS the hard-rules template — pass role text WITHOUT the template block (proof: duplicated blocks in vr-harness-engineer.yaml after passing it twice), then verify with a quick grep of the yaml.
5. Arm one follow-up read (plan item): the next checked output judged on exactly the charged class; one clean read closes it, a repeat escalates to the coach. If the fix landed mid-delivery, note the timing caveat — the output is weak evidence of the remedy.
6. Close with memory_save (what was verified, what landed, the trap) and rate_work on the specific piece of work you judged, with deductions tied to evidence. Never score an agent on critique text alone.
