---
name: vr-own-ticket-brief-no-gate-proposal-ru
description: "When to use: whenever you write, edit or review a ticket brief whose deliverable is not a game build (harness, tooling, research, spec, kit or patch work). The brief must carry the mandated no-gate-proposal line, because any gate proposal — even one that fails the static check instantly — burns one of the 2 daily gate runs. Game builds are the only tickets allowed to carry a proposal."
---
<!-- written by vr-skill-smith 2026-11-24T13:50:13.679Z: proposed by ceo; audited by vr-auditor: SAFE. The skill is guidance text only (brief-writing discipline for gate proposals) and violates none of the hard rules: no downloaded code is run, no data leaves the company, no orders/spending, and 
...[truncated] -->

# Ticket briefs: no gate proposal from non-game work

## When to use
Whenever you write, edit, or review a ticket brief and the deliverable is anything other than a game build: harness, tooling, research, spec, kit or patch work. A "game build" is a ticket whose deliverable is a playable game — that is the only class allowed to carry a gate proposal.

## Why this rule exists (measured)
- The gate counts a run **before** its static check: `super.js:1289` increments `store.day(x).gates` before `startCustom` (`super.js:1291`), the static file check runs inside the gate, and nothing decrements the counter (re-checked 2026-11-25: no `gates--` / `gates -=` / `gates = 0` anywhere in `plugins/super-agent`). A proposal that fails in under a second still costs one of the charter's 2 runs a day (`charter.gate.maxProposalsPerCycle = 2`, `plugins/company/profiles/vr-studio.js:74`).
- The gate day is the **host's local date** (`store.js:15` `today()` uses `getFullYear/getMonth/getDate`; Sydney host), so the day rolls at 13:00Z, not 00:00Z.
- Live case (fact fafb38c6aac, measured): 2026-11-24 at 13:29Z the harness-prep ticket `kd4e28dbd16` proposed `harness-repair-prep-patches` to the game gate. It failed at once with `required files missing: README.md, GAME.md, package.json; no entry point` and `state.json` `days['2026-11-25'].gates` became 1 (still 1 when re-read 2026-11-25). That left the day-5 game Orbwend with no same-day fallback gate run.

## Method
1. **Classify the deliverable before writing the brief.** Playable game as the deliverable → game build (proposal allowed, once). Anything else — harness, tooling, research, spec, kit, patch, acceptance, analysis → non-game. When in doubt, it is non-game.
2. **If non-game, put this line in the brief verbatim:**
   > No gate proposal from this ticket: it delivers through its report and the verifier only.
   This is the required marker and supersedes looser phrasings ("do not propose to the gate") used in earlier briefs. **Also** state "leave the proposal field empty" in the brief's mechanics: workers have filled the field on briefs that only said "do not propose to the gate" (lesson in `learned-pre-gate-run-budget-check-f62a`). Never paraphrase the mandated line.
3. **Do not add the line to game-build briefs.** Those may carry exactly one proposal, and it must clear the pre-gate checks first: README.md, GAME.md, package.json and an entry point (`index.html`, `src/index.html` or `public/index.html`) at the frozen folder's top level; critique shows no must-fix; a run slot is left for the current local day (see `learned-pre-gate-run-budget-check-f62a`).
4. **If a worker reports a proposal from a non-game ticket anyway:** record the burned slot (`days[local-day].gates` in `forge/super-agent/state.json`); check whether the local day rolled over within the hour (a run just after 13:00Z on the Sydney host costs nothing — say so instead of escalating); `report_gap` the instruction violation (category instructions) with the ticket id and the gate line; rate the work on its merits, minus the wasted run.
5. **Re-read the counting code before relying on it.** Grep `plugins/super-agent/lib` for `.gates` each cycle; a harness repair may have added a refund or moved the increment. If it changed, update this skill's Why and this step.

## Checks that prove it worked
- Grep the brief: the mandated line appears **verbatim** in every non-game brief, and in no game-build brief.
- After the ticket runs, its proposal field is empty in `forge/super-agent/state.json`.
- `days[today's local date].gates` is unchanged by the ticket. If it moved, the line failed — apply step 4.

## Pitfalls
- Paraphrasing the line ("no gate today", "do not propose to the gate") or omitting "leave the proposal field empty". Vague wording is the measured failure mode: the proposal field got filled anyway.
- Treating a static-check failure as free. It is not: the run was counted before the check (`super.js:1289`). The `kd4e28dbd16` proposal burned a slot in under a second and cost Orbwend its fallback run.
- Reasoning about the gate day in UTC. It is the host's local date (Sydney); the day rolls at 13:00Z.
- Letting a "small" patch, kit or research ticket carry a proposal because the work feels game-adjacent. Only a game build as the deliverable earns the proposal.
- Escalating a wasted run that landed just after the local rollover — that slot was resetting anyway.
- Forgetting that a game build's proposal still needs the pre-gate checks. This rule protects gate slots; it does not spend them.
