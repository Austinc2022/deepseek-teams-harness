---
name: camp-target-language-prioritisati-6c8c
description: When localisation.md needs a target language list: deciding which languages to support, in what tier, each with an evidence-based reason.
---

# Target language list with reasons

When: localisation.md must state which languages to support and why.

1. **Candidate universe.** List languages by platform store market share for the product's platform (Quest/Meta Store, Steam VR, App Lab). Use websearch or recorded demand facts to get per-country/region VR revenue and download share. Never start from "the usual five languages".
2. **Score each candidate** on four axes, each with a number or named source:
   - addressable demand (market size × category/genre fit),
   - localisation gap vs competitors (a top market where competitors ship no local text is a discovery and review-score advantage),
   - cost (string volume × language effort; include voice/audio, store text, QA on device),
   - technical risk (RTL, complex scripts, font glyph coverage).
3. **Tier the list.** Tier 1 = ship at launch, Tier 2 = post-launch patch, Tier 3 = hold. Every language gets exactly one reason line citing its evidence — not vibes.
4. **Fallback policy.** State the default language, locale matching rules (pt-BR vs pt-PT, zh-Hans vs zh-Hant, es-ES vs es-419), and what users see for unsupported locales.
5. **Cross-check consistency.** A Tier 1 language with High layout risk must name its mitigation (see text-expansion-layout-risk); a Tier 1 language whose glyphs the shipped fonts cannot render is a blocker, not a choice.

**Verify before handover:** every reason cites a number or named source; Tier 1 total cost is estimated; no language appears without a reason; RTL and complex-script languages are flagged; tiers match the layout-risk table in the same document.
