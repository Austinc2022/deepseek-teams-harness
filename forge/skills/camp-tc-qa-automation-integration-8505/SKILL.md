---
name: camp-tc-qa-automation-integration-8505
description: A lead hands over several deliverables and claims they are complete and consistent, and you must judge that claim and produce a corrected integration order from descriptions or partial evidence.
---

1. Inventory every deliverable D1..Dn from the handoff. Do not trust the lead's summary; re-derive status per item.
2. Classify each with exactly one of: verified / present-but-unverifiable / conflicting / missing. A chat link or verbal "ready" is missing, not present. If only descriptions exist (files absent), say so up front and mark contents you cannot inspect as unverifiable.
3. Extract every concrete value and named mechanic (session lengths, counts, feature names, segment names). Build pairwise comparisons across ALL deliverable pairs, not just adjacent ones. Each conflict entry must name both deliverables and quote both values verbatim (e.g. D2 "6-minute sessions" vs D6 "assumes 8-minute sessions").
4. Distinguish hard value conflicts from cross-reference gaps (e.g. spec cites a source segment the source description never names). For anything the evidence is silent on, write "evidence insufficient" and route to the owner; never invent a resolution or a number.
5. Missing/unverifiable table: one row per gap with named owner AND the concrete artefact that closes it (exact file path, manifest, excerpt, expected value written in the test plan).
6. Corrected integration order: numbered steps, each with owner and exact files touched. Derive dependencies from the conflicts: any QA step must come after every step that resolves what that QA checks (mechanic, numeric values, missing assets). Explicitly reject vague orders ("then QA, then ship") and explain which tests would produce meaningless results under them.
7. Close with an evidence/limitations paragraph stating what was and was not inspected. Run a coverage grep afterwards: every deliverable ID mentioned, every conflict names two parties, every plan step has an owner and files.
