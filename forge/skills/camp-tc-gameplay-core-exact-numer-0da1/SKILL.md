---
name: camp-tc-gameplay-core-exact-numer-0da1
description: Implementing gameplay rules where a spec pins exact numeric values (scores, intervals, multipliers) that come from arithmetic on decimals or exponentials.
---

1. Write the spec's numbers as a closed formula, but decide the return UNIT first: whole ms, whole points, etc. Float arithmetic on decimals (600 * 0.9^2 = 486.00000000000006) will fail strict equality against the spec's stated integers.
2. Round once at the end of the closed form (Math.round of the whole expression), not per step — per-step rounding drifts from the formula and makes level N values unverifiable.
3. In tests, pin the spec's literal values with strictEqual (they only hold if the implementation returns the declared unit), and compute clamp/crossover levels with a quick calculation before writing assertions — do not guess which level hits a floor (600*0.9^k crosses 300 at k≈6.58, i.e. level 8, not level 20).
4. Run the suite once early: a float-drift failure is fastest to see on the very first pinned value test.
5. Document the rounding and unit choice in the module README so reviewers see the formula is exact in its declared unit.
