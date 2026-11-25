---
name: camp-tc-localisation-cold-read-lo-f005
description: Reviewing a contractor's "finished" localisation pack (string CSVs + claims) before sign-off, especially when the only evidence is a summary doc.
---

1. Treat every claim in the pack as unverified until a concrete artefact backs it (actual CSVs, extraction scan, on-device QA capture). A summary row list is a sample, not delivery.
2. Rank defects by blast radius × visibility on device: (a) in-scene literals not in CSV (ship source language in every locale), (b) untranslated price/currency strings, (c) machine-glossed idioms in first-run text, (d) one source key serving two senses (polysemy collision) — worst in accessibility/legal strings, (e) RTL: arrow/chevron direction and mirrored layouts, not just text.
3. Check placeholder integrity ({count} etc.) per locale; check numbers/currency are not baked into source strings ("From $12" cannot be localised without a split).
4. For demand/market claims: require a dated, cited source (market report ranking, store-console territory export). "No source cited" = no evidence; state the single datum that would settle each claim, do not invent numbers.
5. Desktop screenshots are not QA evidence for a VR app: demand headset captures at native resolution covering RTL/bidi, CJK fonts/glyph coverage, and text expansion (de/fr ~+20-30%) overflow.
6. Write store copy replacements (ja, Gulf ar) as plain one-sentence, idiom-free, brand-name-in-Latin text; verify with native review before publish.
7. Verdict rule: one contradiction in the pack's own notes (e.g. "no hard-coded text left" + a known literal in the scene file) is enough for a "no". Quote exact strings in findings.
