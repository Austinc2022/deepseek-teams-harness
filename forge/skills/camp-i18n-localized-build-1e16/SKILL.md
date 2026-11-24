---
name: camp-i18n-localized-build-1e16
description: Use when implementing or auditing internationalisation for a product: externalising strings, adding planned locales (including RTL and CJK handling), writing locale tests and generating a language coverage report before delivery.
---

# Localised build (i18n)

Use whenever the deliverable must ship in more than one language. Keep the source language-neutral and make coverage measurable, not asserted.

## Procedure

1. **Lock the locale contract.** Record the planned language list with BCP-47 tags (e.g. `en`, `ar`, `ja`, `zh-Hans`), scripts and text directions. Define the default/fallback locale and how missing or malformed translations behave — fall back gracefully, never show raw keys or crash. Keep a pseudolocale (`en-XA`) available for stress testing.
2. **Externalise every string.** Move UI copy, errors, dates, times, numbers, currencies, units, plurals and accessibility labels into per-locale resource files. Never concatenate translated fragments; use named ICU-style placeholders. Leave brand names, code identifiers and separately drafted legal text untranslated.
3. **Design for direction and script.** For RTL locales (`ar`, `he`, `fa`, `ur`): mirror layout with logical CSS properties (`margin-inline-start`, `inset-inline`), mirror directional icons/chevrons, isolate numbers and Latin strings with bidi marks, and avoid hardcoded `left`/`right`. For CJK (`zh`, `ja`, `ko`): pick fonts with full glyph coverage, allow natural line breaking, size controls for taller/wider glyphs, and support vertical text only if the plan requires it. Stress-test with 30-40% longer strings (e.g. German, Russian) and pseudolocale expansion.
4. **Add locale tests.** Assert every string key exists in every locale, no raw keys or unfilled placeholders leak, plural/ICU syntax parses, dates and numbers format per locale, RTL mirroring renders, and an intentionally incomplete locale falls back correctly. Run these in CI.
5. **Generate the coverage report.** Produce a table per locale: keys translated / total, real percentage, stale or flagged entries, RTL/CJK check results. List gaps and reasons honestly; do not round up or hand-write numbers.
6. **Hand over.** Include catalogue regeneration and locale-addition instructions with the delivery package.

## Verify before handover

- [ ] Every planned locale is present with the correct BCP-47 tag; default and fallback documented
- [ ] No hardcoded user-facing strings in source; no concatenated translations
- [ ] RTL layout/icons mirror correctly and bidi-neutral content is isolated; CJK fonts and wrapping verified
- [ ] Long-string/pseudolocale stress test passes with no clipping or overflow
- [ ] Locale test suite passes, including missing-key fallback
- [ ] Coverage report is generated from tooling with actual numbers and known gaps listed
- [ ] Build instructions explain how to add or update a locale
