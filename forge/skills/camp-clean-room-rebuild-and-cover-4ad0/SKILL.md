---
name: camp-clean-room-rebuild-and-cover-4ad0
description: clean-room-rebuild-and-coverage-check
---

Use whenever you verify a builder's deliverable (demos/ or product/) from a clean copy.

## Steps
1. Copy the submitted tree into a fresh empty directory. Never run anything from the author's working folder — hidden local state (installed deps, untracked files, a running dev server) makes broken builds look fine.
2. Inventory the deliverable against the ticket's named list before running anything. For demos/: one runnable HTML demo per planned feature, README with run steps, an automated smoke-test result, fun-proxy measurements as defined in the plan, notes on what could not be tested without a headset. For product/: source tree, build instructions, full i18n incl. RTL and CJK, locale tests, language coverage report, test results, performance and comfort report, fun-proxy results, security and dependency review notes, privacy policy draft, release checklist. Mark each item present / missing / partial.
3. Follow the README exactly as a newcomer would. Record every command you had to invent, guess or look up — each undocumented step is a finding.
4. Build/install per the written instructions; capture exact output.
5. Re-run the automated smoke test and any tests yourself in the clean copy. Do not trust the recorded result file — compare it with what you observe (load errors, console errors, frame time).
6. Check the no-publish rule: no deploy scripts run, no tags/releases created, nothing sent to an external service; the release checklist must stop before any publish step.
7. Report pass/fail per checklist item with file paths and command output as evidence. For each failure, state what a stranger following the README would hit.

## Mistakes to avoid
- Fixing things yourself: you verify, you don't build. Report the gap.
- Accepting the builder's own test-result file as proof.
- Skipping the README-ease check because you already know the stack.
