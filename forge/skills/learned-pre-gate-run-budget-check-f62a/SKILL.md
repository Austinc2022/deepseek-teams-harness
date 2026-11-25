---
name: learned-pre-gate-run-budget-check-f62a
description: Before you let any ticket report a proposal (game or not), or when a gate result arrives for a ticket that was not meant to go to the gate.
---

# Pre-gate run-budget check

The gate allows only 2 runs a day (charter.gate.maxProposalsPerCycle), and a wasted run can cost a game its day. Do these checks before any proposal is allowed, and whenever a gate result arrives that nobody planned.

1. **Find out how runs are counted. Read the code; don't trust memory.**
   - Grep `plugins/super-agent/lib` for `.gates`. On 2026-11-24, `super.js` #gate incremented `store.day(x).gates` before the static checks, and nothing ever decremented it. That means any non-empty `proposal` in a worker report uses a run, even one that fails on missing files in under a second.
   - Re-check this every time, because a harness repair may have changed it.
2. **Find out when the gate day rolls over.**
   - `store.js` `today()` uses the host's local date, not UTC. Work out the rollover in UTC (on the Sydney host it was 13:00Z).
   - A run wasted within an hour of rollover usually costs nothing. Say so instead of escalating.
3. **Check the auditor's limits against what audits actually need.**
   - Read `forge/agents/vr-auditor.yaml` maxTurns.
   - Past audits needed 35-44 turns to score. A 30-turn cap can end an audit with no score, and that run may still count.
   - If the owner has decided a limit, check that the decision is actually in the file. If it is not, file `repair_harness` with file:line evidence, and tell the engineer not to touch node_modules (earlier repairs were refused for that).
4. **Keep proposals off non-game tickets.**
   - Kits, tools, spikes and hero-frame tickets must say "do not propose to the gate; leave the proposal field empty."
   - If a worker fills it anyway, `report_gap` them (category instructions) with the ticket id and the gate line.
   - Rate the work on its merits, minus the wasted run.
5. **Before the one real gate run of a game:**
   - The frozen folder has README.md, GAME.md, package.json and an entry (index.html, src/index.html or public/index.html) at its top level, not in a subfolder.
   - The critique panel shows nothing must-fix.
   - The run counter for the current local day has a slot left.
   - The auditor limit fits the audit.
6. **Record what you measured.** Save a knowledge fact with file:line, and add a plan item tied to the next gate run ("confirm repair X landed, else open risk").

## Mistakes to avoid
- Treating a static-check gate failure on a kit as harmless without checking the run counter.
- Assuming an owner decision about the gate is live because it was answered.
- Writing "no gate proposal" in the brief without spelling out "leave the proposal field empty".
- Escalating a wasted run that the rollover makes free.
