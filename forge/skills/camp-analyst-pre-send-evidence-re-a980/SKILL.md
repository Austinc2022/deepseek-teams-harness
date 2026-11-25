---
name: camp-analyst-pre-send-evidence-re-a980
description: Before sending any market/research/review-mining/verification deliverable where counts, prices, revenue or verdicts are derived from provided source files or web sources — every analyst run, as the last step before the reply.
---

# Pre-send evidence reconciliation (analyst deliverables)

Run this as the final step before delivering. It is a check sequence, not a rewrite: work through every step against your actual draft and fix what fails.

## 1. Ground-truth pass over the input files
- Read every provided file in full before counting or classifying anything. Product/feature facts in the files (what comps do or do not support, price histories, capture dates) are evidence — cite them at file:line.
- Map each item to the source's own category vocabulary, not categories you invent. If the file itself labels an item (a refund reason, a badge, a feature flag), that label governs.
- State the counting rule explicitly (one unit counted once; mixed text goes to its primary grievance; explicit feature requests count as that theme).
- Re-add your counts: they must sum to the stated denominator. Quote the file's own totals where they exist; if your per-item sum differs from a quoted total, show both and say which you used and why.

## 2. Reconcile every derived number against the file's constraints
- Any total you quote must equal the sum of the components you name next to it (recompute it before sending).
- Any assumption you choose must be checked against every constraint in the files: a discount/sale history bounds the realised price — pick the price the history supports and show the sale-mix assumption; a capture date bounds the period a figure covers.
- Cross-check reverse-engineered figures against forward estimates: if the implied rate (e.g. sales-per-rating) and the assumed rate disagree, the forward assumptions are wrong — fix them, do not report both.
- Never report a multiplier or ratio ("overstates by Nx") without computing it from your own ranges.

## 3. Frequency is not the same as the build-worthy gap
- Name the top complaint by count, and separately the gap worth building, each with its own reason.
- A build gap may rest on structural product facts (what the comparables do not support, platform/store capability, underserved configuration) even when its complaint count is thin; say explicitly which evidence supports which claim.
- A theme below the stated evidence threshold is not a feature argument — but say what structural fact, if any, stands behind it instead of discarding it silently.
- List the themes you are not acting on and the concrete data (owner-vs-non-owner rates, refund rates, regional sales) that would firm each up.

## 4. Source tiers and second-hand evidence
- Rank sources: official store/publisher listing > store tracker/snapshot > aggregator > blog/news/undated.
- A verdict that a figure is "false" needs the official listing or two independent sources of different tiers; one tier alone supports only "unverified". If you could not reach an official source, say so.
- Second-hand items (a survey relayed by a blog, undated figures, "likely"/"rumoured" claims) are labelled second-hand and declared unusable for quantitative estimates — never folded in as a corroborating cross-check.
- Every external claim carries URL and date; every internal capture carries its file and capture date.

## 5. Money labelling
- Any revenue figure in a recommendation shows gross AND net after the store fee (state the fee %), both labelled ESTIMATE; observed figures labelled OBSERVED. Sweep the draft: no unlabelled dollar figure survives.

## 6. Truncation-safe assembly
- First write a skeleton with every required section and a one-line answer each; then fill it in.
- Long deliverables go to files (the required filename is the entry point; add an index if several), one tool call per file; the final reply names the files and stays short. Never emit a long full report in a single reply.

## 7. Final bar check
Re-read the task's numbered asks and format constraints one by one (word limits, "in the first line", URLs with dates, per-candidate regional statements, named settling data) and confirm each is visibly answered in the draft before sending.
