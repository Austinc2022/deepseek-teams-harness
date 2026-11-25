---
name: learned-aar-for-zero-output-tickets-a4eb
description: Writing an after-action review of a ticket whose worker ended without a report (API/chain error, zero work done) and you must extract lessons without any task material.
---

# After-action review for a zero-output ticket

## When to use
The worker "ended without a report" — an error result (free-chain 502 exhaustion, weekly limit, crash) and no deliverable. The builder's notes are empty. You have a brief but no execution.

## Steps
1. Confirm zero output before writing anything: check the builder's notes ("(nothing yet)" is the signature) and Glob for the brief's done-when artifact (SPEC.md, ACCEPTANCE.md, …). Absence is the evidence the brief was never executed. Do not infer execution from the brief text.
2. Classify the death cause from the error string: chain exhaustion ("every candidate: … failed") vs account limit ("weekly limit") vs crash. These are infrastructural, not task-shaped — no task-method lesson exists, and inventing one from the brief is fabrication.
3. Check whether a successor delivered the same done-when: knowledge_search the ticket id and the deliverable name. If a superseding ticket exists with its id and artifacts named in the header, verify the claim against knowledge facts (or a disk check) and say so with strength labels.
4. Write only triage lessons (max 2): (a) don't retry a chain-exhausted ticket on the same chain — supersede to a fresh ticket; (b) the superseding header should name the successor ticket id + what it delivered, so replacement work is verifiable without re-opening trees.
5. Mark zombie risk: if the ticket is still "open" in state and its done-when artifact does not exist (same free-chain 502 signature), flag it — open tickets whose only assignment died on 502 linger forever.

## Checks
- Every claim about the successor's delivery is either labelled with its knowledge fact id and strength, or marked unverified.
- No lesson is written about the brief's subject matter (here: smoke tests, xr-lifecycle) — that material was never worked.

## Pitfalls
- Writing plausible task lessons from the brief alone. The brief is a plan, not evidence.
- Treating the superseding CEO's summary ("7 edits, failing control") as fact without resolving it — quote the fact id and its strength instead.
- Re-running the same one-turn ticket after "exhausted every candidate": all candidates failed in one pass; a retry reproduces the same 502.
