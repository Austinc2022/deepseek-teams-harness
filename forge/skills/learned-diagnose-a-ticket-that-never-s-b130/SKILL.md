---
name: learned-diagnose-a-ticket-that-never-s-b130
description: When an open builder ticket shows 0 turns or 0 assignments well after it was opened, before blaming the model gateway or capacity, or before opening a duplicate ticket.
---

# Diagnose a ticket that never starts

The usual mistake is to blame the free-model 502/429 chain or a lack of capacity, then open a duplicate ticket. Duplicates cost twice, and they can inherit the same defect. The dispatcher only starts a ticket if it passes a short list of conditions. Check each condition on disk.

## Steps
1. **Read the ticket record** in `forge/super-agent/state.json` by grepping the ticket id under `"tickets"`. Note these fields:
   - `status` (must be `open`)
   - `assignments` (an empty list means no turn ever started)
   - `waitKnowHow`
   - `verifying`
   - `dependsOn`
   - `extraTurns`
   - `createdAt`
2. **Read the dispatch gate** in `plugins/super-agent/lib/super.js`. Find `#dispatch()` by grepping `#dispatch`. As of 2026-11-24 it skips a ticket when any of these is true:
   - the ticket is not open, or is already live;
   - `stage` is not `queued`;
   - `waitKnowHow` or `verifying` is true;
   - a dependency is not ended with outcome `completed` (a dead dependency fires one `dependency` trigger to the owner and is not repeated);
   - `assignments.length >= maxAssignments + extraTurns`;
   - all `maxWorkers` slots are in use (fair share per owner).
   Re-read the function every time, because the code changes.
3. **Check every flag for staleness.** A flag that should clear itself on a timer (for example, `waitKnowHow` is released by a 16-minute `setTimeout` in `#knowHowFor`) is stale if it is still true after its deadline. Grep for every place that writes the flag. If none of them runs at startup, a process restart leaves the flag set forever, and restarting again will not fix it. Confirm with the matching know-how entry in `forge/super-agent/growth.json`: if it is still `running` with no `endedAt`, the search never settled.
4. **Check capacity separately.** Look in the leaders' plan notes or the system events for the live worker count. If 0 of N slots are in use and the ticket still has not started, capacity is not the cause.
5. **Decide the workaround.** A ticket stuck on a stale flag cannot be resumed. Stop it and open a fresh ticket with the same brief and doneWhen. First check that the ticket count for the day is below `maxTicketsPerDay` (`state.json` settings). Within about 20 minutes, check that the new ticket has a non-empty `assignments` list, because a restart inside its own know-how window deadlocks it the same way.
6. **File the root-cause repair** (persist a deadline timestamp, or clear the flag on startup), ranked against the other repairs. Record a measured fact with the file:line evidence so that other leaders stop attributing the stall to 502s.

## Checks before you report
- Did you quote the actual field values and the code lines, not a teammate's summary?
- Did you separate what you measured (flag value, code path) from what you inferred (that a restart happened)?
- Are the "twin" tickets you call duplicates still open? Ended twins are not overlap.
- Is the reported blocker current? Old owner decisions re-recorded at a store restart look new. Check `recorded_at` against the real date.

## Common mistakes
- Treating "the worker ended on a 502" (a past ticket) as the reason a different, newer ticket has not started.
- Messaging a stuck ticket. `message_ticket` does not clear the dispatch flags.
- Opening a parallel ticket while the old one stays open and still owned by you.
