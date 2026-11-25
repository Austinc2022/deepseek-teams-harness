---
name: learned-config-fix-layer-selection-via-2805
description: When a fix must change a runtime parameter (maxTurns, timeouts, budgets, caps) for one live agent or call path in a layered config system, or a review says a fix landed at the wrong layer (generator default that never reaches the existing instance).
---

# Config fix-layer selection via resolution-chain tracing
Before writing any patch for a runtime parameter, build the resolution map and pick the layer; choosing from the config file's topic alone lands the fix at a layer the runtime never reads.

1. **Find the consumer first.** Grep for the parameter at the runtime boundary (e.g. runner reads `def.maxTurns`). Note whether it is read once at creation or on every call.
2. **Walk the chain backwards to every source**, with file:line: consumer <- merge/normalize step <- lookup <- generators. For each layer record (a) precedence position and (b) **apply time**: every-call, create-time only, or regenerate-only. Example from this harness: base = opts.def ?? registry.getAgent(name) (engine.js:144), overrides deep-merged on top and win (engine.js:145-148, deepMerge registry.js:306-312 replaces arrays wholesale; normalizeAgent uses ??= so explicit values survive).
3. **Write the precedence table** (lowest -> highest) and mark each row create-time vs per-call. A create-time layer (profile/generator defaults, e.g. generic.js:439 written by setup) cannot fix an already-existing instance (setup skips existing, setup.js:37). An on-disk instance file may be unreadable to the change channel (gitignored -> a repair cannot commit it).
4. **Filter by channel carry-ability BEFORE choosing.** List what the change channel refuses (PROTECTED files, gitignored paths, quota). Discard layers the channel cannot carry no matter how correct they look.
5. **Pick the highest-precedence per-call layer that is carry-able and that the consumer actually reads** — in this harness: `overrides: { <param>: <value> }` on the api.agent call site (precedent: desk.js:154, super.js:638/1179). Prefer per-call overrides for changing ONE caller; do not touch global defaults when only one call site needs the new value (same rule as axios: per-request config > instance defaults > library defaults).
6. **Prove with a failing control at the consumer layer** (vr-own-failing-control-proof): assert the EFFECTIVE merged value the consumer sees (or that the call site carries the override), run it on the edited file (must pass), then swap the pre-edit file in (must fail with the quoted exact error). A test pinned to the config source (e.g. asserting the profile default) passes even when the fix never reaches the live instance.
7. **Check merge semantics before assuming**: arrays replaced vs merged, defaults filled with ??= vs forced, and whether hidden options fold into the override object (engine.js:146-147 folds opts.model/opts.effort into overrides).

## Common mistakes
- Changing the generator/profile default and testing THAT layer (the reviewed patch 02b pinned its test to the profile default while the live agent kept the old value).
- Editing the instance file that the channel cannot carry (gitignored yaml): works in place, dies at the channel.
- Choosing opts.def (whole-def replacement) to change one scalar.
- Trusting quoted line numbers; re-read the merge code.
- Letting a green test on the broken file count as proof.
