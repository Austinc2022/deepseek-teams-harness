---
name: camp-gate-verdict-self-consistenc-a7ea
description: Before handing over any gate verdict document (decision.md): one pass proving the verdict, conditions, segment, revenue arithmetic and evidence strength all agree.
---

Use this immediately before handing over any go/stop or revise decision document, when the risk is that the verdict, the conditions and the evidence do not agree with each other.

## Steps

1. **Verdict-to-evidence check.** Re-read the verdict, then the reasons. Ask: if the reasons are true, is the verdict forced? If the verdict is `go` but a listed reason is a caveat that would block planning, downgrade to `revise-once`. If the verdict is `stop` but the reasons only name fixable gaps, the verdict is `revise-once`.

2. **Condition-load check.** Count conditions. Three or more substantive conditions on a `go` means the verdict is really `revise-once` — restate it. Conditions must not silently re-scope the concept or segment chosen.

3. **Segment-concept fit check.** The chosen segment must be the one the evidence was gathered on. If the evidence is for segment A but the decision picks segment B, the decision has no evidence: change the segment or change the verdict.

4. **Target arithmetic check.** Recompute the headline revenue figure from its own stated drivers (buyers × price × conversion, or the stated top-down share). Verify the low/likely/high ordering is sane, that $1M/day and $1M/year are not conflated (a factor of 365 apart), and that the verdict matches: `go` implies the likely case clears the binding target, `stop` implies even the high case does not.

5. **Falsifier symmetry check.** Every strong claim in the reasons must have at least one falsifier that could overturn it. A `go` with no downside falsifier is advocacy, not a gate.

6. **Strength audit.** For every cited source, keep the hedge words the evidence supports ("reportedly", "about", "on N days"). Delete any hedge that was strengthened between source and decision text.

## Checklist before handover
- [ ] Verdict follows from the reasons with no unresolved contradiction
- [ ] ≤2 substantive conditions on any `go`
- [ ] Segment in the verdict = segment in the evidence
- [ ] Revenue headline recomputed from drivers; $1M/day vs $1M/year not conflated
- [ ] Each strong claim has a matching falsifier
- [ ] No hedge weakened or removed relative to the source
