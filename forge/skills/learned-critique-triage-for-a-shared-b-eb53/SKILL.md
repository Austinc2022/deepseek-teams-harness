---
name: learned-critique-triage-for-a-shared-b-eb53
description: When a critique panel reports must-fix items on a starter kit or any base tree that other in-flight tickets were forked from, and you have to decide what goes where.
---

## Goal
Turn a panel's must-fix list into correct, scoped orders for (a) the base's next-version ticket and (b) every ticket already forked from the base. Do not trust the panel's counts or remedies blindly.

## Steps
1. **Void empty critics first.** If a critic's fields read 'placeholder', are blank, or repeat a template, its score and must-fix items are void. Recount: the real lowest score and the real must-fix count exclude it. Rate it low, and file report_gap with the rule "return NO VERDICT with no score instead of a default". The root cause stays argued until a transcript shows it (it may be an output-limit truncation).
2. **Check each must-fix on disk in the base tree** with one grep per claim (file:line, the exact string, the missing assertion). Label each one measured (read in the source) or not reproduced. No runtime repro means you say "read in the source", not "reproduced".
3. **Check the remedy, not just the finding.** Before ordering a fix, grep for side effects. Example: "add word X to the banned-vocab lint" breaks the build if X is used as a technical term in comments; scope the lint to player-facing strings (showCard args, index.html text). A remedy that tightens an acceptance or gate row goes to the backlog if the ticket brief protects those rows.
4. **Find the overlap with already-ordered items.** A finding the next-version ticket already covers needs no new order; at most add an extra assertion.
5. **Check inheritance.** Grep the same file:line in every tree forked from the base (running game tickets). For each confirmed hit, send that ticket a short message: the line, the one-line fix, the test plus failing control, and WHERE in its turn order it lands (after hygiene, before the source freeze, and never at the cost of evidence). Keep it to 2-3 items. Optional polish goes to the next turn.
6. **Order the base ticket's addendum.** New items come AFTER the brief's existing order. Use the same proof rule (test + quoted failing control + a CHANGES row + a checkpoint line). Explicitly OVERRIDE any brief line the new item contradicts (e.g. "leave GAME.md as it is"). Name the not-in-scope items as a backlog, so the worker does not spend the turn on them. Ask for a list of unlanded items, which go to a follow-up turn.
7. **Rate each critic** by how many findings checked out and whether its remedies were safe. Record one measured fact listing the defects confirmed in which trees.
8. **Add a plan item** for the disk check of the next version, listing exactly what to look for, so the check is ready when it reports.

## Mistakes to avoid
- Counting a phantom must-fix from an empty critic toward "N must-fix".
- Ordering "delete scratch/" without checking it: a kit's scratch/base may be the hash-identity base that gate tooling reads.
- Overloading a game's last build turn with kit fixes. Position them, and give them a fallback turn.
- Forwarding a critic's remedy word for word when it would break technical text or a protected row.
