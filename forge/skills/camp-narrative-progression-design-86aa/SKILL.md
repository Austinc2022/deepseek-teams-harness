---
name: camp-narrative-progression-design-86aa
description: Use when writing progression.md: designing goals, unlock order, difficulty curve, session structure, and a testable retention hypothesis with its measure for a product or game.
---

# Narrative & Progression Design

Use this to write `progression.md` as a design contract a planner can execute without inventing details.

## Procedure

1. **Anchor the arc.** State the intended user arc in one sentence and the emotion/tension for each act. Derive 3–5 goals; each needs an unlock condition, a teaching purpose, and an observable success signal.
2. **Map the unlock order.** List every unlock (area, mechanic, story beat, difficulty tier) in sequence. For each, record: prerequisite, what it teaches, what it enables, and the failure mode if introduced too early or too late. Mark hard gates vs optional branches.
3. **Draw the difficulty curve.** Plot challenge against session index in a table. Use introduce → practice → mastery → new tension. Name the knob changed at each step (time pressure, choice cost, information hidden, failure penalty). Mark the first wall — where ~10–20% stall — and its rescue path.
4. **Design session structure.** Define the repeatable loop (entry → objective → tension → resolution → reward → next hook), target session length, first-session milestones (time-to-first-win, time-to-first-unlock), and the exit cliffhanger. Specify the return-user and 7-day-lapsed-user experience.
5. **Form the retention hypothesis.** Write it as: "If we do X, then [cohort] will [behavior] by day N, because W." Name one primary measure, the cohort definition, required events, a baseline and target with rationale, minimum sample and window, and the result that would falsify it.
6. **Hand off.** List assumptions that would change the design if wrong, and any decision that needs data before locking.

## Verify before handing over

- Every unlock has a prerequisite and a reason for its position in the order.
- Difficulty changes are parameterized, never adjectives; each wall has a rescue path.
- First and returning sessions have concrete timings.
- The hypothesis names a measure, cohort, baseline/target, and falsification condition.
- Goals, unlocks, curve, and sessions are mutually consistent.
- The document is a reusable design, not a task-specific answer or implementation log.
