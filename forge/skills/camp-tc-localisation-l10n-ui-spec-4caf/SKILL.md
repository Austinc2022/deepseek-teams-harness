---
name: camp-tc-localisation-l10n-ui-spec-4caf
description: A UI spec or store draft is handed to you for localisation planning: audit strings, scope a bounded language list, and gate the spec before translation starts.
---

# Localisation audit of a UI spec / store draft

1. **Inventory strings in three buckets**: (a) already externalised — verify each key is NAMED, not just counted (specs often say "12 strings in en.json" and name 3; the rest are unverifiable — say so); (b) hard-coded literals — count them, name them, propose keys; (c) store/marketing copy — it needs keys too (store.* namespace). Flag implied-but-undefined strings (pause menus, leaderboard headers).
2. **Kill concatenation before translation**: source strings like "Combo x" + number must become ICU MessageFormat `key = "Combo {n}"`. Never let translators rebuild sentences from fragments.
3. **Naming convention**: `domain.element[.variant]`, lowercase dot-separated, ICU named placeholders `{n}`, source en-US, plurals via ICU plural.
4. **Scope languages with evidence, max 7 at launch**: cite a source per language or write "no evidence found". Distinguish THREE different language lists people conflate: device system-UI languages (e.g. Quest 3(S) has 20), store-listing languages, and revenue/demand. Reject "all N languages" proposals by naming which list the N came from and the QA/vendor budget reality.
5. **Layout risk triad — one of each, exact strings at risk**: RTL (mirroring, bidi-isolated placeholders, shaping — Latin SDF atlases can't do it, Western digits for scores), CJK (tofu from Latin-only fonts; dynamic or baked-subset atlases; line-break rules: no break before 。、」; full-width punctuation), expansion (de/fr +30-35%, some languages 2-3x visual length per Meta doc; fixed-width buttons are the usual bug; document max char counts per UI region).
6. **Regional store rewrites**: do NOT translate puns/idioms literally — replace with a target-language idiom carrying the same meaning; keep only verifiable claims (song counts must be true at launch); family/all-ages claims are age-rating-dependent — drop them; transliterate titles for ja/zh/ko and keep the Latin form as a search keyword.
7. **Gate call**: short numbered list of spec changes required before any localized string drops in (extract literals, direction property, font pipeline, auto-fit layout, locale number formatting, fix wrong-in-EN source strings like input-specific "Tap"). 

Common mistakes: trusting a string count without names; citing device-language lists as demand evidence; literal pun translation; ignoring score number formatting (1.234.567 in de); assuming "Latin-only" atlas covers ä ö ü ß.
