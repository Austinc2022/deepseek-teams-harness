---
name: camp-tc-market-analyst-revenue-ta-a3bf
description: When asked whether a subscription product (VR or otherwise) can reach a stated revenue target like $1M/day or $1M/year, and a demand/feasibility memo is required.
---

1. Convert both targets to daily and annual dollars ($1M/day = $365M/yr; $1M/yr = $2,739.73/day).
2. Fix assumptions first: monthly price, monthly churn (consumer subs 5-8% unless evidence says otherwise), platform fee (30% on Quest), gross ARPU/year = price x 12, net ARPU = gross x (1-fee).
3. Run the subs_required tool for each target with the same assumptions; take required_active_subscribers, pct_of_mau, churn_replacement_adds_per_day, implied_ua_spend_per_year.
4. Benchmark required subs against given internal figures (best-in-category app subs, strong-title ceiling, platform MAU). Express the gap as an explicit multiple (e.g. "20x the best app ever").
5. Sanity-check against a real-world category leader: if the target would make the product bigger than the global leader on a far larger platform, the target is fantasy; cite the leader's revenue as an anchor only, never as forecast basis.
6. State what would have to be true (conversion % of MAU, price multiple, years of platform growth, UA budget multiple). If any single lever contradicts benchmarks by >5x, say the gap is structural.
7. Give a scenario table (downside/base/upside with avg active subs, gross, net, $/day) and a single realistic annual revenue range. Put the floor target inside it and show it is reachable; show the headline target outside it.
8. Verdict format: plain yes/no, the multiple it misses by, one recommendation line. No hedging words ("could potentially", "might"). Never propose dark patterns or store-rule-breaking to close a gap; if the gap needs those, the answer is NO.
9. Guardrails: do not use top-down TAM share ("1% of $1.5T") as forecast basis; convert any TAM to units/subs first. Keep the memo under ~1,600 words. Compute all arithmetic from tool output, never from memory.
