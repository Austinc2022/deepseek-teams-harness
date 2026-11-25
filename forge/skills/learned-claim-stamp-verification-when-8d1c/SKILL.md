---
name: learned-claim-stamp-verification-when-8d1c
description: Whenever you judge an agent's report, critique, fix message or status output: an armed follow-up read, a knowledge_add of someone else's claim, or a charge that an agent got something wrong.
---

1. Extract every checkable claim from the output before reading prose: counts, knowledge fact ids, approvals, PASS/completion statements, file:line refs.
2. For each claim, name the ONE command/glob that proves it now, INCLUDING the counting convention, e.g. Glob src/**/*.js -> 14 (11 top-level + 3 audio/). The convention is part of the claim: the 14/17 vs 11/9 vs 14/18 trio was three conventions, not three facts, and the chargeable defect was the missing convention, not any one number.
3. Re-run it yourself against the artifact's FINAL state on disk. Never check the report against the report (self-confirming hallucinations); never accept a line-number cite (state.json lines drifted 12674 -> 12773 within a day) - quote file content instead.
4. Stamp each row: claim - exact command/glob - verbatim output - strength. "measured" only for what you ran this cycle; "simulated" for a model or backtest; "argued" for reasoning; "hearsay" for someone else's assertion. A paraphrase ("red: none") is a disqualifier, not evidence.
5. knowledge_get every cited id in the same turn you write it down; copy the status beside the cite (STALE/DISPUTED/SUSPECT travel with it). An unresolvable id becomes "unverified id" or is dropped - never carry ids from memory or another agent's text.
6. Approvals and owner decisions: verbatim reply text plus its source path, or the word "unverified".
7. Only then record (knowledge_add / memory_save) or charge the agent. A charge must quote YOUR verbatim contradicting output (path + command + raw lines).
Common mistakes: running the evidence battery before the artifact's final edit (counts drift mid-turn - battery goes last, after all edits); trusting another agent's count pair; paraphrased red quotes; recording a claim as measured because it sounded factual.
