---
name: learned-kit-self-consistency-and-first-636d
description: Critiquing a starter kit / template ticket (anything a game forks from), where the deliverable is mostly tools, rows and docs rather than play.
---

1. Walk the documented first-fork path from the README, not the builder's summary: fork command, npm test, npm run smoke, gate-lite, freeze-check. Read the run logs the ticket already produced (fork proof, finish battery) before re-running anything.
2. For every FAIL/NOT RUN row in those logs, classify: (a) by-design red (spec says the fork fills it in), (b) expected missing-input, or (c) self-inflicted — the FAIL names a file/artifact one of the kit's own tools just wrote. Class (c) is a defect of the kit, never "debris to clean up".
3. Grep the tools for writes into policed areas: any row that restricts a folder (e.g. scratch/) must be checked against every tool that writes there (smoke work files, job-runner pids/logs, npm caches). Quote file:line for both the writer and the row's exemption list; if the writer's output matches no exemption, the pipeline is self-contradictory as shipped.
4. Check runner-vs-row interactions: if the docs say run X through a wrapper (job.mjs), reason about what the wrapper leaves on disk WHILE the row runs (pid files exist during the child's execution, not only after).
5. Truth slips in docs: any hand-written number beside a generated evidence block must match the block or name its log. Compare prose numbers to the current evidence/*.json fields directly (run-to-run drift makes 'it was true of an earlier run' a mis-attribution, not a pass).
6. Player/fork-lens pass over the UI strings: every control name a player is told to press must match the input mapping the code reads (gamepad button indices, key codes). Brief-mandated strings still get flagged if they contradict the code.
7. Judge screenshots from the pixels (right file, right framing; compare subjectBounds in smoke.json to what the PNG shows) and note that parallel file reads can return out of order — re-open one file alone when a swap would change the verdict.
8. Report: mustFix = self-inflicted FAILs and false doc claims with file:line + concrete fix; allowed gaps (spec says NOT LANDED with a reason) go to wouldElevate/capabilityGaps, honestly labeled measured vs argued-from-code.
