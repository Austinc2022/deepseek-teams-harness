---
name: learned-steering-a-ticket-that-is-alre-86c0
description: Use this whenever you need to correct, restrict or redirect a builder ticket that is already open or running, or when you are about to open a ticket whose worker could take a step that uses a slot or cannot be undone (gate proposal, commit, publish).
---

# Steering a ticket that is already running

The core fact: a message to a ticket is read only on the worker's NEXT turn. A run that is already going never sees it. A correction you send mid-run can arrive after the damage is done. (Measured case: a non-game harness ticket proposed itself to the gate twice, 13:29:12Z and 13:49:52Z. The "do not propose" message went in at 13:32Z, but the second proposal came from a run that started at 13:29:22Z. Both failed the static check, and they used up both gate runs of that gate day, so no game could be gated for 24 h.)

## 1. Put every prohibition in the brief when the ticket opens
- Every ticket brief states its bans in plain words when it is opened: "DO NOT propose this to the gate", "no commit", "no store, public or spend step", "deliver through the report only".
- Non-game tickets (kit, harness, spec, research, evidence) always carry the gate ban. Only a game ticket with GAME.md and an entry point may ever go to the gate, and only when the leader says so.
- Repeat the ban in the done-when ("the build was not proposed to the gate") so the verifier checks it too.

## 2. Before relying on a correction, compare times
- Get the current run's start time (read_ticket inputs, or the run id timestamp such as 20261124-132922 = 13:29:22Z) and your message time.
- Run started BEFORE the message: the worker has not read it. Treat the correction as not applied until the next turn starts.
- Run started AFTER the message: it should have read it. Verify anyway (step 5).

## 3. A running worker might take a step that uses a slot or cannot be undone, and its brief does not bar it
Examples: a gate proposal, a commit or push, a publish step, deleting the folder you need.
- Do NOT message it. A message cannot reach the run that is going now.
- STOP the ticket (stop_ticket; exempt "superseded" if the brief itself was wrong), then resume or reopen it with the corrected brief. Name the stopped id and the reason in the new brief.
- If the ticket is not yours, tell its owner right away, with the evidence and this step. Do not message someone else's ticket.

## 4. Send ONE combined message, not a series
- Each message can start a turn, and a later message can contradict an earlier one. Gather every correction (critique must-fix items, quality fix list, failed go/no-go lines) into one numbered message with paths and commands.
- Lifting a brief ban later (for example, letting a game propose in its gate slot) needs its own explicit message: say exactly which deliverable may be proposed, the earliest time (for example "not before 13:00Z 11-25"), and that every other ban still holds. Send it only after the previous turn has ended, so the run that reads it starts after it.

## 5. Verify the effect on disk or in the log after the next turn
- Do not trust the worker's report alone. Check the artifact: grep the ticket's TICKET.md for the ban line, read NOTES.md, and read the gate count for the gate day (state.json days["YYYY-MM-DD"].gates; the gate day is Sydney-local and rolls over at 13:00Z) to confirm there is no new gate entry from that ticket.
- Record what you checked (file:line, count, timestamp) in the plan item note.

## Quick audit of all open tickets (run it before any gate day that matters)
1. List the open tickets you own.
2. For each, grep TICKET.md for "gate" and confirm a ban line (quote the line number).
3. Brief has no ban AND the worker is running or queued: step 3 (stop, then reopen with the ban), not a message.
4. Read the gate counter for the current gate day and the next one; note any entry you cannot explain.
5. Note any open ticket you do NOT own that lacks a brief ban, and tell its owner.

## Common mistakes
- Sending "do not do X" as a follow-up message and assuming it took effect.
- Sending three quick corrections that start three turns and contradict each other.
- Fixing only the worker's role text: that helps next week but does not stop the run going now.
- Taking the worker's word for "did not propose" without checking the gate counter.
