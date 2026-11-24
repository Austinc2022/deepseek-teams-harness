---
name: learned-coaching-trigger-and-disputed-6c4b
description: When a growth/coaching trigger names an agent that fell short, or when a knowledge fact you wrote is flagged/disputed by another agent.
---

1. Read the trigger's named failures and the suggested remedy; distinguish instruction gaps (fixable now) from method gaps (need a skill) from infra gaps (not the agent's fault — do not coach on them).
2. Before fixing, check whether the agent is protected (auditor, worker template, verifier, or anything the system rejects with "protected: its rules are the owner's"). Unprotected: update_agent role with concrete, numbered, testable rules (e.g. "measured = a path or command YOU ran THIS cycle"; "knowledge_get before citing any fact id"; "never attribute approval without quoting the reply text"). Protected: route through its playbook — propose_skill_update with the evidence from the trigger.
3. For a disputed fact: do not defend or ignore it. Re-verify every disputed claim AT SOURCE (Grep/Read/Glob the file or data yourself) within the same turn. Line numbers drift; cite content. If the flag is right, record a corrected fact (knowledge_add) that names what was wrong AND what stands, and overwrite the memory note so future runs don't inherit the error. Verdicts can survive corrected details — say so explicitly.
4. Update the plan: keep the "check next output" items (probation ends at first repeat), add follow-up for skill proposals that return as events, and fix the blocker list so no downstream decision rests on a claim you corrected.
5. Forward corrections through the same purpose thread the original was sent on, so the recipient sees memo + correction together. If a reporting handle is broken (e.g. ask_agent "coo" = unknown agent), route via the working channel and record the broken link as a measured fact.
6. Never coach an agent for infra failures (API 502s, run caps, sandbox blocks) — say plainly they are config/owner matters, or the coaching pollutes the performance signal.
