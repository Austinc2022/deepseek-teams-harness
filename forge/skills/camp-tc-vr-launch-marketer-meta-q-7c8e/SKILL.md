---
name: camp-tc-vr-launch-marketer-meta-q-7c8e
description: When drafting per-region prices (local currency, DRAFT status) for a Meta Quest / WebXR app listing from evaluation notes and segment evidence.
---

1. Take the segment and evaluation notes per region as the pricing evidence; never default to the studio's usual anchor when the app/segment differs (e.g., premium educational app vs casual game).
2. Pull dated FX rates from a named free source (e.g., open.er-api.com) and state the date/source in the draft; compute the direct-USD-parity price for each region as a reference, not the answer.
3. For each region, position the price inside (or deliberately below) the local comparable band, justified by demand quality, price sensitivity, refund risk, purchasing power — never "rich country". Prefer bottom-of-band for casual/value-elastic segments; mid-band when quality evidence (e.g., localisation) is unverified.
4. EU/UK shelf prices are VAT-inclusive, US shelf prices are pre-tax: compare NET of VAT to US parity, and say so, otherwise parity looks better than it is.
5. Format prices to local convention (JPY/BRL no decimals plus conventional endings like ¥1,980 / R$24.99; EUR €12.99).
6. Mark every price DRAFT in the price cell itself and state the owner makes the final call in the Meta developer dashboard. Never submit, publish, spend, or contact anyone.
7. Add an evidence-gaps section: each thin/missing item plus one concrete thing that would strengthen it (payment data, localisation quote/QA sign-off, refund benchmarks, soft-launch or wishlist data).
8. Recommend ONE time-limited launch discount: same percentage, same dates in all regions, ends on a stated date, struck-through base visible; base prices stay as drafted.
9. List anti-patterns to refuse: permanent underpricing / race to the bottom, mismatched tiers inviting region-switch arbitrage, promising unshipped features, overpricing a weak-evidence region to "fix" arbitrage, touching the dashboard yourself.
10. Also guard listing claims against the real build (no accounts => don't imply per-user profiles on shared devices; local progress => don't claim cloud sync).
Mistakes to avoid: stale FX without dating it; 1:1 USD:EUR pricing without checking the local band; treating competitor shelf prices as like-for-like when they carry IAP/ads; long prose where a table suffices.
