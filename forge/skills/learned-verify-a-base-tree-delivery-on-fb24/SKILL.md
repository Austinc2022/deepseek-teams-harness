---
name: learned-verify-a-base-tree-delivery-on-fb24
description: A builder reports an infrastructure or starter-tree ticket (kit, harness, tools) 'ready' and other tickets will build on it, so you must decide whether it becomes the base and what the consumers need to know.
---

## Goal
Decide in one pass: does the delivery hold up, is it the new base, and what exactly must downstream tickets change? Do this without opening tickets that compete for the shared model quota.

## Steps
1. **Read the change map first (CHANGES.md or similar).** Every edit row needs: file:line, the test that proves it, and a FAILING CONTROL quoted from a real run on the pre-edit code. Treat a row with a passing test but no failing control as unproven. Count the rows against the brief's numbered edits. Extra edits are fine if justified, but note them.
2. **Read the evidence JSON itself, not the summary.** Check:
   - status, and zero counts for console errors, page errors and non-local requests;
   - a threshold stated in the file for any "nonblank" claim;
   - the renderer string (SwiftShader means no fps claim is allowed);
   - which metrics are null and why.
3. **Check that the timestamps agree.** Compare `generatedAt`, `header.startIso`, `runSeconds` and the runId. If generatedAt is earlier than startIso, grep the writer for where each field is set (one may be stamped at script start, the other at write time). Auditors read inverted timestamps as tampered or stale evidence, and evidence hygiene is a repeat gate objection.
4. **Look at the screenshot** with the Read tool. Confirm it shows a real frame, not blank, an error card or a loading screen.
5. **Check the tree for what a consumer would copy.** Look for scratch/verify copies, node_modules and dist inside the deliverable. Find out from the freeze/hash tools which of these are REQUIRED (e.g. scratch/base for a hash-identity row), and write the copy recipe with explicit excludes.
6. **Read the consumers' NOTES.md before messaging them.** They may already have switched to the new base through a readiness rule. Then send only the deltas: fixes to apply in THEIR copy, each with a failing control. Say plainly that the base folder is read-only for them.
7. **Record, in this order:**
   - rate_work with the specific deductions;
   - plan items done, with the copy recipe in the note;
   - a backlog item for the next base version, which depends on the consumer's plan item and has NO auto-open ticket while the consumer is using the shared quota;
   - a knowledge fact;
   - the initiative confidence change, with the reason it is not higher.

## Evidence strength
- What the worker ran is hearsay for you, even when you checked the artefacts on disk. Say "worker-measured, COO-checked".
- Only what you ran or read directly yourself is measured. Example: a file:line showing where a field is set.

## Mistakes to avoid
- Trusting the report summary over the files. Inverted timestamps and null metrics only show in the JSON.
- Opening the next-version ticket right away. It steals quota from the game build that depends on the current version.
- A plan item with dependsOn set to a TICKET id does not hold back an auto-open ticket. Gate on plan item ids, or use open_ticket with dependsOn.
- Reading another super agent's ticket folder when read_ticket refuses. Use knowledge facts and the facts snapshot instead.
- Messaging a consumer with instructions it has already carried out. Read its NOTES first.
