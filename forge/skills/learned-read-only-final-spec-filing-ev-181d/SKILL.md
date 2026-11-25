---
name: learned-read-only-final-spec-filing-ev-181d
description: When a read-only agent (head of design/creative) must deliver a FINAL spec or design doc to a supervisor via a report tool, especially after earlier runs claimed to file it.
---

1. Before doing anything else, check the transcripts (transcript_search on the initiative id / 'report_to_coo') for an actual tool call, not just a note saying 'reported' or 'filed'. A note in a plan or draft is not a delivery. If no call exists, treat the deliverable as never received and file it this turn.
2. Gather evidence with dated, citable sources before the report. When a websearch tool returns 0 results on everything (a known tool failure, not a real absence), switch to direct URL fetches of store search pages (Steam, itch.io, Google Play, Meta Horizon, QSDB) and record the exact URL, store, query term, date and result count for each. Count queries and ensure the required number of non-Steam sources.
3. Treat any query that returned HTTP 400, DNS failure, or titles-only as THIN — record the attempt, but never present it as proof of absence. State prior-art clearance as THIN when the evidence is thin.
4. Quote on-disk facts with file:line or a measured source id (e.g. session.json runId, NOTES.md line ranges). Drop any must-fix or claim you have not checked with Glob/Grep or the knowledge store.
5. Carry forward prior accepted decisions (kills, X1 lesson, plateau table, gate plateau numbers) from the supervisor directive rather than re-deriving them; add only what the FINAL must add (the M1-M6 additions here).
6. Compose the report: one line of evidence per claim with its source and strength (measured/simulated/argued), sample sizes where relevant, honest separate probabilities for gate score and commercial reach, and proposals empty unless a finished folder exists.
7. If the brief has a hard char limit and an END marker, keep it under the limit and verify the marker is the last line. Leave gate-proposal fields empty and record open risks and empty slots explicitly rather than inventing content.
8. Call the report tool, then confirm the call returned success BEFORE marking the plan item done. Update the plan item's note with the tool's confirmation text.
