---
name: camp-quest-ratings-and-data-discl-35c5
description: quest-ratings-and-data-disclosure
---

Use when drafting the age rating questionnaire and data/privacy questionnaire answers for a Meta Quest store submission (store-package/compliance/).

1. Get the content facts first: read the product's content description (violence, language, user interaction, UGC, in-app purchases, etc.). Every questionnaire answer must trace to a named source file or section — never guess.
2. Age rating: identify the applicable authorities per region (IARC global plus regional bodies such as PEGI, ESRB, USK, GRAC, ACB as relevant — verify the current list via websearch). Draft IARC questionnaire answers region by region, one line per question with: answer, source, confidence. Flag differences between regions (e.g. stricter language/violence thresholds) as explicit deltas.
3. Data disclosure: draft Meta's data disclosure answers — data types collected (identity, location, usage, diagnostics, device/body data), whether shared with third parties, whether tracked, retention and deletion handling. Cross-check against the privacy-policy and compliance-check outputs; any contradiction between the questionnaire and the policy is a finding, not something to paper over.
4. Produce a per-region delta table: age-gate requirements, consent requirements, regional rules (e.g. GDPR lawful basis, children's rules) — from compliance-check, not from memory.
5. End with an "Owner questions" section listing every answer that needs owner confirmation.

Verify before handover:
- [ ] Every answer cites a source; nothing is a bare assertion.
- [ ] Unknowns are in the owner-questions list, not silently filled in.
- [ ] Data disclosure answers agree with the privacy policy draft.
- [ ] Region deltas are stated per region, not as one global block.
- [ ] Rating answers match the content actually described in the product docs.
