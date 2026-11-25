---
name: learned-recover-a-partial-critique-pan-24b7
description: When a critique reply on a game ticket comes back with fewer than all lenses scored (aborted critics, 'NO VERDICT', score 0) and I am about to turn it into a fix list.
---

## Why
Critique replies often show 2 of 5 verdicts: critics get aborted (about 20 min timeouts), and a score of 0 with 'NO VERDICT: review not started' is no verdict at all. A second panel (an auto-critique or an earlier manual one) is often running or already finished on the same tree, and its critic files are already on disk. If I write the fix list from the trigger alone, I miss real must-fix items. That costs a whole fix pass plus a critique cycle (about 2-4 h), or a gate run. Example: on 11-25 the trigger showed 1 real verdict (business 0.50). The auto-critique run on disk had XR 0.70 with two defects no one had seen: snap turn turned only the sky, and the HUD sat inside the rotating group.

## Steps
1. **Count the real verdicts.** Treat any lens with 'aborted', 'NO VERDICT' or 'review not started' as missing, even if it shows a score of 0. Never average a 0 that is not a verdict.
2. **Find sibling runs on disk.** Grep `forge/runs/*/agents/*critic*` for a phrase unique to this ticket's tree (a file:line, a constant, a distinctive must-fix word). Results come sorted by mtime. Then grep those run folders for `"score"|mustFix` to see which lenses finished. Each critic file ends in a `## Result` JSON block; read only that block (offset/limit), never the whole transcript.
3. **Merge by defect, not by critic.** One row per underlying defect, crediting every critic and my own disk-check item that named it. A defect two lenses name independently is high confidence.
4. **Check each new must-fix in source before sending.** Grep or read the cited file:line on the tree the builder will fork. Drop or rewrite any that do not reproduce. For scene-graph claims, trace the parent chain: what does `world` hold, and what does `anchor` hold?
5. **Check kit spread.** If the defect lives in kit code (comfort, xr, input, hud), grep the sibling game forks for the same wiring before deciding it is game-only or kit-wide. Kit-wide means a kit row plus a port row in each live fork. Game-only means one row and a note.
6. **Look for one cause behind several symptoms.** One structural cause, such as the HUD parented to a rotating group, can explain several by-eye reads, such as 'rolled' and 'skewed text'. Write the structural fix as the row and ask for the measurement (for example rollDeg per shot) that confirms the symptom is gone. Do not write separate symptom fixes.
7. **Send one merged list, then say what is still pending.** Tell the builder an addendum may arrive for lenses still running. Add a plan item: when those lenses land, send ONE addendum with only the must-fix items not already covered. If they abort, send nothing; the next full critique covers them.
8. **Before the gate, the auditor lens must have scored.** A panel where the auditor aborted does not satisfy go/no-go line 11(d). Plan the next critique with all 5 lenses.

## Mistakes to avoid
- Launching a third panel while the auto-critique on the same tree is still running. That doubles cost; wait for its event.
- Taking a critic's file:line on trust. Line numbers drift between trees; verify on the fork's base.
- Rating a critic that never produced a verdict. Rate only the lenses that did, on whether their claims held up in source.
- Folding would-elevate items in as must-fix. Add only the cheap ones (a capture-timing change, a docs line) and mark the rest as stretch at the end of the priority order.
