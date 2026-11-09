---
name: venture-scoring
description: Shared rubric for scouting, scoring and judging desktop/app business ideas - evidence rules, revenue tiers toward the $10M/day north star, scoring dimensions and kill criteria.
---
# Venture scoring rubric

The studio's north star is an app that could gross **$10M per day (~$3.65B/year)**. Almost nothing
reaches that, so honesty matters more than enthusiasm: a credible $50k/day idea beats an
imaginary $10M/day one. Never inflate numbers to hit the target.

## Evidence rules (all agents)
- Every market, revenue or demand claim needs a source URL you actually opened, or is labelled
  `(estimate: <method>)` with the arithmetic shown.
- Prefer primary data: company filings, app-store rankings, public revenue reports
  (Sensor Tower / Appfigures / data.ai press summaries), pricing pages, job postings, forum threads
  with engagement counts.
- Demand signals beat opinions: people paying for bad workarounds, repeated complaints with
  upvotes, rising search/trend data, fast-growing competitors.
- No invented quotes, companies, stats or URLs. Unknown is a valid answer.

## Revenue tiers (gross revenue per day at maturity, year 3-5)
| Tier | $/day | Meaning |
|---|---|---|
| T0 | < $10k | lifestyle business |
| T1 | $10k - $100k | strong indie / small company |
| T2 | $100k - $1M | venture-scale company |
| T3 | $1M - $10M | category leader (top ~100 apps worldwide) |
| T4 | ≥ $10M | north star: platform-level (handful exist globally) |

Always give three numbers: `y1PerDay` (realistic year 1), `y3PerDay` (realistic year 3) and
`ceilingPerDay` (best case if it becomes the category winner), plus the formula used
(users × conversion × ARPU / 365, or comparable-company benchmark).

## Scoring dimensions (0-10 each)
1. **Demand evidence**: how strong and recent the paying-demand evidence is.
2. **Market size**: TAM in dollars and the growth rate.
3. **Revenue ceiling**: the tier the ceiling plausibly reaches.
4. **Moat / defensibility**: network effects, data, switching costs, distribution.
5. **Feasibility**: can a small AI-assisted team ship an MVP in ≤ 8 weeks? What are the hard parts?
6. **Time-to-revenue**: how fast the first dollar arrives.
7. **Competition gap**: how clearly incumbents fail the user (10 = obvious gap).
8. **Risk** (inverted, 10 = low): regulatory, platform-dependency, legal and ethical risk.

`overall` (0-100) = weighted: demand 20, size 15, ceiling 15, moat 10, feasibility 15,
time-to-revenue 10, gap 10, risk 5 (each dimension × weight / 10).

## Decisions
- **pursue**: overall ≥ 70, demand ≥ 6, feasibility ≥ 6, no kill criterion hit.
- **watch**: 50-69, or promising but evidence is thin.
- **reject**: < 50, or any kill criterion.

## Kill criteria
Illegal or deceptive by design, requires scraping or credentials users have not consented to,
gambling/adult/regulated-finance without a licensing path, a pure clone of an existing product's
brand or content, a single-platform dependency that can switch it off overnight with no fallback,
or no evidence anyone pays for this today.

## Idea card format
`title` (≤ 8 words), `oneLiner`, `targetUser`, `problem`, `solution`, `platform`
(desktop/web/mobile/cross), `businessModel`, `evidence[]` (url + what it shows),
`competitors[]`, `whyNow`, `keywords[]` (5-8 lowercase words used for dedup).
