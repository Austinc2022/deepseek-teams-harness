---
name: camp-localisation-deliverable-pre-d841
description: localisation deliverable pre-send audit
---

# Localisation deliverable pre-send audit

Run this once over the complete deliverable before your final message. Fix everything it finds.

## 1. Requirement ledger
- Re-read the brief and list every explicit instruction: numbered tasks, named sections, named bounded options, named required elements, output/format constraints.
- For each item, quote the sentence in your deliverable that satisfies it. No quote = fix it now.
- If the brief names bounded options for a decision (e.g. "full localisation / store-only / defer"), select exactly one of the brief's own options per decision. A hybrid ("full in-game, store text undeliverable") is a defect. If reality spans options, still pick the closest named option and add one caveat line.
- If the brief demands a refusal or exception ("include at least one language you refuse"), spend it on the option with the weakest evidence and quote the number that justifies the refusal (share, count, ratio).

## 2. Numbers: derive or attribute
- Every number must be one of: (a) read from a fixture — cite file and row/line; (b) computed from fixture values — show the arithmetic inline ("288 px / 240 px = +20%"); (c) an industry rule of thumb — name the source and mark it "rule of thumb, not measured here".
- Never present a generic range ("+30–50% width", "~2x line height", "~300–900 glyphs") as project data. Derive from the actual strings: take the longest source string, show its character count, apply the factor arithmetically, compare with the named container/button width from the spec.
- Store-copy character counts must be shown: the string plus its computed count. "~155 characters" without the count is an assertion.
- If a number cannot be derived from the fixtures, write "no fixture evidence" instead of asserting one.

## 3. Terminology and cross-section consistency
- Before drafting, build a one-line glossary: product title and key feature/term names with the chosen rendering per target language, from the fixtures only.
- Use exactly one rendering per term in every section and every locale's copy. Inconsistent product naming across locales (title vs store body) is a scored defect.
- Re-check every stated value against every other section: placeholder rules, counts, decisions, tone declarations. If one section demands "{n} placeholders and ICU plurals", no sample copy elsewhere may contain literal counts without a stated reason. If a tone is declared (e.g. polite form), the delivered copy must match it.

## 4. Evidence placement
- Every conclusion resting on missing data carries the tag inline in that sentence ("not enough evidence — <what is missing>"). Do not collect uncertainty only in a closing blockers section; the blockers section may repeat earlier tags but must not introduce new ones.
- A single source stays a single source: never write "corroborated", "confirmed", "platform data shows", or invent a rationale (e.g. a "paired store language") unless you can name the file/row that says it. "Single hearsay source (<where>)" is the correct wording.
- Accepted and rejected decisions alike need their specific supporting or failing evidence named.

## 5. Send check
- List the brief's must-include keywords (language codes, script names, asset types, named required elements such as a sign-off gate item) and confirm each appears in the text the reviewer will read.
- Confirm no required element named in the brief is mentioned only "in passing" — it must appear as a decision, gate or list item.
