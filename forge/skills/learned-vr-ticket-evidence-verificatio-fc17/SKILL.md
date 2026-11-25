---
name: learned-vr-ticket-evidence-verificatio-fc17
description: Verifying a delivered game/build ticket whose done-when conditions cite test suites, freeze checks, browser evidence JSONs and screenshots, especially when the report claims frozen PASS artifacts.
---

1. Do the guard step first (e.g. SUPERSEDED check on an earlier ticket's folder) before anything else.
2. Re-run the cheap battery yourself in the deliverable folder: npm test, vite build, the freeze check. Never trust reported counts.
3. Prove every "failing control" claim by MUTATION in a scratch copy ($TMPDIR): rsync the tree without node_modules, symlink the real node_modules, revert the claimed fix (or neuter the claimed protection), run the focused test, and confirm it fails with the reported number. Restore nothing — the scratch copy is disposable. Watch the diff direction when counting new lines: `diff kit/file rc/file | grep -c '^>'` counts lines ADDED in rc; swapping args silently undercounts.
4. Prove negative controls both ways (e.g. add an unlisted PNG -> freeze must FAIL on that row; delete -> must PASS again). Create the probe file, verify, delete, verify.
5. Audit evidence JSONs field by field against each numeric done-when clause. Rebuild the provenance chain: recompute the source hash the evidence header claims; confirm request URLs are localhost-only and match the current dist asset; read the run log; check evidence is newer than src.
6. If the ticket hinges on an ~10-min browser run, REPRODUCE IT INDEPENDENTLY in a scratch copy (session tools usually write evidence/ and screenshots/ relative to their own root) and diff the result fields against the delivered artifact. A rerun that matches exactly is the strongest evidence; never rerun in the deliverable folder where a flaky rerun would clobber frozen PASS evidence.
7. Open the screenshots as images: check dimensions from PNG headers AND the content (title lockup, end card buttons) by eye.
8. Re-run simulated claims (bot sims etc.) yourself and label them honestly as simulated vs browser vs device.
9. String-audit the doc deliverable against the ticket's literal mandated labels/wording (deltas often dictate exact phrases) and recompute the ticket's arithmetic (net price, unit counts).
10. Report PASS only when every clause holds; list capability gaps (method/knowledge/instructions/model/tools) with a remedy so the builder improves. Common builder gaps to look for: mandated literal wording drift caught only in recovery; long evidence runs launched before cheap unit tests cover end-of-session paths; simulated evidence used where a real harness already exists; evidence frozen before feature-complete forcing cuts.
