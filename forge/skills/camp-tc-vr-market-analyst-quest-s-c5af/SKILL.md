---
name: camp-tc-vr-market-analyst-quest-s-c5af
description: Building an evidenced demand report for a Quest store category (prices, rating counts, revenue estimates, paying segments).
---

1. Treat the store snapshot as the sole observed record for prices/ratings/dates; everything else is a labelled web claim with URL + access date.
2. Convert ratings to units with a buyers-per-rating factor f: f=75 niche/engaged communities, 110 median, 250 casual (Curran/GameDiscoverCo, mixed-news.com 2023-04-08). Units = ratings x f; gross = units x price; net = gross x 0.70 (label Meta's 30% fee as assumption unless verified). Show the arithmetic inline for every figure; label Estimate.
3. Build ratings targets from observed ratings-per-month of comparables (total ratings / months since release), then discount for a new entrant; state the target and horizon (e.g. 36 months).
4. Segment claims must be paying evidence: what comparable titles sell, at what price, with how many ratings, in which regions. Upvotes, review quotes and stated intent go to a separate "interest, not paying" note or the unverified list.
5. Regional splits: if the snapshot has no per-region sales/ratings, say the split is unsupported and name the data needed (per-storefront counts, Sensor Tower/AppMagic-type country estimates, local price x install base). Never invent a % split as observed.
6. Each candidate needs >=3 sources with URL and date (store page URLs from the snapshot count, dated by capture; web pages get URL + publication date + access date).
7. Cross-check with platform facts: e.g. Road to VR 2023-03-22 "40 Quest titles >$10M", QSDB 2025 yearly ratings gains; note QSDB's warning that incentivized reviews inflate counts.
8. Keep an explicit "Unverified claims" section for every claim lacking a URL or resting on an unsourced constant (incl. the 30% fee and 'ratings imply purchase' assumptions).
9. Less-trusted sources: researcher notes with unsourced multipliers; snippet-only web results not fetched; paywalled fragments.
