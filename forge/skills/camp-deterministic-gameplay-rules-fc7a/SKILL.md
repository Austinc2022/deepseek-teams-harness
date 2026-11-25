---
name: camp-deterministic-gameplay-rules-fc7a
description: deterministic-gameplay-rules-and-state
---

When to use: implementing or refactoring core loop code in src/gameplay/ — the game state machine, rules and transitions.

1. Design the state before code: write a table of states × legal transitions (state, event, guard, next state) in the README. This table is the spec; code must match it exactly.
2. Make rules pure: every rule is `(state, event, rng, clock) -> new state`. No `Math.random`, no `Date.now`, no DOM, no globals inside src/gameplay/. Inject a seeded RNG and a tick counter as arguments.
3. Fixed timestep: logic consumes fixed-dt ticks driven by an accumulator; rendering/interpolation lives outside src/gameplay/. Nothing in rules may depend on frame rate.
4. Handle illegal input explicitly: unknown events and illegal transitions must either throw with a clear message or return state unchanged with a reason — never silently mutate. Terminal states are absorbing.
5. Write down invariants before testing: e.g. score >= 0, lives within bounds, terminal states never leave, replay from (seed, event log) is deterministic. Each invariant becomes a test.
6. Unit tests TDD-style (red first): one test per transition in the README table, one per rule edge case, one determinism test (same seed + same event log twice ⇒ deep-equal states), one seeded fuzz test asserting invariants over a long random event sequence.
7. Before handover verify: full suite green; grep `Math.random|Date.now|performance.now` in src/gameplay/ returns nothing; every state name in the README table appears in the code and vice versa; the fuzz test uses a fixed seed so failures reproduce.

Common mistakes: putting timing or randomness in rules (breaks tests and replays); testing only happy paths (illegal transitions are where state machines rot); mutating state in place (makes replay and time-travel debugging impossible).
