---
name: learned-queststoredb-compact-fetch-4aa7
description: When a COO/CEO directive needs measured Quest store figures (ratings, reviews, average, price with region) for many titles from queststoredb.com on one day under a tight deadline.
---

1. Reconstruct the exact directive from the run transcript (forge/runs/<run-id>/agents/001-1_supervisor_plan.md), especially required titles, columns, verdict lines and kill condition.
2. Do NOT delegate a many-title fetch to sub-agents with a hard turn cap: they burn turns on search and hit the cap before returning. Fetch directly with web tools in parallel batches.
3. Discover QSDB URLs from prior transcripts (keyword search of forge/runs for the title) before web search — search engines throttle and return redirect/captcha pages.
4. Fetch each QSDB page with an extraction prompt that asks ONLY for: exact displayed ratings count, displayed reviews count, average rating, price as shown with region/currency, and a short quote about what changes per run (generated titles). Ask for exact displayed text and 'not shown' where absent.
5. Launch the independent fetches in ONE parallel batch. Record fetch date explicitly (today's date).
6. Cross-check against older measured counts only for plausibility; never substitute an older count for today's. If a count is abbreviated or absent, label it exactly as shown and count it as a gap.
7. Compute the verdict from the fetched table: check the 1,000-ratings threshold overall and within the calm/puzzle/music subset, name the mechanism, and fire the kill condition if no generated title reaches it.
8. Report: table + 3-line verdict + evidence line with n and strength, and say plainly which titles are missing or stale.
