---
name: camp-scoring-and-difficulty-tunin-6bbf
description: scoring-and-difficulty-tuning
---

When to use: implementing or adjusting scoring tables, difficulty curves or progression pacing in src/gameplay/.

1. Express every tunable as data, not code: scoring multipliers, combo thresholds, level-up speeds, spawn rates and fail conditions live in one exported constants/tables module. Rule logic reads the tables; the tables hold no logic.
2. Set target metrics before tuning, and write them in the README: e.g. target win-rate band per difficulty, average score at level 5, time-to-first-fail. Untuned numbers with no target are guesses, not tuning.
3. Build a headless simulation harness (a node script, e.g. `tools/sim.js`) that plays N seeded auto-games with a simple deterministic bot policy and prints metrics: win rate, score distribution, level reached, time-to-fail. Run it with a fixed seed and record N.
4. Tune by editing tables only, then re-run the simulation. Record before/after metrics in a README table including seed and N, so any change is reproducible by a reviewer.
5. Guard rails as unit tests: difficulty is monotonic (level n+1 is never easier on the key axes — assert on the tables), score is bounded (fuzz with seeded inputs asserting max score and no negative/NaN), and no single action can multiply score past a documented cap.
6. Handover checklist: simulation command and its output in the README; metrics table with seeds and N; all tests green including monotonicity and bounds; every constant has a one-line comment saying why that value (target metric it serves).

Common mistakes: tuning constants scattered through rule code (uncountable and unreviewable); claiming balance without running the sim; changing logic and numbers at once (cannot attribute the metric change); tuning to the bot only — note in the README that the bot policy is a proxy for players.
