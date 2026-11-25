---
name: learned-fix-pass-vehicle-at-a-ticket-s-0c2f
description: Use it when a builder ticket that is delivered, ended or near its turn limit needs another fix pass, and you must choose between messaging it and opening a continuation ticket.
---

## Choosing the vehicle for the next fix pass

### 1. Rule out a duplicate event first
A 'delivered' or 'verified' event often re-announces a turn that was already reported, for example after an earlier 'needs a step only you can take' or 'ready' event.
- Grep the tail of NOTES.md for the last checkpoint id and its timestamp.
- Compare it with the last disk check in memory or knowledge.
- If nothing is newer, do NOT re-check. Record "same turn" and move on.

### 2. Measure the turn budget; do not assume it
In state.json, find the ticket's `"id"` line, then the `autoExtended`, `extraTurns` and `rescued` fields below it, before the next ticket's id.
- limit = settings.maxAssignments + extraTurns.
- Host order once assignments >= limit (super.js turn-limit block):
  1. If not autoExtended: +4 turns, once.
  2. Else, if not rescued: the rescue, which gives +4 turns, the strongest model and a know-how search (growth.rescueTicket).
  3. Else: a forced stop.
- Any message to an ended ticket re-queues it, so it immediately consumes the next step of that ladder.

### 3. Decide
Open a **continuation ticket** (a new folder that rsyncs the old rc/ and copies NOTES.md as history) when ANY of these holds:
- (a) The old ticket's done-when has already passed the verifier, so new fix rows would not be enforced. A continuation's done-when lists every fix row, and the verifier checks them.
- (b) The fix list needs more turns than remain before the forced stop.
- (c) The old ticket is stopped. A stopped ticket cannot resume.
- (d) The next step is the gate. The gate ticket must be the one holding the final tree.

**Message the old ticket** only when all of these hold:
- the work is 1-2 small items;
- the turns remaining after the message cover them plus one battery;
- its done-when already covers them.

Spending the rescue on a fix pass leaves no reserve.

### 4. Continuation brief: required parts
- **BASE line:** the exact rsync (exclude node_modules, dist, scratch). The new ticket never edits the old folder. node_modules go into the ticket root.
- **Header, word for word:** the evidence-discipline block, the claim-level block, and the turn-end rule (at most 3 items per turn, then a 'progress' report; stop at about 80 tool calls).
- **One merged fix list** with stable ids (critique must-fix items plus your own disk-check findings). For each row:
  - the file:line;
  - a test that is red on the forked tree and the quoted red;
  - a control;
  - the done-when.
- **Kit-generic defects already fixed in a sibling game:** grep this game's tree for the same gap and add a port row only if it is present. Also check the sibling's other bug classes and say which are absent, with file:line.
- **Order:** all config and doc edits BEFORE the one battery. After the battery, only remove regenerated scratch, and state it.
- **Done-when:** every row id must appear in a NOTES table as DONE, CUT (with a reason) or NOT DONE. A missing row counts as NOT DONE.

### 5. Timing with critiques
- If two panels are running, wait up to about 30 minutes for the second after the first replies.
- Then open with what you have, and send the rest as ONE addendum. A working ticket reads it on its next turn.
- Never split one fix list across several messages to an idle ticket: parts after the first one or two are missed.

### 6. Bookkeeping
- Re-point the plan: the gate item now depends on the continuation, and the continuation item is blocked on the critique reply. A 'ready' item that is really waiting on an event triggers capacity churn.
- Rate the turn, and report a gap for any self-inflicted damage (for example, edits after the report).

### Common mistakes
- Messaging a delivered ticket "to save a ticket". It burns the rescue and the verifier checks the old done-when.
- Re-running a disk check on a duplicate event.
- Porting a sibling's fix without grepping whether this tree has the bug.
