---
name: learned-vr-name-check-and-comparables-6715
description: When a business block needs a dated name check and fresh comparable review counts, and the search engines return 429 / captcha / regional-redirect errors partway through.
---

## Goal
Get >=3 dated search engines plus store searches for a name check, and 5 verified comparables with URL + date + instrument + count, even when engines throttle.

## Steps
1. Run the exact-phrase name query on several engines IN ONE CALL each (duckduckgo, startpage, exa, brave, bing). Record each as either "N results" or the exact error. Never silently drop an errored engine — list it as "not run" so the count of *valid* engines is honest.
2. Steam name check is two independent, reliable instruments (both plain HTTP, no JS):
   - `https://store.steampowered.com/api/storesearch/?term=<name>&l=english&cc=US` -> JSON `{"total":0,"items":[]}`
   - `https://store.steampowered.com/search/?term=<name>` -> "N results match your search" via WebFetch
3. Meta Store search: `https://www.meta.com/experiences/search/?q=<name>` via the WebFetch tool (the mcp fetch tool returns HTTP 400 on this URL; the WebFetch tool gets markdown and can answer "no results").
4. Comparables: do NOT fetch queststoredb.com search pages (`/?s=`) — the results block is below a long news feed and gets truncated. Instead get the canonical slug from a search result URL like `https://queststoredb.com/game/<slug>-<appid>/`, then fetch that page directly. The page prints "<rating>  <N>K ratings  <N> reviews" and a base price; record rating count and review count SEPARATELY and name them as different instruments.
5. If a title's QSDB page 404s or the engine is down, mark that row UNVERIFIED TODAY and do not reuse a number from memory.
6. Cite the review-to-sales ratio with its real source (mixed-news.com/en/meta-quest-store-analysis/, 2023, Cassia Curran / GameDiscoverCo: 75x / 110x / 250x), not as an internal constant.

## Mistakes to avoid
- Quoting a count you cannot open today and calling it "measured".
- Treating 'ratings' and 'reviews' as one number; QSDB shows both and they differ ~2.4x on these titles.
- The mcp fetchWebContent tool rejects maxChars < 1000 — that error is a schema error, not a fetch failure.
- html.duckduckgo.com/html/?q= now serves a CAPTCHA; do not rely on it.
- A zero-result name check is NOT a trademark clearance — say so.
