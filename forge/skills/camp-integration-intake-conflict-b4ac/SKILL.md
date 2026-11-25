---
name: camp-integration-intake-conflict-b4ac
description: Use when writing integration.md or any integration review from several specialists' deliverables: to establish what each specialist actually delivered, find and classify conflicts between their work, and list what is missing.
---

# Specialist deliverable intake, conflict and gap audit

When: you must produce the "what was delivered / conflicts / what is missing" part of an integration review from several specialists' outputs.

## Steps

1. **Build the deliverable inventory first.** For each specialist named in the brief, record: role, deliverable expected, deliverable found (exact file path), status (delivered / partial / missing). Open the cited file and confirm its content covers the claim; a summary or a "done" message is not a deliverable. Anything you cannot open and check goes in as "claimed, unverified".
2. **Extract decisions, not prose.** From each deliverable pull every concrete decision into one shared table with a source file per row: names (features, files, systems, metrics), interfaces or signatures, numbers (budgets, limits, counts), assumptions, and scope in/out.
3. **Conflict scan across the table.** Look for: the same name with two meanings; two names for one thing; contradictory numbers for the same budget or limit; two specialists owning the same file or system; interface mismatches (a consumer expects a shape the producer does not provide); scope contradictions (A assumes X is in, B assumes X is out).
4. **Classify and resolve each conflict.** Severity: BLOCKING (build cannot proceed), DECIDE (one answer must be chosen), NOTE (resolve inline). For each: what conflicts, both sources, a proposed resolution with its reason, and who executes it. When both sides cite evidence, state the tradeoff and recommend one — never silently pick a winner.
5. **Gap list.** Compare the deliverables against the original request/PRD and list everything the full build needs that no one delivered: missing deliverables, missing decisions, unowned work, unverified claims. Each gap gets an owner and the consequence of leaving it open.

## Hand-over checklist

- [ ] Every named specialist appears in the inventory table.
- [ ] Every claim about a deliverable cites a file path, and status "claimed, unverified" is used wherever you could not open the file.
- [ ] Every conflict has severity, a proposed resolution, and an owner.
- [ ] Every gap has an owner and a stated consequence.
- [ ] No deliverable is counted twice when two specialists claim it.

## Common mistakes

Trusting a summary instead of the file; listing conflicts without resolutions; hiding gaps as "assumed handled elsewhere"; a gap list with no owners; verdicts written before the inventory is complete.
