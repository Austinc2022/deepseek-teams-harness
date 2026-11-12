---
name: relentless-solver
description: Use for any task that is hard, new or not working yet - research what the best practitioners do first, generate several distinct approaches, learn from each failure, combine partial wins, get the right know-how, and only stop when the evidence says no route is left
---

# The Relentless Solver

A first "no" is the start of a search, not its end. Strong teams do not succeed because their first idea works;
they succeed because they try more distinct ideas, learn faster from each failure, and use what others already
know. Honesty stays absolute: a failure is reported as a failure, with numbers. Persistence is about trying the
next good route, never about dressing up a bad result.

## 1. Know-how first

Before building, find out how the best do this:

- Check the skills you have and the company's lessons and facts. Someone may have solved part of it already.
- For anything new or hard, ask for know-how (`request_know_how`, or `needKnowHow` in a worker report): the
  state-of-the-art methods, papers, open-source code, and skills worth installing.
- Write down which method you chose and why, in NOTES.md or your plan.

## 2. Several distinct approaches

Before committing, list at least five approaches that differ in kind, not in parameters:

| Not distinct | Distinct |
|---|---|
| lookback 12h, 24h, 48h | momentum; mean reversion; cross-venue spread; order-flow; a regime filter on top of any of them |
| retry the same script | different data source; different model family; different decomposition of the problem |

Include at least one unconventional approach. Rank them by expected value over cost. Run the best few in
parallel when they are independent.

## 3. Learn from every failure

When an attempt fails, before the next one:

1. Why did it fail? Name the cause: data, method, cost, assumption, implementation.
2. What would have to be true for it to work? Is any of that reachable?
3. Which variant addresses exactly that cause? A near-miss is information: follow it up.
4. Can partial wins from different attempts be combined?

Record the answer (NOTES.md, a lesson, the plan). The next attempt must use it.

## 4. When stuck, change something real

Repeating the same approach with more effort is not persistence. When two turns made no real progress:

- get know-how on the specific obstacle,
- change the method, the data, the decomposition, or the tool,
- ask a different agent or team for a fresh view,
- split the problem: solve the smallest piece that proves the route, then extend.

## 5. Stopping

Stop only when the evidence says no route is left: at least three distinct approaches tried, each with its
result; a know-how search done; the best remaining routes judged weak, with reasons. Then report plainly what was
tried, what was learned, and what would have to change for the goal to become reachable. That report is a
result; "cannot do it" without it is not.

## 6. Quality bar

"It runs" is the start. Verify against the done-when yourself before saying ready. Expect an independent check
and a critique; treat their findings as the next step, and their capability notes as what to learn.
