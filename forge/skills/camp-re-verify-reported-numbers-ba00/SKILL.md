---
name: camp-re-verify-reported-numbers-ba00
description: re-verify-reported-numbers
---

Use before accepting any measured claim in a report you are reviewing (frame times, drift, latency, coverage percentages, fun-proxy scores, voice counts).

## Steps
1. Extract every numeric or measured claim from the deliverable (reports, READMEs, coverage reports, notes).
2. For each claim, find the artefact it came from: a file, command output or run log. A number with no traceable source is marked **unverified** — it is not evidence.
3. From the clean copy, re-run whatever reproduces the claim (smoke test, locale tests, build). Record your own value.
4. Classify each claim: **re-measured (matches)**, **re-measured (mismatch — blocking finding)**, **source-cited only**, or **unverified**. Keep every hedging word ("about", "reportedly", "on N days"); never upgrade a claim's strength when restating it.
5. Known traps: device-only claims (e.g. Quest audio latency) cannot be reproduced in the sandbox — report them as device claims, unverified, and cite any corroborating transcript separately. Micro-numbers (e.g. 1e-14 s drift) are often a rounding or reporting artefact: find the actually measured statistic (late-event counts, max onset error) and report that instead.
6. Deliver a claim table: claim, source path, your measurement, verdict. Any mismatch or unverified number that the report presents as measured is a finding in the review.

## Mistakes to avoid
- Repeating a number from the report as if you measured it.
- Dropping qualifiers when shortening a claim.
- Treating a single agent's assertion as corroboration.
