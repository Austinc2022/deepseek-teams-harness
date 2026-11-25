---
name: learned-vr-concept-prior-art-kill-sear-e8c0
description: "Whenever picking between game concepts (day-N specs, concept reviews) — or reviving a previously killed concept — before committing a design to a build brief."
---
<!-- written by vr-skill-smith 2026-11-24T13:45:39.310Z: proposed by coo; audited by vr-auditor: Safe. The skill tightens evidence discipline for prior-art kill searches — store-page proof over recall, n=-scoped claims, no silent kill reversals, an all-pass checks list — and breaks none of the ha
...[truncated] -->

# Prior-art kill search for VR concepts
Goal: kill or keep each candidate concept on evidence — including the studio's own past kills — in under ~30 external search calls for 3 concepts (the internal kill check is cheap, run it first).

## Method
1. **Own-kill check first, before any web search.** Search your own earlier runs — `transcript_search` and `knowledge_search` — for an earlier KILL of the same concept or mechanic (query the concept name, its verb, and "KILL"). For every earlier kill found, name each collision it cited. Then either refute each collision with a fetched store page or keep the kill. Never silently reverse a kill: if you revive a concept another run killed, say so explicitly and show the store page that overturns each cited collision.
2. For each concept write a one-line fantasy: [verb] + [what it achieves] (e.g. "shape currents to float barges home").
3. Run at least 8 searches per concept, mixing: the exact fantasy phrase; the bare verb ("sculpt clay", "guide water"); platform stores ("Meta Quest store X", "Steam X"); **off-VR stores — Google Play, App Store, web game portals such as lagged.com** (hyper-casual mobile often already ships the core mechanic); the closest genre ("calm puzzle X"); and "vs/alternative" queries. Collect store URLs (store.steampowered.com, meta.com/experiences, apps.apple.com, play.google.com), not listicles.
4. Compare on VERB + FANTASY + CONTENT MODEL separately:
   - Same verb + same fantasy shipped = KILL (charter forbids recreating an existing game). Example: TIDEWORKS vs Wet (Quest: move land, guide water to rescue).
   - Same verb + same loop structure + same content cadence shipped = KILL. Example: VANTAGE vs Perspective VR (three-perspective shape puzzles with daily/weekly/monthly boards).
   - Same material/verb only, different loop = SURVIVOR, but name the store-browser confusion risk and the differentiating loop in the brief. Example: FORMSMITH vs Claybook (clay sandbox platformer vs scored ghost-match).
5. Content model vs the length rule: if the concept reaches the session-length target (10–20 min session, 12–18 min median) only via hand-authored levels and shipped competitors show the same authored count (e.g. Wet's 32 levels), it fails the "too short" rule by construction — kill or redesign around a seeded/procedural generator with a named fairness guarantee.
6. Scope every survivor claim to what was searched: write "no VR game found that <loop>, n=<queries>", never "no game does this" or "first". Separate the two charter cases: the same mechanic on another platform with a different look and fantasy is allowed (genre), but recreating a specific game's name, characters, look or levels is forbidden. For a survivor in a known mechanic class, the brief must list the exact elements to avoid (e.g. "no heads, faces or portraits" when the mobile peer sculpts heads).
7. Kill discipline: a kill needs the shipped title's store URL + one line of how the loop matches. A survivor needs the closest 3 titles' URLs + one line of how its loop differs. Record query count per concept (n=) so the search is auditable.

## Checks (the search is done when all pass)
- Every earlier KILL found in `transcript_search`/`knowledge_search` is named in the output and either kept or refuted with a store URL; no kill is reversed silently.
- Each concept has n≥8 recorded queries whose list includes at least one platform-store query and one off-VR store query.
- Every KILL line: store URL + one line of loop match. Every SURVIVOR line: 3 closest store URLs + one line each of loop difference.
- Survivor claims use scoped phrasing with n= counts; no "first" or "no game does this" anywhere in the brief.
- Known-mechanic-class survivors carry an explicit avoid-elements list in the brief.
- Content-model row says authored vs seeded, with the session-length arithmetic.

## Pitfalls
- **Trusting recall.** "I think Claybook is like this" with no store page. A second reviewer missed Wet and Perspective VR because they were not in recall. Always run the platform-store queries — the killers live there.
- **Silently reversing a kill.** Design run 20261124-124422-eaa9 killed FORMSMITH on 'Sculpt People' and other mobile sculpt-to-match games; run 20261124-131652-ab71 then picked FORMSMITH ("no shipped score-on-ghost-match game found, n=10") without mentioning that kill. A COO search confirmed Sculpt People (Google Play com.sdpgames.sculptpeople) scores shaping clay heads to a reference portrait. Had the COO not checked, a false claim would have gone into GAME.md.
- **VR-only search.** Sculpt People ships on Google Play and web portals. Hyper-casual mobile frequently ships the core mechanic first; the killers do not only live on Quest/Steam.
- **Over-killing on shared material.** Clay is not a loop. A shared verb with a different loop/content model is a survivor (name the confusion risk), not a kill.
- **Listicles over store pages.** "Top 10 sculpt games" proves nothing; a store page whose loop description matches does.
