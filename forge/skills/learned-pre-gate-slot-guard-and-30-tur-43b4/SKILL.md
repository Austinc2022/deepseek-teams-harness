---
name: learned-pre-gate-slot-guard-and-30-tur-43b4
description: Before proposing any game to the gate, especially when the gate day has only one run left or the auditor turn cap is lower than past audits needed.
---

## Why
A gate run is counted before its static check (super.js counts first). So a stray proposal, or an audit that runs out of turns, burns a daily slot and cannot be retried that gate day. Past unscored audits had three causes, all argued from transcripts: thousands of files including snapshot or nested tree copies; stale TICKET/NOTES from other tickets; and a mismatch between a log and a claim that the auditor chased for about 8 turns.

## Steps
1. **Count slots left.** Read the facts and messages for the gate counter of the current gate day. The day follows the host's local date, and the cutoff is stated in UTC. Write down how many runs are left and when the day ends.
2. **Sweep owned tickets for stray proposals.** For every open or queued ticket you own, read the brief and done-when. Confirm each one has an explicit "do NOT propose to the gate" line and a done-when item saying it was not proposed. A kit or tooling ticket must say it is not a game. Message any ticket that lacks the line before its next turn.
3. **Sweep for twin tickets.** Two of your threads can answer the same build request. List the queued and open tickets by build id or title. Keep the one the plan items point at, and stop the other with exempt=duplicate. Fold any unique, cheap points from the stopped brief into ONE message to the kept ticket.
4. **Auditability line (NO-GO if any part fails):**
   - GAME.md lines 1-40 are the audit index: at most 25 rows of concern | claim + strength | path | command.
   - Every command finishes in 60 s or less on the frozen copy. Use npm test, vite build, shasum -c, or a node/jq read of an evidence JSON. No row asks the auditor to re-run a browser session, a bot or screenshot capture.
   - The frozen tree has no scratch/, logs/, snapshots/, staging/ or nested copies. State its file count excluding node_modules, with the find command; a target of 250 or fewer is reasonable for a small slice.
   - Read every number in the index against the file it cites yourself. Zero mismatches.
   - Use the critique panel's auditor-lens critic as the rehearsal: if it ran out of turns or returned no score, it is NO-GO.
5. **Only then propose,** naming the frozen tree and the external manifest. Put the line results in the proposal text.

## Mistakes to avoid
- Waiting for a harness fix to raise the auditor cap. Make the pack small instead.
- Letting builders propose "to save time". Only the COO proposes.
- Opening a ticket for a build request that another thread's trigger owns.
- Counting a failing control as proof when the auditor cannot reproduce it in one short command.
