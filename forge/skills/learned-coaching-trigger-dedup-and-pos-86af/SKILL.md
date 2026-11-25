---
name: learned-coaching-trigger-dedup-and-pos-86af
description: When a growth/coaching trigger arrives for an agent you may already have charged the same day, before filing anything.
---

1. Dedup first. Search memory and grep forge/super-agent/growth.json for gap records matching the trigger's items. Trigger text usually quotes the original critique verbatim — including your own measurements — and growth.json often holds both the original record and a later rollup copy. If the charges are already filed, do NOT re-file: a double charge fakes a "repeat" and escalates to the coach without new evidence.
2. Upgrade weak evidence instead. If the filed charge rests on "reviewer-measured, not re-run by me", reproduce the key claim now with fresh file reads (brief line numbers, source file lines) so the charge stands on your own measurement.
3. First post-remedy read. Open the newest artifacts the unit produced and check each remedy's concrete marker in the text (e.g. copies-to-target math in a GAME.md spec; a standing smoke-repair clause). Compare artifact open-timestamps against the remedy application window before calling anything a repeat: if the artifact was created inside the window, it is timing-ambiguous — record the check, keep the armed check strict for the NEXT output, and charge only a clean post-window repeat.
4. Check realization targets. If the remedy targets a shared template or kit, read the in-flight revision's brief for a clause that forbids the fix (e.g. "Leave the X template as it is"); when found, explicitly move the realization target to the next revision and record it as a fact.
5. Escalate on the next clean repeat, not on ambiguity. One verified post-remedy repetition = report_gap repeat (coach fixes it for good).
Common mistakes: charging twice from a re-delivered trigger; calling a brief "post-remedy" without checking its open timestamp against the remedy window; trusting your own earlier plan note ("remedies applied") without grepping state.json/growth.json for the applied text.
