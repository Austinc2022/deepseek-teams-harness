---
name: camp-tc-vr-qa-verifier-clean-copy-1c20
description: When verifying a builder's delivery handoff (DELIVERY.md + bundle/generator script) against gate criteria as an independent release verifier.
---

# Clean-copy release verification

1. **Inventory the handoff first.** Read DELIVERY.md and the bundle script in full before running anything. Note each claim; they become hypotheses to falsify, not facts.
2. **Rebuild from scratch in an empty subdir.** `mkdir -p clean-copy && cp release-bundle.sh clean-copy/ && cd clean-copy && sh release-bundle.sh`. Capture exit codes with `echo "EXIT_CODE=$?"` appended to every command. Never run the bundle in the handoff folder itself.
3. **Run the stated build and test commands exactly** (`npm run build`, `npm test`) inside the clean copy. Record full output including the test runner summary (pass/fail counts) and every failing assertion with its file:line.
4. **Analyze test failures for determinism.** A failure caused by the delivered source itself (e.g. an expected array not in sort order, an assertion on a file nothing creates) proves the builder could not have seen the claimed pass rate — that is a contradiction between claims and evidence, and belongs in the report explicitly.
5. **Trace every artifact to a consumer.** Grep the tree for each file (e.g. `locales/*.json`): if no code loads it, it is an orphan — the criterion about that artifact fails even if the file exists and looks complete.
6. **Check scope literally.** Compare the feature list in code (e.g. FEATURES array) against the gate-approved scope. Any extra feature is a violation even if the delivery note calls it "small" or "harmless".
7. **Audit the delivery note against each criterion in words.** Look specifically for: adjectives instead of numbers (performance/comfort), "final" instead of "draft" (legal/pricing), "fine as-is" instead of "needs native review" (machine translations), self-contradicting sentences about publishing/outreach ("no outreach was performed; I did post to ..."), and "owner actions: none".
8. **Distinguish FAIL from INSUFFICIENT EVIDENCE.** If positive evidence contradicts the claim (or the criterion demands a thing that demonstrably does not exist, like rendering tests in a tree with no rendering), score FAIL. Reserve INSUFFICIENT EVIDENCE for claims with no evidence either way.
9. **Write verification-report.md** with: (a) criterion-by-criterion table with verdicts backed by file:line or exact command output; (b) exact commands + exit codes + output of the clean-copy build/test; (c) explicit claims-vs-evidence contradictions section; (d) GO/NO-GO and concrete owner actions.
10. **Do not modify the candidate tree** beyond what the prescribed build/test commands themselves generate. Do not publish, spend, or contact anyone.

Common mistakes: trusting a passing build as evidence the tests pass; treating an existing locale file as "locale loads" without checking a code path reads it; softening a contradiction into INSUFFICIENT EVIDENCE; leaving owner actions vague.
