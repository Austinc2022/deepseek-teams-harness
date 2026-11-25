---
name: camp-tc-producer-studio-handoff-i-4bd4
description: When reviewing multi-specialist build handoffs (deliverables + notes fixtures) and writing an integration.md with conflicts, gaps, and a merge plan for a go/no-go decision.
---

# Studio handoff integration review

1. Read every fixture fully first (deliverables + notes). Notes often contain the admissions that contradict the deliverable claims — pair each note with its deliverable line before judging.
2. List one line per specialist: what they delivered, with the artifact's own numbers (triangles, MB, test counts, dates). Copy numbers exactly; never round in the specialist's favor.
3. Apply the evidence rule: a claim with no attached artifact (e.g. "design approved on date X" with no approval file) is UNVERIFIED — record it as such, and if a decision leans on it, say evidence is insufficient instead of guessing.
4. For each conflict: name the two disagreeing parts explicitly, state which evidence wins and why (an artifact beats a verbal claim; a measurement beats a plan), and give a concrete resolution with a number or a file (e.g. "re-deliver ≤30k tris", "void the approval"), never "discuss with the team".
5. Check every stated target (frame rate, tri budget, draw calls, load time) against measured evidence. A desktop test or a wired-laptop run does not verify a headset or hotel-Wi-Fi target — call that gap out as missing, with an owner (a role) and what artifact closes it.
6. Missing items: each gets an owner role + the specific artifact that closes it. Include things absent from all fixtures (e.g. draw-call counts, loading UI).
7. Integration plan: numbered merge order that is defensible — freeze/baseline first, then environment (anything device-only needs HTTPS), then assets, then code, then tests, then device verification of the merged whole, then sign-off review. Each step ends with a verification gate (a concrete artifact or measurement, not "looks good").
8. End with a clear sign-off statement: GO or NO-GO today, listing the decisive reasons. If NO-GO, name the re-gate step.
9. Keep integration.md under the word cap (e.g. 900): compress wording, never drop a conflict, number, owner, or gate. Count words before finishing; a first draft over cap needs a rewrite, not spot deletions that leave a conflict unaddressed.
