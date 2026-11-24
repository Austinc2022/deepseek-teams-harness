---
name: learned-write-all-sections-before-deta-2a10
description: Whenever one output must answer two or more distinct questions or named sections (reviews, audits, assessments, after-action reports, multi-part briefs) and the output may be cut short by turn/budget caps or message truncation: skeleton all sections and put a one-line answer to every question at the
---

# write-all-sections-before-detailing

## When to use
Any reply that must answer two or more distinct questions or cover multiple named sections — reviews, audits, assessments, after-action reports, multi-part briefs — when the output can be cut short (turn or budget caps, message truncation). If the request enumerates Q1..Qn or sections, assume the output can end at any point, including inside the delivered message even when the full text exists elsewhere.

## Method
1. **Skeleton first.** Re-read the request and list every question/section it asks for. Write each as a numbered heading of the answer itself. Heading count must equal question count.
2. **One-line answers at the top.** Before any section body, write a block: one line per question with the direct answer, its evidence label (measured / argued / simulated / hearsay) and a source (file, run id or fact id). This block is the deliverable; everything below is support. After step 2 the request is already answered even if all detail is lost.
3. **Then detail, shortest first.** Expand sections in order of space needed, least first. Keep tables to one row per item — entity | finding | evidence (id + label) — one sentence per cell, no narrative columns. Cite fact ids; do not retell their contents.
4. **Compress, never drop.** When the answer is getting long, shorten the section you are in: fewer rows, shorter cells, fewer examples. Never remove a section or its one-line answer to save space. A complete short answer beats a partial long one.
5. **Self-check against the request.** Re-count the questions in the request text (not from memory). Confirm each has (a) a one-line answer in the top block and (b) a section heading. Confirm no section is missing and no table cell is a paragraph.

## Checks (proof it worked)
- Heading count = question count, counted from the request text.
- Top block has one answer line per question, each with an evidence label and a source.
- At most one sentence per table cell; no prose columns.
- Thought experiment: if the output were cut at the end of the top block, every question would still be answered.

## Pitfalls
- Writing Section 1 in full before Section 2 exists: the 2026-11-24 09:21 organisation pass was cut mid-table in Section 2 of 4 and Q3/Q4 never appeared (measured, vr-work-judge gap g6cc8b348cd, 42/100; the same failure was judged twice that week).
- Burying the answer under a methodology/evidence-base preamble — the reader must hit an answer first.
- Narrative table columns: paragraph cells eat the budget and the cut lands mid-table.
- Dropping "minor" sections when the answer is long — that recreates the failure; compress detail instead.
- Spending the detailing budget on the first or strongest section; importance orders depth only after every section exists.
- Self-checking from memory instead of re-reading the request's questions.

## Evidence
Failure case measured (vr-work-judge run 20261124-091926-5f31, gap g6cc8b348cd). Success case measured n=1 (run 20261124-112406-65b1: front-loaded verdict + compact one-row tables, 34 turns, all sections delivered). Generalization to every agent under run caps: argued.
