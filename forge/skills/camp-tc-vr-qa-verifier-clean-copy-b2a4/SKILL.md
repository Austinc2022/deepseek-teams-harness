---
name: camp-tc-vr-qa-verifier-clean-copy-b2a4
description: Verifying a delivered bundle against release criteria (build/test from a clean copy, gate-feature scope, i18n, drafts, no-outreach rules).
---

1. Inventory the delivered bundle first (ls + find) so the report can state exactly what is absent; never invent missing source/locales.
2. Copy ONLY the delivered files into a brand-new empty subfolder (e.g. clean-copy/); do not reuse the fixture folder.
3. Run `npm run build` and `npm test` inside that folder, appending `; echo "EXIT CODE: $?"` to capture exit status verbatim. Note: `cd` persists across Bash calls here — if a call fails with "no such file or directory: clean-copy", you are already inside it; run npm directly or use absolute paths.
4. Record exact command output (including script echo lines) in the report; quote it verbatim.
5. Check one line per release criterion with a concrete evidence ref (file:line of the fixture doc or command output). Builder self-verification ("verified by builder", same folder) fails any "verified by someone other than the builder" criterion.
6. Watch RELEASE-notes-style docs for hidden violations: extra features beyond the approved gate, machine-translation without native-review marking, "feels smooth" instead of numbers, legal/pricing labelled final instead of drafts, past publishing/outreach, and "owner actions: none".
7. If the test script aborts on the first missing item (e.g. first missing locale), verify by directory listing whether the remaining ones are missing too, and say so.
8. End the report with concrete owner actions and a "reported as observed; no repairs made" line. Keep under 500 words.
