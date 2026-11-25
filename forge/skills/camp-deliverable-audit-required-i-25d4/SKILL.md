---
name: camp-deliverable-audit-required-i-25d4
description: Before delivering any verdict, audit, cold review or levels.md/spec deliverable — whenever the task names required quotes, labels, counts, sections or word caps, or the deliverable contains numbers or fixes you produced yourself.
---

# Pre-delivery audit: requirement ledger + self-consistency

Run this as the last step before you write the final answer. It is a checklist, not prose.

## 1. Requirement ledger
- Copy every explicit instruction from the task into a checklist: word/line caps, named verdict labels, required quoted numbers or lines, required sections and fields, any claim or line the task singles out for adjudication, and the exact count of items requested (e.g. "three fixes").
- For each line, write where it is literally satisfied and paste the verbatim quote or label you used. If you cannot, it is not satisfied — fix it now.
- Anything the task names explicitly must appear quoted verbatim and carry the exact named label the task specifies. "Discussed in passing" or "implied by my table" does not count.
- Deliver exactly the requested number of items: no extra fixes, no bonus sections.

## 2. Named-case pass
- Every claim, line or datum the task singles out gets its own verdict row with the task's label vocabulary spelled out (e.g. an insufficient-evidence case must say the named label in words).

## 3. Self-consistency sweep
- For each number in prose, re-derive it from your table/coordinates. Mismatch → the prose is wrong; fix it.
- For each design claim ("nothing within X of Y", "the only change is Z"), find the row in your own tables that could falsify it and check.
- Cross-references: any value, beat, mechanic or first-test entry that appears in two tables must read identically in both.
- Totals: beat durations sum to the stated level length; coordinates are well-formed.

## 4. Fix validation
- Run each proposed fix through every acceptance criterion. If it violates any (e.g. adds content tested before it is taught, or needs a mechanic the product never introduces), replace it with a fix that passes all criteria — usually shrink/reshape rather than add.

## 5. Evidence hygiene
- Use only counts and values present in the source. Any ratio or subset count you compute is labeled "derived" with its inputs shown.
- Any parameter you invented (thresholds, bands, timings) is named as an assumption with its value, and you say what content purpose it absorbs.

## 6. Length
- Count words for every capped section. Cut convention preambles and unsolicited extras first. Stated word targets are caps, not suggestions.

## Common mistakes
- Implicit satisfaction of a named quote/label requirement.
- Presenting a derived count as one of the fixture's counts.
- A fix that creates a new violation of the acceptance criteria.
- The same entry stated differently in two tables.
- Padding a short target with preamble or extra items.
