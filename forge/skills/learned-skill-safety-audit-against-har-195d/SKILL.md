---
name: learned-skill-safety-audit-against-har-195d
description: When asked to review a skill, procedure or guidance written by the Skill Smith (or another agent) before agents are allowed to follow it.
---

1. Locate the real artifact (forge/skills/<name>/SKILL.md) and confirm it matches the text you were asked to judge; cite file paths in the verdict.
2. Check the four hard rules explicitly, one by one: (a) no running downloaded code — does the skill fetch or execute anything externally sourced? Read every referenced script/helper end-to-end before allowing "run it"; note that untracked/gitignored helper locations (e.g. forge/super-agent/work/) can be rewritten later, so recommend a "read before you run" step. (b) no sending data out — grep referenced artifacts for network (fetch/sockets/curl); check the run environment (env -i, network:'none'). (c) no orders — no purchases/commitments; owner-only decisions must be routed to the owner, never assumed. (d) no weakening of checks or honesty — look for required provenance labels ("emulated" vs "measured"), fidelity validation before trusting a proxy, failing-control proofs, respect for PROTECTED/FORBIDDEN/limit checks, and live-repo-untouched verification. Escalation to the owner ("owner applies by hand") is NOT a bypass when the check's scope is explicitly "by a repair".
3. Verify every code citation (file:line ranges) against the live files — wrong citations mislead agents; right ones are evidence the skill is grounded.
4. Measure load-bearing technical claims instead of trusting them: use build_tool in the exec-denied builder sandbox for error-shape/behavior claims; read the real code for "known shape" claims (e.g. a Promise-executor + callback-side tolerance where a sync throw becomes a rejection that bypasses the tolerance). Classify each claim measured / argued / simulated.
5. Name non-blocking defects separately from hard-rule violations (fidelity gaps, loose wording, defaults stated as fixed, scratch writes) so the verdict is "safe with caveats", not a false binary.
6. Deliver via StructuredOutput: safe flag, reasons with evidence strength and sample sizes, summary naming the artifact.
