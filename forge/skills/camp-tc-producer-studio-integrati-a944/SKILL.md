---
name: camp-tc-producer-studio-integrati-a944
description: When integrating several specialists' deliverables into one handoff: find conflicts, missing items, and write a gated integration plan with a sign-off decision.
---

1. Build a coverage ledger from the brief: every named section, target, budget and required phrase is one line; each line must be discharged in the section that owns it (delivered / conflicts / missing / plan / sign-off).
2. Transcribe each specialist's deliverable with its numbers exactly as the artifacts state them; mark any claim without an attached artifact "Unverified" (targets are not measurements; a summary sentence is not a run log).
3. Extract conflicts pairwise: check every brief requirement against every deliverable and every deliverable against every other. A silent mismatch (asset or build violating a stated budget) is a conflict between the deliverable and the requirement. Give each conflict two named sides and a concrete resolution decision — never "discuss with the team". A claim contradicted by its own artifact (e.g. "seamless loop" vs waveform export) is a conflict too; the artifact wins.
4. List missing items separately from conflicts: missing = work that does not exist yet; give each an owner role and an observable closing condition. Anything that must be true but has no artifact also belongs here.
5. Write the plan in risk order: toolchain/hygiene gates first (licensing, HTTPS/secure context, CI), then budget/measurement gates (triangles, draw calls, payload/load time), then feature/content integration, then validation and packaging. One verification gate per step, named G1..Gn, each gate a single observable pass condition.
6. Tie the go/no-go to the gate where the last forcing blocker closes; every blocker must name the gate that closes it. If evidence for a budget is insufficient (wrong network, no device run), say so explicitly and do not sign off.
7. Self-consistency pass: gate IDs unique, every cross-reference correct, status labels obey the evidence rule (single-source never "Verified"), stated assumptions flagged (e.g. assumed bandwidth), numbers copied not estimated, word cap respected (split long output across files with an index if needed).
