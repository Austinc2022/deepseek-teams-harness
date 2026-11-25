---
name: camp-tc-producer-fixture-grounded-7791
description: Producer/integration role: given handoff claims and demo/observation notes as fixtures, producing an integration plan with evidence statuses, conflicts, missing items, gated steps, and a go/no-go decision.
---

1. Build a coverage ledger from the task's own words first: one line per named section, requirement, target, status word and phrase. Discharge each line in the section that owns it; a gap found elsewhere must still appear in the missing-items section.
2. Read both fixtures with exact line numbers; cite claims as file:line counted from the read, never estimated. Do not copy "done"/"verified" labels from a handoff — the file's own claims are unverified until a second fixture supports them.
3. Make a per-claim delivery table: claim (with line cite) | cross-evidence | status. Rule: single-source claim is never Verified; two sources agree -> Verified; caveat/scope-limit/live contradiction -> Conditional; nothing -> Unsupported, and write "not enough evidence" where the claim cannot be checked at all.
4. Extract conflicts exhaustively: the conflicts the brief names come first (e.g. design version vs code from another version), each with both sides named, the concrete disagreement (numbers: 150 ms vs 20 ms = 7.5x), and a resolution. Then extra finds, including silent mismatches between a deliverable and a stated target. Conflicts (two named disagreeing sides) and missing items (work that does not exist yet) are different lists; a gap may appear in both.
5. Missing items table: owner + the specific artifact or test that closes it (file names, test names as given — never invent names).
6. Ordered plan with gates: licensing/provenance -> toolchain/hygiene (CI) -> budget/measurement (assets, performance, load) -> feature/content -> validation/packaging. One verification gate per step, named owners, each gate stating what it unblocks.
7. Decision paragraph: greenlight/hold/no-go with the numbers (frame time vs budget from an external standard you actually fetched, failure counts, dropout rates), and map every named blocker to its closing gate ID; re-evaluate only at the gate where the last blocker closes.
8. Self-consistency pass: gate IDs unique and all references correct; statuses obey the two-source rule; required verbatim phrases present; line cites recounted from the fixture; final reply copy identical to the file.
