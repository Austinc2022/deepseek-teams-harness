---
name: camp-ordered-integration-plan-seq-bdad
description: Use after the deliverable/conflict audit, when you must write the ordered integration plan for the full build in integration.md.
---

# Dependency-ordered integration plan

When: the audit of specialist deliverables is done and you must write the ordered plan that turns those deliverables into the full build.

## Steps

1. **List steps as concrete, verifiable work items** — "wire specialist A's X into Y", not "integrate everything". One action per step, naming the file or system it touches and the source deliverable it uses.
2. **Draw dependencies.** Which steps need another step's output (an interface, an asset, a decision)? Steps with no dependency go first or run in parallel; mark parallel tracks explicitly.
3. **Place resolutions and gap closures first.** Every conflict resolution and gap closure sits before the first step that depends on it. If a BLOCKING conflict is still unresolved, its dependent steps are unrunnable — say so rather than ordering around it.
4. **Order by dependency, then by risk.** Prove the riskiest integration seam early, when failure is cheapest. Show the critical path: the shortest chain of dependent steps to a first runnable build.
5. **Specify each step with:** what to do, who does it, its inputs (source deliverable + file path), its done-check (a runnable command, a visible behaviour, or an explicit acceptance criterion), and what it unblocks.

## Verify before handing over

- [ ] No step appears twice and no step is a topic rather than an action.
- [ ] No step depends on an output that no step produces.
- [ ] Every step has a done-check and an owner.
- [ ] Parallel-capable steps are marked as such; the critical path is visible.
- [ ] The plan ends at a defined "full build" state that matches the original request.

## Common mistakes

Ordering by specialist instead of by dependency; steps phrased as themes with no done-check; ignoring that two specialists modified the same file; a plan whose first step already depends on an open gap; burying conflict resolutions after the steps that need them.
