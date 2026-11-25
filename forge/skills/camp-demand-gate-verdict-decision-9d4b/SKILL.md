---
name: camp-demand-gate-verdict-decision-9d4b
description: When making the demand go/revise-once/stop gate decision and writing decision.md: verdict selection rules, conditions, revenue range against both targets, and falsifiers.
---

Use this whenever you act as the demand gate and must write decision.md answering "is the demand real enough to plan?".

## Steps

1. **Fix the inputs before judging.** List every demand input you were given: concept(s), proposed target segment, evidence items (each with source and strength: measured > simulated > argued > hearsay), comparables, and any revenue estimate. If a concept or a named segment is missing, say so and pick neither — return `revise-once` naming the missing input.

2. **Separate evidence from assumption.** For each claim supporting demand, tag it evidence-backed or assumed. A demand case built mainly on assumed willingness-to-pay, assumed reach or assumed conversion cannot earn `go`.

3. **Pick exactly one verdict word** — `go`, `revise-once`, or `stop`:
   - `go`: demand evidence for one concept and one segment is evidence-backed, the revenue case clears the stated target in the likely case, and no fatal assumption remains.
   - `revise-once`: exactly one fixable gap exists. Name precisely what the revision must show (the artifact or measurement) and state this is the single revision round.
   - `stop`: evidence is hearsay-only, unfalsifiable, or the realistic revenue range misses both targets materially.
   - Rule: if your conditions would require re-planning the whole venture, the verdict is `revise-once`, not `go` with heavy conditions.

4. **Build the revenue range** with the market-sizing procedure (bottom-up: reachable buyers × price × conversion; cross-check top-down TAM/SAM/SOM). Report low / likely / high. Compare against **both** targets explicitly: $1M/day (≈$365M/yr run-rate) and $1M/year. State which target the likely case clears, which the high case merely flirts with, and never average your way to a target.

5. **Attach conditions.** Each condition must be checkable against a named artifact or measurement before planning starts (e.g. "a landing-page test showing ≥X signups at Y cost"), with an owner and a deadline. Vague conditions ("better research", "stronger marketing") are not allowed.

6. **Write what would change the verdict.** Give 2–4 falsifiers with concrete thresholds that flip the verdict in each direction (e.g. "if the concept test lands below X, go becomes stop"). Each falsifier must name the finding, not a mood.

7. **Write decision.md in this fixed order:** verdict; chosen concept and single target segment; reasons (each tied to an evidence id/source); conditions; realistic revenue range vs $1M/day and $1M/year; what would change the verdict.

## Checklist before handover
- [ ] Verdict is exactly one of go / revise-once / stop
- [ ] One concept and one segment named — not "everyone", not two segments
- [ ] Every reason cites a source with its strength; no claim stronger than its source
- [ ] Both $1M/day and $1M/year addressed with low/likely/high figures
- [ ] Every condition is checkable by a named artifact or measurement
- [ ] At least 2 falsifiers with thresholds
- [ ] Consistency: conditions and falsifiers do not contradict the verdict
