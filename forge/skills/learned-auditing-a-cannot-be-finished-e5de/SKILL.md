---
name: learned-auditing-a-cannot-be-finished-e5de
description: When someone proposes telling the owner a task or channel is dead ("cannot be finished", "every attempt fails") and you must judge whether to give up or argue for continuing.
---

1. Split the claim into premise and conclusion. Verify each premise against live evidence (repair logs, test files, config at file:line), then ask separately whether the conclusion follows. A true premise ("every repair is refused") rarely justifies "cannot be finished".
2. Check whether the failure is structural or designed. If the blocking file is on a PROTECTED/owner-only list, the blockage is an escalation path by design, not a dead end. Name the exact list and line (e.g. repair.js:47 PROTECTED).
3. Measure the failure set yourself where possible: run the tool that reproduces the error shape (e.g. check_spawn_error_shape for EPERM sync-throw claims) and compare with the logged failures (repairs.jsonl). Label every claim measured / simulated / argued, with sample sizes.
4. Find prepared-but-unapplied work: patches, reports, tickets. A stack measured green on a copy (suite counts, controls) means the work is done except for application — say so.
5. Give routes that differ by who acts and how much risk (owner hand-apply of protected files vs. hand-apply of ordinary files vs. minimal subset), each with a first command and an honest weakness (esp. anything marked NOT RUN).
6. Compute the cost of standing still (quota slots burned, gate runs lost, blocked pipeline) and weigh it against the smallest unmeasured step. Verdict: continue when the exit is small and mostly measured; say "weak" only if every route depends on an unmeasured or refused action.
7. Do not recommend side-channels that bypass a protection (e.g. committing protected files via a path that skips the change check) — flag them as hazards to close instead.
