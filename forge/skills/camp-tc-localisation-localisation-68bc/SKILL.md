---
name: camp-tc-localisation-localisation-68bc
description: Reviewing a UI spec or store draft before any translation/vendor handoff, to produce strings inventory, bounded language list, layout-risk fixes and a gate call.
---

1. Extract every user-visible string from the spec and code excerpts; split into keyed vs hard-coded; count hard-coded items explicitly. For strings claimed "externalised", demand the actual key file export — a count without keys is not an inventory.
2. Fix naming convention up front: dot-namespaced lowercase keys (area.element), ICU MessageFormat with named placeholders, CLDR plural forms, BCP-47 locale tags, no string concatenation ("Combo x" + n must become "Combo x{count}").
3. Bound the language list to <=7 including en. Justify each with one cited source (store docs, platform survey) or mark "no evidence found". Explicitly rule on any "localise into all N languages" proposal: reject if N is undocumented, unfunded, or un-QAed; point to the platform's documented English fallback as an acceptable launch state; architecture must make later languages drop-in.
4. Check three layout classes minimum: RTL (dir property, logical inline-start/end, bidi isolation of numbers, mirror panels not numerals), CJK (UAX#14 line breaks, no space-based wrap, full/half-width digits, per-script font fallback), expansion-heavy (plan 1.5-2x on short labels, no fixed px buttons, autoshrink floor, max-char annotations per string).
5. Verify fonts cover the target charsets (umlauts/SS, accents, kana/kanji) — a single Latin/ASCII atlas is a launch blocker.
6. Rewrite store title/tagline/description per region with meaning kept but puns/idioms replaced by native ones; respect store character limits and age-rating wording (family claims vs online/UGC features).
7. Gate call: list concrete spec changes required before strings drop in; do not accept "we'll fix after localisation" notes.
