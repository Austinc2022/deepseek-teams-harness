---
name: learned-pre-gate-disk-check-of-a-deliv-7bf2
description: When a game build ticket reports delivered and the next step is a critique pass, a fix message or a gate proposal.
---

# Pre-gate disk check of a delivered game build (COO, read-only)

Goal: before merging a fix message or booking a gate slot, confirm from disk what the report claims, and catch go/no-go failures that critics miss.

## Steps
1. **Read REPORT.md and the NOTES fix-list table.** Use Grep for the row ids (e.g. `^\| ?(X[1-5]|D[1-7]|H[1-2]) `), not a full read. A row id you sent that has no table row counts as NOT DONE.
2. **Code rows: grep the exact symbols at the cited lines.** One Grep over src/ with an alternation of the fixed symbols (e.g. `copyWithin|pointerdown|sessionEnded|presence\.step|pointer\.update`). Then read only the 60-80 lines around the riskiest fix. Confirm that the old defect pattern is gone, not just that a new line exists.
3. **Evidence numbers: grep the JSON keys.** Grep the keys the audit index cites (status, generatedAt, g1*, acts, gameSeconds, maxDrawCalls, maxTriangles, errors, requests). Compare every number in the index and the report against them (go/no-go 11c). Check that generatedAt is newer than the newest src.
4. **Audit index commands (go/no-go 11a).** Read GAME.md lines 1-40. In the Command column, flag any row that runs a browser session, bot run, smoke run or capture (session.mjs, smoke, fullsim, playwright), or anything over 60 s. Each must become a read command (node -e printing keys, sips, grep -n), with 'produced by ...' moved into the Claim cell.
5. **Frozen-copy citations (go/no-go 11b).** Read the freeze-check script's copy line (rsync --exclude ...). Every path cited in the index or GAME.md must survive those excludes. A cited scratch/ file is a NO-GO: it must move to evidence/ with a header, re-run on the current tree if it is stale.
6. **Hygiene.** Glob `rc/{scratch/*,scratch/logs/*,*.md,*.json}`. List any uncited scratch root files, especially names that read as failures (e.g. *fail*.json, *partial*.json). Deletion is the builder's LAST step; nothing runs after it.
7. **Open the PNGs yourself.** Never trust the builder's 'yes' lines. Check:
   - the hero is in-scene, not a DOM menu, and has the lockup;
   - the first-minute shot shows the core loop with the key object reading as the brightest thing;
   - the desktop shot actually contains the player object;
   - no captions are clipped at frame edges;
   - the end card is clean.
8. **Record a measured fact** (knowledge_add) listing confirmed rows, matched numbers and open items with file:line. **Save a memory note** with the drafted fix rows (G1..Gn) and the send rule.
9. **Do not send yet if a critique is running.** Merge critique must-fix and your rows into ONE message. Never split it: the first part resumes the ticket, and later parts miss that turn. Put the evidence-discipline block first and keep the message compact.
10. **Plan:** keep the disk-check item 'doing' until the critique half lands. Marking it done can auto-open a fallback ticket that depends on it.

## Common mistakes
- Accepting 'verified by eye' or 'freeze 13/13' as proof that the index is auditable. The freeze rows do not check index commands or excluded paths.
- Starting a second critique while an automatic one is running. Parallel panels abort critics.
- Booking a gate slot on a clean critique while a go/no-go line still fails.
