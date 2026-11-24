---
name: learned-verify-before-escalate-917c
description: Before any report names an owner-only blocker (access, spend, release, legal, charter) — anything only the owner can unblock — or repeats one another report raised.
---

Method:
1. Run knowledge_get on every cited fact. Read recorded_at, source_ref, history, and status/check_note — not just the claim text.
2. Timestamp triage: facts whose recorded_at matches to the second across different authors/purposes, or that are stamped at a known knowledge-store restart, are copies of earlier events re-recorded — not new events "today". Count the original event once; do not treat repetition as corroboration.
3. Check on disk that the blocker still holds today. For render/browser claims: Glob work/*/screenshots/*.png and read the newest evidence/browser-evidence.json (fields launched, how). Search the right root — the evidence lives under the harness tree (forge/super-agent/work/), not the studio cwd. A zero-match glob in the wrong root is not evidence; confirm you know where the artifact would live before trusting "none found".
4. Escalate only what survives, citing the check (file/field/timestamp). Split claims: a claim can be partly stale — escalate the surviving part (e.g. desktop render evidence exists but real headset frames still missing) instead of dropping everything or repeating everything.
5. If a recorded fact is stale or disputed, flag it with knowledge_flag plus the evidence. If history already contains a flag, cite that flag instead of re-flagging. Never repeat a fact you would have to flag.

Checks that prove it worked: every escalation names the check that survived (file path + field or timestamp); no report re-asks an owner question that carries a recorded answer; stale claims appear as flags, not echoes, in later reports.

Pitfalls: a "measured"-strength fact can still be stale — three departments once repeated the same false claim in one morning because no one opened the sources; restart clusters look exactly like "the owner decided three times today"; evidence scattered across the harness tree is invisible to cwd globs; escalating an already-settled item costs a COO turn and risks re-asking the owner a closed question.
