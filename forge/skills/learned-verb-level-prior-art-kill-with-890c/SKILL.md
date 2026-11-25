---
name: learned-verb-level-prior-art-kill-with-890c
description: When attacking game concepts for prior art in a day-N spec, especially after a mis-filed report or when the websearch 'search' tool returns 0.
---

1. Reuse the original candidate run's transcript first (read its agents/*.md file for the exact candidate names, queries and final note). Never re-attack a different candidate set after a correction.
2. Run own-kill on each exact name with transcript_search and knowledge_search; quote the 'No recorded facts match' result. Also search the VERB — an earlier run may have killed the mechanic under different candidate names (e.g. 'stretch-loop dies (Rope Draw, Rope Star ship elastic rope on pegboard to match shape)' killed a later drape candidate).
3. Treat a 0 from the websearch 'search' tool as a broken tool, never as absence of prior art. Verify by searching for a generic term like 'VR game'; if that is 0, switch entirely to direct store-page fetches.
4. Use fetchWebContent / fetch on store SEARCH URLs (Steam, Google Play, itch.io) and record, for each query, the exact URL, the date, and the count the page reported (e.g. '283 个匹配的搜索结果'). Benchmark: at least 8 dated queries per candidate, mixing VR and off-VR stores.
5. Kill on VERB + FANTASY + INPUT + CONTENT MODEL, not on the candidate name. A name search for 'tensegrity' returning 0 says nothing when 'bridge builder physics' returns 283 and the top hit is a VR-supported physics construction game.
6. Fetch the decisive product page to quote its VR support and release date; get its canonical app URL (Steam appid, Google Play details?id=) rather than a search URL.
7. For a survivor, name the closest 3 titles with URLs and one line each on how the loop differs; scope the claim ('no shipped X found in n queries'), never say 'first' or 'no game does this'.
8. Quote the verbatim ticket block (TURN-END, EVIDENCE DISCIPLINE) from the shipped ticket file in the same run you file the brief; check the brief's length and that it ends with the required sentinel.
9. File early with a small complete report if output limits threaten, then file the full report; in the full report's summary, explicitly say it supersedes the provisional call.
