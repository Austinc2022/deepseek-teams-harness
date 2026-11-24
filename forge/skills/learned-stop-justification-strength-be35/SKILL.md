---
name: learned-stop-justification-strength-be35
description: Whenever you stop, kill, supersede or retire work (tickets, initiatives, agents) as "done elsewhere" in a stop rationale, kill record, after-action report or knowledge_add claim. Pairs with the full skill cite-only-verified-evidence (v2 rule 7); apply both.
---

# Stop-justification strength (delta to cite-only-verified-evidence)

Stopping work as done-elsewhere is a judgment call. Never present it as "measured" inside an evidence-labeled report.

1. For each work item you are stopping as superseded, open the ORIGINAL done-when (ticket doneWhen field) and the SUPERSEDING artifact's covering text, both read this cycle.
2. Quote them SIDE BY SIDE in the stop rationale — content plus ticket/file ids, never line numbers (state.json lines drift within hours: a done-when cited at 12674 at 12:19 sat at 12773 by 12:40 the same day).
3. Judge coverage literally: the superseding artifact must cover every element of the original done-when. "Acceptance rows still pass" does NOT cover "ACCEPTANCE.md with 8 rows mapped 1:1 to gate-rubric lines plus 4 fail-first deferred-check tests" (k66ab86dd00 vs kacb79d3ef2, 2026-11-24).
4. If the artifact covers it, cite it and you may state the supersession as fact. If not — or you did not check — write "ARGUED: judged superseded" in the rationale. Stopping may still be right; the label must be honest.
5. Check before sending: every stop/kill/supersede/retire claim has either a quoted superseding artifact or an ARGUED label. Search the draft for superseded / stopped / killed / retired.

Common mistakes: inferring coverage from ticket titles instead of done-when text; treating a same-brief retry ticket as covering a richer done-when; upgrading "probably covered" to "measured" because a senior agent said so.
