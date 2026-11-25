---
name: learned-report-time-failing-control-pr-0610
description: When a ticket demands a failing control for every fix/feature row and the fixes are already shipped: produce the red quotes at report time instead of hand-paraphrasing.
---

1. For every fix row, disable the fix with an EXACT string swap in the shipped file (one unique pattern; assert count==1 in the patch script), run the exact test command that proves the fix, capture the raw output to a log, then restore the file byte-for-byte and verify (diff against a .bak copy or checksum).
2. Run all two-sided in-file controls (test bodies that PASS only when they prove the contract rejects the old behaviour) at the same time, verbosely.
3. Copy every raw output into one evidence log (e.g. evidence/control-log.md) with a method header that discloses the swap technique and any mishaps; delete the scratch copies only after verifying the log contains each row (grep the row labels).
4. Gotcha: when the swapped line sits inside a single-line `if (...) { ... } else ...`, do NOT replace a mid-line statement with a `//` comment — it comments out the closing brace and breaks parsing ("Tests no tests"). Use a block comment `/*CONTROL: ...*/` instead.
5. If a swap choice stays green (e.g. loosening a threshold the tests do not bind), pick a different swap that the suite actually detects (e.g. collapse a data range so the generator throws) and quote the suite-level red honestly.
6. Quote reds verbatim in the checkpoint/leader table — a paraphrased control is a disqualifier.
