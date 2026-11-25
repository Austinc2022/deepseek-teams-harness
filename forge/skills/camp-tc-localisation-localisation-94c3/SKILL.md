---
name: camp-tc-localisation-localisation-94c3
description: Any UI-spec or store-listing handoff that needs a localisation plan, strings inventory, or a go/no-go gate before translation.
---

When a UI spec + store draft are handed over for localisation (WebXR/VR titles):
1. Inventory strings in three buckets: (a) already keyed, (b) hard-coded literals in code/spec, (c) strings that exist nowhere (settings/results/errors/leaderboard/comfort copy). Never trust "N strings externalised" claims — demand the key list; unlisted keys count as missing.
2. Flag concatenation (e.g. "Combo x" + number) as untranslatable; require one ICU MessageFormat key with {n} placeholder and ICU plurals. No runtime string building.
3. Bound the language list (max ~7 incl. en) on evidence + QA budget; cite sources or write "no evidence found"; never accept "all N languages" without vendor quotes and LQA budget. Post-launch locales can ship via platform language packs (Meta: ps-language-packs).
4. Check four technical blockers before any translation starts: font glyph coverage (Latin-only atlas = tofu for CJK; dynamic atlases are ~10KB vs hundreds of MB static per Meta localization doc), text-direction property absent = RTL unsafe, fixed-width buttons vs 2–3x text expansion (Meta doc figure), and line-break rules (CJK kinsoku, ICU line breaking).
5. Store text: transcreate puns/wordplay per locale (never carry one pun into all languages); respect per-storefront char limits (verify in the platform dashboard — they vary) and local ad-law (no superlatives in DE/JP); reconcile "for the whole family" claims with the comfort/age rating (USK, CERO).
6. Gate: spec must extract literals, add directionality + font fallback, remove fixed px widths, add per-string max-char notes, and declare a string lock before vendor handoff. Reject handoff until all six are met.
Mistakes to avoid: designing to the English length only; trusting marketing market-share claims without a source; translating UI chrome but leaving baked textures/3D mesh text/VO untranslated.
