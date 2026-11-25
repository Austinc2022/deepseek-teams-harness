---
name: learned-vr-store-demand-evidence-ba2c
description: Whenever you need measured demand evidence for VR titles (comparables, concept-class rankings, GAME.md Commercial blocks): fetching store pages for price, rating/review counts and content quantity.
---

# Store-page demand evidence (VR titles)

1. **Find URLs by search first** (websearch, 3-5 parallel queries: "<title> Steam store", "<title> Meta Quest store experiences"). Never guess Steam app IDs.
2. **Fetch in parallel batches of ~5** with WebFetch. Steam: append `?cc=us&l=english` or you get AUD/EUR prices. Meta/Quest pages are JS-heavy and often truncate to navigation.
3. **Always make the prompt ask the model to state the page title first**, then extract (count, star score, price, release date, content quantity). Harness results return out of invoke-order; the echoed title is the only reliable attribution. Never extract without it — you will misattribute related-game rails to the page itself.
4. **Fallbacks when meta.com truncates**: queststoredb.com/game/<slug>-<appid>/ (gives ratings + text-review counts + price history) and steamstat.io/app/<appid> (all-time vs recent Steam reviews). Label the fallback source in the table.
5. **Record every count with URL + fetch timestamp + strength**. Anything not fetched this run is "hearsay" even if it came from a prior report. Flag stale facts (knowledge_flag) when a recheck confirms or changes them.
6. **Instrument skew**: Quest "ratings" (any star, low effort) run much higher than Steam written "reviews". Never average them silently — say which instrument each row uses. F2P titles (Blaston) inflate ratings: ratings ≠ paid demand.
7. **Per-hour-of-content proxy**: store pages state songs/puzzles/levels, not hours. Proxy = median count per class ÷ stated content-quantity cost per unit (a licensed song is expensive, a jigsaw diorama cheap); label the denominator ARGUED, the numerator MEASURED.
8. **Common failure**: extracting the "(2.8K)" abbreviated count and reporting it as an exact figure. Report what the page shows; cross-check trackers for exacts; note rounding (e.g. 2,844 vs "2.8K" vs "2.3K" between meta.com and queststoredb).
