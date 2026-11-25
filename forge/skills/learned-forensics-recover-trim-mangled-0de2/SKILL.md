---
name: learned-forensics-recover-trim-mangled-0de2
description: A turn arrives to find source files unparseable or half-mangled by a previous lost turn's line-trim/comment-restore tooling, and you must recover without losing landed work.
---

1. Do NOT re-run the mangling tool (e.g. a comment-restorer that already corrupted files once). Reconstruct by hand.
2. Establish the intended content: for each broken file, diff against the frozen baseline (kit original / pre-trim copy in scratch/freeze/verify / git). Separate ACCIDENTAL losses (closing braces, JSDoc openers, helper consts the remaining code references) from DELIBERATE deltas (new behaviour lines, e.g. a D4 position reset or a fixed UI string) by checking what the shipped tests pin. Never re-add symbols the app no longer references (e.g. a dropped noHandT timer).
3. Prove the trim deleted only comments elsewhere: for every file with a faithful pre-trim copy, walk it as a subsequence of the current file (two-pointer match) and classify unmatched lines; deletedNonComment must be 0. For stale verify copies the check cannot decide — rely on the full test suite and say so in the notes.
4. Sanity: `node --check` every file first (cheap), then the full suite. Green suite + parse-clean tree is the recovery gate.
5. Check the line budget LAST with the ticket's own wc -l command; a trim that landed before the crash may have already fixed an over-budget count - report the new number, do not trim again.
6. Record one NOTES checkpoint with the timeline (file mtimes give the lost turn's window), what was rebuilt, what was unrecoverable, and the measured test counts.
