---
name: learned-commercial-block-template-b575
description: Before any game is greenlit or priced; every GAME.md needs this block so the owner sees an honest path to $10M net revenue, not hope.
---

# Commercial Block — GAME.md (Business department)

Fill in all five sections below. If any section cannot be filled with public evidence, mark it "[OPEN RISK]" and say what would have to be true.

## 1. Buyer persona — who buys this?
State the buyer in one sentence (e.g. "Quest owners who buy fitness games at $15–$20 and play 3–5×/week"). Cite source: internal Quest MAU figure (~18M monthly active users, Quest installed base 25–35M), or a public market report. Do not invent demographics.

## 2. Comparable titles (minimum 5)
Table columns: Title | Genre | Price | Release | Public reviews | Est. revenue | Source | Strength
Use public sources only: RoadToVR, UploadVR, GamesIndustry.biz, Meta GDC disclosures, djEnterprises Quest App Economics, Curran Games Agency / GameDiscoverCo review-to-buyer method (110× median; 75× niche; 250× casual). Do not cite a title's revenue unless the source published it or you applied the review factor to a real review count — label estimated revenue "simulated".

## 3. Price & platform thesis
- Price: $X.XX — justify vs comparables (sweet spot $9.99–$19.99 indie; $20–$29 premium indie)
- Platform: WebXR first (Quest browser + desktop browser); native port/store submission = owner decision, not today's
- Commission: 30% Horizon Store/App Lab; ~15% for in-headset web purchases

## 4. Store-page hook
One sentence: the core loop + why it's fun, in ≤ 60 seconds. Must match the game's actual first 60 seconds. No imitating existing games.

## 5. Honest path to $10M net revenue (use vr_sales_path_calculator)
Run vr_sales_path_calculator with price_usd, commission_rate, quest_mau=18000000, review_multiplier, estimated_reviews. Record:
- copies_needed_for_10m_net
- pct_of_quest_mau (reality flag: PLAUSIBLE <1% / STRETCH 1–5% / HARD >5% / NOT CREDIBLE >20%)
- reviews_needed_at_factor
- verdict text

Then answer honestly: "What would have to be true for this to reach $10M?" (e.g. 5× the reviews of a typical indie Quest title, featured placement, 4.5+ star average, multiplayer retention).

## Grounding rules
- Every claim carries a source and strength (measured / simulated / argued).
- If comparable revenue is not public, say so — do not fabricate.
- A one-day build is "at best a polished vertical slice"; say plainly how far the game is from a $10M product and what would close the gap (months of polish, live ops, multiplayer, DLC, featured placement).
