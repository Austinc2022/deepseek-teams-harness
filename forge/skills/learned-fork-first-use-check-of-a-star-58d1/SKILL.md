---
name: learned-fork-first-use-check-of-a-star-58d1
description: When a kit, template or starter-tree ticket is delivered and other game tickets will fork it, before you freeze it as the base, and whenever you spec a new hygiene or forbid-path row for that tree.
---

A starter tree can pass all of its own rows and still hand every fork a red on the fork's first run. The builder usually runs hygiene LAST and cleans by hand, so the kit's own logs look clean. Check the path a consumer actually takes.

## Steps
1. **Read the kit's own summary lines from disk, not from the report.** Read the suite summary (`Test Files N passed` / `Tests N passed`), each freeze row, the gate-lite summary and the evidence JSON fields the report names (status, the hero-beat type flags, geometry lists, framing numbers). Compare each number with the report. Note the run id and timestamp of each evidence file.
2. **Find the fork proof logs.** Look for: fork command, then the README's first smoke, then gate-lite and freeze rows on the fork. Read every FAIL line on the fork after its first smoke. Planted reds are expected. Any OTHER FAIL that appears on an unplanted fresh fork is a kit defect every game inherits. One example: a scratch-hygiene row fails because the smoke tool itself wrote `scratch/smoke-out.json`.
3. **Grep the writers of every forbidden path.** For each hygiene row that forbids a path (scratch/, root files, evidence count), grep tools/ for `writeFileSync|mkdirSync|>` into that path. If a tool the README tells users to run writes there, the row will fail after normal use. The kit passed only because someone deleted the file by hand. Record it as a defect, even if the kit's final row is green.
4. **Check what the fork copies against the caps.** Read the fork tool's exclude list. Then count:
   - kit-only material that gets copied: the kit's logs/, its change history, its run artifacts;
   - the fork's file count against the file-count caps in config.
   If the headroom is under about 40 files, a game FAILs the cap row on its first real feature, or has to raise its own cap, which an auditor will flag. Kit logs inside a game tree are also foreign evidence.
5. **Check exit-code consistency.** In kit mode, rows the kit reports by design (REPORTED) must give the same verdict in every tool. If freeze exits 1 with 0 FAIL rows while gate-lite passes the same rows, an auditor reads it as a failure.
6. **Check the NOT LANDED list.** Each cut item must give a measured reason (grep counts, missing logs, missing START lines), not intent.
7. **Decide.** If steps 1 and 6 hold, freeze the tree as the base. Steps 2-5 are defects every fork inherits. Put them in the next kit version, each with a red taken from the fork's first-use sequence. Record them as a measured knowledge fact so the threads working on live forks see them.

## When you write the spec for a hygiene row
- List every writer to the path in the same spec. Either move them (a work dir outside the shipped tree) or allowlist their output. A forbid row without its writers is a trap you set yourself.
- Require the red from the consumer's path (fork, then first smoke, then the row), not from a planted file alone.
- Cap the kit's growth: file count net-neutral per version, or the lean-kit thesis erodes and forks lose headroom.

## Common mistakes
- Accepting 'scratch holds base/ only' when it was measured right after a manual cleanup.
- Reading only the kit-mode rows: mode-keyed rows behave differently in game mode.
- Copying cited logs into the tree to satisfy a cite-drift row, which then bloats every fork.
- Re-running tools during the check. Read only: a re-run rewrites the evidence and the scratch.
