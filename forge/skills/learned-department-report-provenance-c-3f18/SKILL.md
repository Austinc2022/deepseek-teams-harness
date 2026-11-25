---
name: learned-department-report-provenance-c-3f18
description: Before acting on any department report, build request or 'no candidate clears the bar' verdict, especially when its content looks familiar or contradicts an earlier run of the same department.
---

## Why
A department head can run several times on one initiative: the directive, an addendum, a team reply. Each run sees only its own context. Two failures seen on 2026-11-25 (Day-8 spec, ic8257fc97a):
- One run wrote 'Reported via report_to_coo' in its final note but never made the call, so its spec never arrived.
- A later run, handling an addendum, named the PREVIOUS day's killed candidates. The team answered about that wrong set, and the next run forwarded the reply as the new deliverable.
A verdict like 'no candidate clears the bar' can be about the wrong set entirely.

## Steps
1. **Read the trigger's candidate or subject names.** Compare them with the initiative's own directive and with the previous initiative (day N-1). If any name was killed earlier (knowledge_search the name), or is an already-built game, suspect a mix-up.
2. **List the department's runs since the directive.** Grep `forge/runs/<date>-*/agents/*dept-<x>*.md` for the initiative id and for both candidate sets. Keep only the runs whose `## 1.` trigger is this initiative.
3. **For each run, check the tool calls, not the note.**
   - Grep `tool: mcp__super__report_to_coo|ask_team|run_super_team` and `## Result`.
   - A final note that says 'reported' or 'filed' with no matching tool call is a false claim. The deliverable never reached you.
   - A `Result (failed ... maximum number of turns)` means any message the run sent may be half-formed.
4. **Find where the wrong subject came in.** Usually it is an ask_team message in an addendum run. Quote the line numbers.
5. **Record it.**
   - knowledge_add (measured, with transcript paths and line ranges).
   - rate_work, with the cause in the reason.
   - report_gap on the head: category method, remedy update-instructions. Rules to give it: 'filed only after the call returns'; 'quote your own last deliverable's names before a follow-up'; 'built games are not new candidates'.
6. **Redirect, do not decide on the bad verdict.**
   - Continue the SAME initiative.
   - Name the right candidates explicitly.
   - Cap the work (about 30 tool calls; reuse the earlier run's searches).
   - Require the spec in the report body.
   - Keep the deadline when the downstream step is gated anyway.
7. **Check whether a build request rests on the mix-up.** If another thread owns it, put the finding in a knowledge fact and your plan note so that thread sees it. Do not decide it from this thread.

## Related check: prior-art tooling
- Before you trust a '0 results' prior-art claim, run one search yourself.
- The websearch 'search' tool can return 0 on everything (Bing redirect limit, Brave 429). fetchWebContent on store search URLs works: Steam `store.steampowered.com/search/?term=`, itch.io `itch.io/search?q=`.
- Name searches miss shipped games with other names. Require verb-level searches (the core action and fantasy) and the closest shipped game by verb.

## Mistakes to avoid
- Accepting 'no candidate clears the bar' and dropping the day's concept, when the report never looked at the day's candidates.
- Treating a run's final note as proof that the work was delivered.
- Deciding a build request that another thread is handling.
