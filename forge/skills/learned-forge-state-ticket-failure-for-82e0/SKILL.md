---
name: learned-forge-state-ticket-failure-for-82e0
description: Any People-side audit that needs an exact count or attribution of ticket failures/stalls from the harness state (reconciling conflicting counts, overlap/underperformance reviews, verifying an agent's inventory claims).
---

When you must count or attribute failed/stuck tickets in the Agent Forge harness (People audits, reconciliation of competing counts, underperformance checks):

1. Locate state.json at forge/super-agent/state.json (Glob **/state.json; Grep respects .gitignore, Glob does not). It is one huge JSON: ticket records hold id/short/title/createdAt/status/inputs/assignments; growth.json holds know-how searches.
2. To find dead assignments, Grep `"summary": "The worker ended without a report` with -n. Each hit is ONE failed assignment inside a ticket's assignments[].report. Distinguish causes by the summary text: "API Error: 502 the chain ... exhausted" = free-model chain; "Reached maximum number of turns" = run cap; "You've hit your ... limit" = account cap.
3. Map each summary line to its ticket: Grep `"id": "k[0-9a-f]{10}",?$` with -n (k-prefixed ids are tickets only; i/a/m/p prefixes are inputs/assignments/messages/plan items) and attribute each summary to the NEAREST PRECEDING ticket id line. Then read the ticket block for createdAt/status/stopped:note to scope by day and fate.
4. Scope every count explicitly and give the denominator: "N tickets died on X" (assignment-level) vs "N open tickets are dead" (open list) vs "N tickets produced no output" (includes never-assigned and waitKnowHow-stalled). Competing counts usually differ by scope, not by error — decompose instead of averaging. Label the mapping of someone else's number to a scope ARGUED unless their message says it.
5. waitKnowHow tickets (super.js:1015-1022,1107): a ticket with assignments:[] and waitKnowHow:true is stalled OR waiting; it releases when the know-how search completes (growth.json status "done", release() at super.js:1019) or via a 16-min in-process timer that dies on harness restart. Check growth.json before calling it deadlocked.
6. Citations: record the fact with line-number evidence but warn that line numbers drift within minutes; verify claims by content (e.g. count array elements), not by the cited line range.

Common mistakes: counting run-log/message duplicates ("ended without a report" appears outside assignments too — only `"summary":` hits are assignment-level); treating never-assigned duplicates as 502 deaths; trusting an agent's cited line numbers; citing a total before checking whether retries created extra assignments per ticket.
