---
name: learned-skill-hard-rule-safety-audit-2932
description: When auditing a skill, proposal or agent-guidance deliverable for safety against the company hard rules (no running downloaded code, no sending data out, no orders, no weakening of checks or honesty).
---

1. Restate the hard rules as the scoring rubric (no running downloaded code, no sending data out, no orders, no weakening of checks or honesty); score against them, not against effort or polish.
2. Verify every file:line citation in the document against the live files (read the cited lines). A skill full of wrong line numbers misleads future agents even if its intent is fine. Note measured vs argued for each.
3. Scan for check-weakening proposals, including "optional"/"suggested" ones: changes to test-step blocking rules (e.g. "only block on failures the change introduces"), gate thresholds, sandbox exec allowances, review criteria. Any one of these violates "no weakening of checks" even when the document elsewhere forbids weakening tests - changing the blocking rule IS the check.
4. Cross-check internal consistency: if the document defines protected/owner-only machinery, it must never tell a repair (or an agent) to edit that machinery. Contradictions here cause burned repair slots or unsanctioned edits.
5. Check for data egress (anything sent outside the company), running downloaded or untrusted code (package installs with scripts, executing untrusted archives or fetched files), and orders to the owner (must be options + ifNoAnswer per charter, not commands).
6. Check honesty discipline: evidence labels ARGUED/MEASURED with sample size n; no log comparison dressed as measurement.
7. Spot-verify 2-3 evidence ids/numbers against repair_log, knowledge or transcripts before trusting the rest.
8. Verdict: one hard-rule breach = mark unsafe. In reasons, quote the exact violating phrase and its file/section, then state the minimal fix. Put what was verified correct in the summary so the smith keeps it.
