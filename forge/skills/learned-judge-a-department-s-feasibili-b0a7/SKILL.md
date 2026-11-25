---
name: learned-judge-a-department-s-feasibili-b0a7
description: When a department (People, Engineering, Quality) sends a code-cited memo saying a process or tooling change is feasible (new agent type, worker swap, harness behaviour) and asks you to run a trial.
---

## Steps
1. **Re-read every cited file:line yourself.** Department code reads are single-source. Read only the lines cited, plus about 20 lines around each, and mark each claim held or not held.
2. **Check the deployment profile, not only the generic defaults.** Memos often reason from a generic default ("defaults to the fast model") without opening the profile this company runs (for example plugins/company/profiles/<studio>.js). Look up the actual values: models.fast and models.worker, choices, and the worker settings. A 'risk' that rests on a default may not exist in this deployment.
3. **Check run-level overrides.** Agent-level settings (model, skills) are often overridden when the run starts (for example talent 'principal' passes the strongest model to ANY worker; skills are attached per turn). Find the line where the run starts (api.agent(...)) and see what it overrides.
4. **Check the trial vehicle for a self-grading confound.** If the proposed trial ticket builds the checks that would then grade its own output, a clean result proves nothing about the lever. Pick a vehicle that does not build its own checker, with the same done-when and the same count as the baseline.
5. **Keep the trigger you set before the data.** If you set a condition earlier ("trial only if the cheap lever fails"), a feasibility memo is not new evidence about whether the trial is needed. Keep the condition. Pre-stage the trial as a plan item with dependsOn on the measurement item, and give it NO auto-opening ticket (an auto ticket would open whatever the verdict).
6. **Order the levers by strength and cost.** Brief text (cheapest, live now), then code enforcement (freeze rows, tests), then agent or role changes (new agent, daily agent limit, lost skill history). Run the next lever only when the measured result of the previous one says so.
7. **Write it where the department will see it.** Put the corrections in the initiative note (set_initiative), which the department reads as the last note. Do not start a new directive just to tell them; that buys a background run for nothing.
8. **Record the verified mechanism** as a measured knowledge fact with file:line sources, and rate the memo. Credit the citations, and deduct for unchecked deployment assumptions and confounded trial designs.

## Mistakes to avoid
- Accepting a 'risk' or 'loss' list without checking it against the profile actually deployed.
- Running a trial early because it is "cheap": it spends the daily agent limit and adds a confound to a measurement already running.
- Re-setting an initiative stage only once: a department's report can overwrite your stage, so set it again on each report.
