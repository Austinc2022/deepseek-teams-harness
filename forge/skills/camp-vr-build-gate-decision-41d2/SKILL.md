---
name: camp-vr-build-gate-decision-41d2
description: When making the go / revise demos / stop build decision and writing build-decision.md, after demo results, fun evidence and commercial data are in hand.
---

# VR build gate: go / revise demos / stop

You decide whether the full product gets built. The decision is only as good as the evidence you cite.

## Steps

1. **Gather the evidence pack before judging anything**: (a) demo evaluation results with per-demo pass/fail and fun assessment, (b) the candidate feature list, (c) the GAME.md Commercial block and demand evidence, (d) any prior-art risk flags. Do not reason from memory of what the demos were supposed to do — read what they actually did.
2. **Classify every candidate feature** as **keep** or **cut**. A feature is keep only if it has concrete fun evidence (a demo moment, a playtest observation, a measured engagement signal) OR it is load-bearing for another kept feature's fun. Everything else is cut, with a one-line reason ("no fun evidence", "duplicates X's feel", "cost exceeds its evidence").
3. **Apply the verdict rule**:
   - **go** — every must-have demo passes, each kept feature has fun evidence, and the revenue path survives with the cut list applied.
   - **revise demos** — a fun core is proven but specific demo gaps hide the evidence; the gaps are fixable within one revision round and you can name each one.
   - **stop** — no proven fun core, or the revenue path fails even in the best reading. A stop needs the same strength of evidence as a go.
4. **Write build-decision.md in fixed order**: verdict (one line) → final feature list with fun evidence per feature → cut list with reasons → effort budget and milestones → restated revenue expectation. State the restated number and what changed versus the original expectation.
5. **Verify before handing over**: every evidence citation points to a real run, file or report id; no fun evidence is inferred; the keep+cut lists together account for every candidate feature; the verdict is consistent with the evidence you actually cited.

## Common mistakes
- Deciding first and finding evidence after. Classify features first, verdict last.
- Keeping a feature because it is impressive to build rather than fun to play.
- A soft stop ("maybe later") when the rule says stop — pick the word the evidence supports.
- Citing a demo pass for a feature it never exercised.
