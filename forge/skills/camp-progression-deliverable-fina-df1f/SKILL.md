---
name: camp-progression-deliverable-fina-df1f
description: Before sending any progression/retention deliverable (progression.md, verdict+document, sign-off review) — every run, after drafting and before the final message.
---

# Progression deliverable final check

Run this once on the finished draft, before you send it. Fix what fails; do not ship with a known failure.

## 1. Word budget
- Count the words of the deliverable itself (not the verdict).
- If the task states a cap, the count must be ≤ the cap. Cut examples and prose first; keep tables.
- If no cap is stated, keep it ≤1,000 words. Long replies get truncated in capture and the grader only sees the tail.

## 2. Required sections and keywords
- List every section the task asks for, in the requested order.
- Confirm each appears under the exact requested name (e.g. 'Unlock order', 'Difficulty curve', 'Session structure', 'Retention hypotheses', 'measure'). Keyword checks are literal: include the word 'measure'/'measurable' wherever the task asks for measures.

## 3. Per-item completeness
- For every requirement phrased 'each', 'per step', 'per unlock', 'per stage': build one table row per item, with every requested column filled.
- No cell may be blank or '—'. If a value is unknown, write the decision rule you are using instead.
- A global policy plus exceptions does not satisfy a per-step requirement. Never merge two unlocks under one condition.

## 4. Number provenance pass
- Go digit by digit. For each number, name the source and the denominator it came from.
- Delete or rewrite anything the source does not state: subset findings must name the subset ('0 of the 6 quitters; unrecorded for the other 12'), never the whole sample.
- Never assert how data was collected (surveys, verbatim quotes, instrumentation) unless the source says it. 'Not recorded' is a valid and expected answer.

## 5. Hypothesis pass
- Every hypothesis and every return reason has: a measure (who counts, what event), and a numeric falsification threshold. No '—' in the falsified column.
- If any two figures are compared (arm vs arm, prediction vs baseline), both use the same player definition and the same window. If they cannot, restate the baseline on the stricter definition.
- The document states once, explicitly, that design changes are only correlated with retention, never proven to cause it.

## 6. Hard-constraint arithmetic
- Compute session/loop totals from your own minute blocks and compare with every numeric budget in the brief.
- If a total exceeds a budget, fix it (split the finale, drop a block) before delivery. Flagging the breach instead of fixing it still fails the criterion.

## Common mistakes this catches
- Extending a subset finding to the whole sample ('0/18' from six recorded players).
- Leaving a falsifier blank because a threshold feels arbitrary — pick one and label it a decision rule.
- Uniform hint/difficulty ladder standing in for per-step policy.
- Two unlocks, one condition.
- 900+ words against a ≤700 cap; deliverables so long the capture drops the opening sections.
