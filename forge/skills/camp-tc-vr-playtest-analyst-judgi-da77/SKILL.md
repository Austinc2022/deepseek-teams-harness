---
name: camp-tc-vr-playtest-analyst-judgi-da77
description: When asked to pass/fail a VR demo or milestone against plan criteria using only a build log, staff reports, or bot metrics, with no real player data.
---

1. Fix the evidence inventory first: list every data source and label each as (a) bot/scripted, (b) internal staff (conflicted, small n), (c) real target users. Only (c) can prove fun, clarity, or revenue for the target segment.
2. Default rule: a criterion with zero evidence FAILS. "Not demonstrated" is a fail, not an "unproven pass". Never let absence of a complaint (e.g. "no nausea reports") pass a comfort criterion.
3. Bot metrics prove only engineering facts: completion rate means the loop is completable; "median replay time" in a scripted replay is script length, not player desire. Say this explicitly when earlier drafts misuse them.
4. Check numbers against the stated threshold literally: a fps range that dips below the floor (e.g. 71-74 vs "72+") is fail-borderline; flag it with the fix (hold floor with headroom, measure 99th-percentile frame time).
5. For comfort, enumerate the locomotion stack against the plan's explicit list (snap turn/teleport present? smooth locomotion forced?), plus player scale vs the target segment's real height, plus frame rate under load. Builder preference ("snap turn felt restrictive") is not evidence.
6. First-60-seconds test: anything hiding the core object (title cards), any tester asking "what do I do?", or gaze spent on non-action UI (e.g. over 40% on a menu) is direct evidence against FUN/CLARITY legibility.
7. Correct earlier analyst drafts point by point: name each claim, the evidence it cited, and why the inference is invalid (bot to fun, no-complaint to comfort, speculation to revenue).
8. Output per demo x criterion: PASS/FAIL + the specific number/observation + one line on what it can and cannot prove; then named comfort risks, concrete changes, a real-player test question list, keep/change/cut per feature, and a score with must-fix items.
