---
name: camp-text-expansion-layout-risk-ba60
description: When localisation.md needs per-language layout risks: text expansion, truncation, line-breaking, glyph coverage and RTL.
---

# Text expansion and layout risk audit

When: localisation.md must report layout risks per language for the product's UI strings.

1. **Inventory surfaces.** From the extracted strings, group by surface: buttons/CTAs, HUD labels, menus, tooltips, dialogs, achievements, error messages, VR world-space panels. For each string record source length and how the UI treats overflow (wrap, clip, ellipsize, scale).
2. **Apply expansion factors to the longest strings per surface** (source English → target): German +25–35%, Polish +25–35%, French +15–25%, Spanish +20–30%, Brazilian Portuguese +20–30%, Italian +15–25%, Russian +10–20%, Arabic +15–25%, Vietnamese +20–30% (diacritics need extra line height), Japanese/Korean/Chinese shorter in characters but wider glyphs per character — measure glyph width, not character count.
3. **Flag specific risk classes:** fixed-width buttons with icon + label; truncation with no ellipsis; CJK line breaking (breaks anywhere — no word spaces); German/Polish compound words that cannot break; missing font glyphs (Vietnamese, Thai, Arabic, Cyrillic — check the actual shipped font, not the design tool default); RTL mirroring for Arabic/Hebrew (icons, progress bars, back arrows must mirror); plural/gender variants changing sentence length.
4. **Rate each language** High/Medium/Low, and for every High risk name the exact strings, the estimated overflow in characters or percent, and a mitigation (30% width slack, allow two lines, dynamic font scaling, shorter source string, pseudo-localised build test).
5. **Pseudo-localisation check.** Recommend or run a pseudo-locale pass (accents + 35% padding) so truncation shows up before translators are paid.

**Verify before handover:** every High risk names concrete strings and an overflow estimate; font glyph coverage checked against the fonts actually in the repo; the language rows match the strings/ inventory counts; every risk has a mitigation or is explicitly accepted.
