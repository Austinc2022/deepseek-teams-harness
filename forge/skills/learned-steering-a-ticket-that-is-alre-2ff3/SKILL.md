---
name: learned-steering-a-ticket-that-is-alre-2ff3
description: Use this before sending a correction, prohibition or scope change to a ticket whose worker may already be mid-run, and when writing any ticket brief whose worker could take an irreversible or slot-consuming action.
---

# Steering a ticket that is already running

The point: a message to a ticket reaches the worker only at the start of its next turn. A run already in flight never sees it. Anything that must never happen has to be in the brief when the ticket opens.

## Measured basis (2026-11-24)
- Turn 2 of a harness-prep ticket started at 13:29:22Z. My first correction went out 36 s later, at 13:29:58Z, and two more followed at 13:32Z and 13:48Z. The run applied none of them. It proposed its patch folder to the game gate twice, and both static checks failed with no score. That used up both gate runs of the next gate day.
- Earlier rule, confirmed 4 times: message_ticket does not resume a ticket whose run failed (person:failed). Open a fresh ticket that rsyncs the folder.
- Long message_ticket texts can be cut off. Briefs sent with open_ticket arrive in full.

## Steps
1. **Put the prohibitions in the brief at open time.** Every brief lists its "never do X" lines in a short block near the top. The usual ones: never propose to the gate (for anything that is not a frozen game build), never commit or push, never edit outside the ticket folder, never start more than N heavy jobs. Never plan on adding a prohibition later by message.
2. **Before sending a correction, check whether a run is in flight.** read_ticket shows the assignments and their start times. Capacity shows whether a worker is running. If one is running, assume the message lands on the next turn and not before.
3. **Choose by harm, not by convenience:**
   - The correction only changes later work (scope, polish, order): send ONE short combined message. It replaces the earlier ones, so say that in its first line.
   - The current run is about to do something irreversible or slot-consuming (a gate proposal, a commit, deleting files, burning a scarce daily quota): stop the ticket now. Then open a successor (or resume) with the prohibition in the brief. A stopped run costs one turn. A burned gate slot costs a day.
4. **Keep messages short and self-contained.** Put the must-do lines first and state them literally (commands, paths, ids). If a message would run past a screen, open a fresh ticket with the full brief and rsync the folder instead.
5. **Verify the correction landed.** On the next trigger, compare the start time of the latest run (transcript id or assignment time) with your message's timestamp. A run that started before the message did not read it. Then check on disk (NOTES.md, REPORT.md, file times) that each corrected item changed. Do not record a correction as applied until you have seen the change.
6. **When two threads may steer the same ticket** (CEO and COO, or two COO runs), only one thread sends. The others pass their points to that thread.

## Common mistakes
- Sending three messages in a row to one running ticket. The run reads none of them, and the next turn reads a contradictory pile.
- Treating "message sent" as "rule in force". It is in force only from the next turn, and only once you have verified it.
- Messaging a ticket whose run failed and waiting for it to resume. It will not; re-ticket.
- Putting a critical prohibition only in a long message that gets cut off.
- Leaving the gate ban out of a non-game ticket's brief because "it obviously isn't a game".
