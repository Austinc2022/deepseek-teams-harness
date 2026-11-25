---
name: camp-studio-integration-review-a7a9
description: Use when writing integration.md: reviewing what each studio specialist delivered, finding conflicts, and producing the ordered integration plan for the full build.
---

# Studio integration review (integration.md)

Review what each specialist actually delivered before anything is integrated. Never take a delivery claim at face value.

## 1. Inventory with verification
List every specialist and their claimed deliverable. For each claim, open the actual files and mark it **verified** (file paths exist and contain the claimed behavior), **partial**, or **missing**. Every row carries a file path as evidence.

## 2. Conflict scan
Check four classes of conflict:
1. **Shared surface** — the same file, scene node, or asset edited by more than one specialist.
2. **Interface mismatch** — function/prop/event names that don't line up; unit or coordinate-space disagreements; mismatched input mappings or audio bus names.
3. **Contradictory assumptions** — different dependency versions, different scene roots, different timing or state models.
4. **Budget collisions** — poly counts, draw calls, audio voices or frame budget claimed by several specialists at once.

## 3. Resolve each conflict
One line per conflict: what it is, which two owners collide, the proposed resolution (which side wins, or a new shared contract), and the integration step where it must be fixed. A conflict without a proposed resolution is an open risk, and must be labelled as one.

## 4. What is missing
Anything referenced but absent from the tree, and anything promised in the plan with no code behind it.

## 5. Ordered integration plan
Order strictly by dependency: foundation (engine, scene, input, audio bus) first, then features, then polish. Each step states: what is merged or attached, the exact command or test that verifies it, and what it unblocks. Keep steps small enough that a failure points at exactly one change.

## Checklist before handing over
- [ ] Every delivery claim checked against a file path — no claim accepted on report alone.
- [ ] Every conflict has an owner pair and a proposed resolution (or is explicitly listed as open risk).
- [ ] Missing items are named, with who should provide them.
- [ ] The plan is executable by another agent without guessing; steps reference tests in `tests/` where they exist.
