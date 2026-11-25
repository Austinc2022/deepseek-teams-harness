---
name: camp-final-audit-consistency-cove-0082
description: Before delivering any audio spec, gate verdict, audit, recipe or decision document: one audit pass over your finished draft for internal contradictions, un-referenced units, missing states/risks, over-strong claims, and fixes that do not literally meet the stated criterion.
---

# Final audit pass: consistency, coverage, claim discipline
Run these steps on your COMPLETED draft, before you write the final reply. They catch the defect classes that cost the most points: contradictions inside one document, rows that were never written, and claims stronger than the evidence.

## 1. Cross-consistency sweep
1. List every number you wrote (levels, rates, BPM, distances, budgets, durations, thresholds) with its section. For each quantity confirm exactly one value — or an explicit hierarchy where you state both the cap and the usage and reconcile them ("cap 9 worst case; this spec uses 3").
2. Derive every budget from an enumerated worst case: name every concurrent item and sum it. A cap that your own item list can exceed is a contradiction — fix it before delivery.
3. Cross-field sanity: a loop length must cover the session/level it plays over; two distance thresholds for related behaviour must be ordered and distinct (or explicitly the same, with a reason); a trigger column must not depend on an undecided threshold — resolve it with a stated default and name the decision owner.
4. Condition lists: for every "all of the following before X" list, check each pair of conditions for mutual exclusion or redundancy. If any single item alone is sufficient evidence, rewrite as "any one of (a) or (b)" and say which one suffices. A reader must be able to act on the list literally and proceed.

## 2. Units and reference frames
- Every level value states its frame: absolute dBFS (say peak or RMS), or dB relative to a named reference ("rel. fundamental", "rel. bed"). No bare "-12 dB" anywhere — including helper oscillators, harmonic trims and noise layers.
- Prose values and table values use the same frame and agree; if a value appears twice, it reads identically.

## 3. Coverage sweep
1. Enumerate every core action/state in the brief as a checklist row, then add the branches people forget: failure/timeout/quit ends, wrong-target or wrong-pitch input, early/late timing, near-miss, ready/count-in, loop-vs-one-shot ends. Each gets a named cue or an explicit "deliberately silent, because ...".
2. If the brief or rubric names example items ("risks such as X"), each example appears as a named item with its own mitigation/test, or is explicitly dismissed with a reason.
3. In a review/audit verdict: each failed criterion quotes ALL failing rows/lines, not one representative example; each criterion maps only to items that criterion actually covers.
4. Every fix must satisfy its criterion as literally written. Never offer a substitute artefact (a justification, a note, a later promise) for something the criterion demands to exist.

## 4. Claim discipline
- Documents you have not read: write "terms vary; the exact text is required" and treat that gap as the evidence gap that drives the verdict. Never assert what unseen terms say.
- Verification claims name exactly what you fetched or ran and quote it. If the quote cannot be reproduced from your own run, downgrade to "unverified — needs checking".
- Overstatement check on every "impossible / always / never / guaranteed": name the strongest counterexample (a second filter's phase response, a retuned partial, a stacked layer). Keep the claim only if it survives, and say why.

## 5. Last read
Read the draft once looking only for internal contradiction (a loop length vs the session it covers, two values for one threshold, terminology that misstates the API you name). Then deliver.

Common mistakes: fixing one instance of a contradiction and leaving its twin in another section; writing these steps but not running them on the draft; hedging everything (keep the verdict firm — hedge only the unseen-document and unverified claims); quoting one failing row to "represent" a criterion.
