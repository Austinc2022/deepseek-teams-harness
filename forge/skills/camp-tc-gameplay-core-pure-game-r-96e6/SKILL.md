---
name: camp-tc-gameplay-core-pure-game-r-96e6
description: Implementing a deterministic, dependency-free game rules module from a plan that contains an unimplementable spec (wall clock, randomness) or an unresolved ordering question.
---

1. Read the spec and list every numeric rule (scores, multipliers, floors, tick semantics) and every state transition, including which transitions are illegal.
2. Classify each conflict before coding: (a) impure input (wall clock, randomness) — replace with an explicit tick-based constant and say so; (b) ambiguous ordering (e.g. multiplier before/after an increment) — pick one, pin the first affected value in a test, document it.
3. Keep the module pure: no Date.now/Math.random/DOM/timers. Drive everything from tick() and actions; make spawns deterministic (counter ids, fixed hue rotation or caller-supplied).
4. Illegal transitions: return false/null/outcome object, never throw. Tests should hammer every method from every state and assert doesNotThrow.
5. Write a self-check test that greps the module source for forbidden tokens (Math.random, Date.now, window, document, setTimeout...). Beware: word-boundary regexes and your own comments ("three.js" trips a /three/i check) can cause false failures — keep comments clean or tighten the pattern.
6. Check the module system actually in force: a parent package.json with "type": "module" makes require() fail. Use ESM import/export when one exists even if the task says "no package.json".
7. Run node --test, fix, and report the literal pass/fail counts. Keep any README under its word cap (wc -w).
