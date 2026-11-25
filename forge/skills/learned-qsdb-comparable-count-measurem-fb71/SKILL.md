---
name: learned-qsdb-comparable-count-measurem-fb71
description: Whenever a GAME.md Commercial comparable row says 'count dropped as unquotable' or 'not rechecked' and you need a measured Quest ratings/reviews count to replace it.
---

1. Open the game's QuestStoreDB page directly by URL (pattern: queststoredb.com/game/<slug>-<id>/); find the URL in past transcripts or the QSDB sitemap rather than websearch, which often returns 0 results for QSDB.
2. Fetch with readability=false (maxChars ~30000). Readability mode strips the count block — the raw page shows "N ratings" and "N reviews" near the top and a "Reviews N" section at the bottom. Cross-check both; they agree.
3. Record exactly: ratings count, reviews count, average, price as shown with region/currency (QSDB defaults to A$ — do not convert), the URL, and the fetch date. QSDB is a third-party tracker, so label the instrument 'queststoredb.com' and note it is not Meta's own count.
4. In the Commercial table, replace only cells labelled 'count dropped as unquotable' — those are the defect. Rows honestly labelled 'not rechecked' can be upgraded the same way but their absence is not a defect.
5. Use the label 'rechecked <date> (measured)' on the fixed row so the gate auditor can see the state change; keep 'UNVERIFIED' off measured rows and keep measured rows off un-measured claims.
Mistakes to avoid: trusting readability=true output for counts; quoting a page-header rounded count (e.g. "1.6K") when the exact number is on the same page (1,564); converting A$ to USD; relabelling a row 'measured' when only the price was rechecked.
