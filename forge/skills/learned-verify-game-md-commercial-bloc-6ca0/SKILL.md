---
name: learned-verify-game-md-commercial-bloc-6ca0
description: When checking that a game's GAME.md Commercial/comparables block carries the measured figures Business supplied, across the many forked builder ticket folders, before a gate run.
---

1. Map tickets to trees: builder work dirs under forge/super-agent/work/ are named <task-slug>-<last4 hex of ticket id>; e.g. ticket kbf7f6f6080's tree is orbwend-continuation-3-fix-pas-6080/. The tree a ticket works ON (its parent) and the ticket's own folder are different — check both: the live gate tree and the currently in-flight builder folder.
2. Grep GAME.md for the peer names plus 'Commercial|rechecked|dropped|458' rather than reading whole files; commercial blocks sit in one '## Commercial' section plus one summary table row near the top.
3. Distinguish three states: 'count dropped as unquotable' (needs the measured replacement), 'UNVERIFIED / not rechecked' (honest label, leave it), and 'rechecked <date> (measured)' (done). Only the first is a defect.
4. Check the open ticket titles' scope strings (e.g. 'K5-K11') before concluding a fix will land; if no ticket covers the Commercial row, report the delta to the COO with a buildSpec giving the exact replacement cell, source URL, fetch date and acceptance greps — you are read-only and cannot apply it.
5. Label every figure with instrument and currency exactly as displayed (QSDB Quest ratings vs Steam written reviews; A$ stays A$, never convert or print as USD); mark store-copy quotes 'not measured' and classification calls (generated vs authored) 'argued'. Never print a row as measured generated-demand evidence if its store page states authored content.
6. When compiling tables from team runs: read the cited run-artifact path (forge/runs/<id>/artifacts/...) directly first — it lives in the harness tree, not the project folder — before any knowledge/memory search, and never claim a deliverable 'does not exist' without having read the named path.
