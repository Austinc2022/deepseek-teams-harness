---
name: learned-evidence-battery-ordering-for-0bfc
description: Whenever a WebXR kit/game ticket must run its final evidence battery (browser session, smoke, freeze) after src edits, or a turn resumes a build whose evidence may be stale vs src.
---

Any src edit voids all browser evidence (freeze row 6 checks evidence newer than newest src), so the whole battery is one atomic sequence, not a per-fix loop:
1. Decide the fix set ONCE (triage open must-fix/should-fix against the cost of one battery). Land all src edits in one batch, each with a failing control: run its test on the edited file (pass), swap the pre-edit file in (fail, quote the exact error).
2. Fast tier once after the batch: one vitest worker (npx vitest run --maxWorkers=1 --no-file-parallelism), then vite build.
3. Archive the previous PASS evidence (cp evidence/session.json scratch/) before any rerun — a failing rerun overwrites PASS artifacts.
4. Launch the definitive real-browser run DETACHED (nohup env PW_EXE=<cached chrome-headless-shell> node tools/session.mjs perfect > scratch/session-perfect.log 2>&1 &). It is the ~11-min wall-clock long pole. While it runs, write the report sections that do not depend on its numbers. Never block a turn on it.
5. Only after the run lands: re-run npm run smoke (its generatedAt must postdate the last src edit too), then npm run freeze, then the PNG negative control (add one unlisted PNG -> freeze must FAIL; delete -> PASS).
6. Do destructive hygiene LAST (delete scratch/regenerable dirs) and run nothing after it: smoke and freeze regenerate scratch output and re-dirty the tree.
7. Write the report in chunks (sections written during step 4's wait), never as one giant final write — a 32k output-token cap has killed a finished build's report before.
Traps: sandbox denies kill/pkill, so a superseded browser run cannot be stopped — only launch the definitive run after final src and ignore its outputs; report drawCalls/triangles (renderer.info / window.__orbStats), never fps under SwiftShader; checkpoint one NOTES line per landed step ending 'Next: <action>' so a dead turn loses nothing.
