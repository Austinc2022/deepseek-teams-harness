# Growth: agents that get better, not only busier

`plugins/super-agent/lib/growth.js`, wired into the super agent loop (`super.js`) and the company leaders
(`company-leaders.js`). Memory and the company knowledge store are a separate piece (`docs` of the
memory-knowledge work); this piece is about skills, checks, persistence and learning.

## Why

Measured before this change (20 tickets, 10 initiatives):

| | Before |
|---|---|
| Tickets marked "ready" after one turn | 15 of 20, with no independent check |
| Tickets critiqued | 0 of 20 |
| Initiatives killed | 8 of 10, 6 of them after one cycle |
| Agents that could search the web | 4 of 21; workers none |
| Skills downloaded | 1; none ever written from experience |
| Reviews that said anything about the agent's capability | none |

The rules said "a cheap no is a good result", the research skill only taught falsification, and the quality
skills (masterwork-standard, grand-scale-orchestration, executive-judgment) were given to no quant agent.

## The loops

**Rules and skills.** "A first no starts a search" replaces the cheap-no rule (in the profiles and, once, in the
existing agent files). Every leader gets relentless-solver and the three quality skills; workers and analysts get
relentless-solver. Super teams review up to 4 rounds.

**Know-how.** The Skill Scout (`<prefix>skill-scout`, web search) finds installed skills that fit, at most two
GitHub skills (installed through the auditor), and a methods brief for the exact problem. It runs:

| When | How |
|---|---|
| Start of new or hard work | `open_ticket` with `research: true`, or a principal ticket; the ticket waits for the brief |
| Trouble | a blocked or failed report, two turns without delivery, two failed checks |
| On request | `request_know_how` (every leader), `needKnowHow` (a worker's report) |
| Before giving up | inside the rescue challenge |
| A review names a missing skill | remedy `search-skill` |

The brief goes to the ticket's `KNOW-HOW.md`; skills are attached to the agent's next runs as trials.

**Checks before done.** A worker's "ready" goes to the ticket verifier (`<prefix>ticket-verifier`, a stateless
judge with the worker's sandbox and no edit tools). It checks every done-when condition in the folder. A failure
goes back to the worker with the must-fix list; after three failures the leader decides (new route, `accept_ticket`,
or stop). Principal and gate-bound tickets also go to the critique panel.

**Capability gaps.** The verifier, every critic and every leader (`report_gap`) name who fell short, in what
(method, knowledge, instructions, model, tools, staffing) and the remedy. Code applies it for the next task: a
skill on trial, a know-how search, the strongest model. The same gap twice in a week goes to the coach (the People
head, else the CEO), who can change the agent with `update_agent` or get a skill. Every change is scored against the
agent's work before it and rolled back automatically when quality falls.

**Struggling tickets.** From the third turn without delivery the worker runs on the strongest model at maximum
effort with a "fresh eyes" brief (list distinct approaches, do not repeat what failed). At the turn limit the host
runs a rescue (know-how search, 4 more turns) before it stops a ticket.

**Giving up.** `stop_ticket`, `reply_owner` with `cannot-finish`, the COO's kill and a department's "killed"
recommendation need three distinct approaches (`attempts`), then a rescue challenge: the Skill Scout searches and the
red team argues for the best routes. The leader proceeds only by repeating the call with the challenge id after
reading it. Duplicates, superseded work, the owner's request and out-of-scope work are exempt.

**Learning.** After notable work (more than one turn, a failed check, a stop, principal work) the Skill Smith
(`<prefix>skill-smith`) writes lessons. They go to the company knowledge store (kind `lesson`, tier `agent`), to
the agent's role memory, and to the agent's playbook skill (`<agent>-playbook`: Do, Avoid, Methods, most-repeated
first), which is attached to every run of that agent. The same lesson again is counted, not duplicated; a lesson
seen twice, a proven method (`skillCandidate` from work that passed its check first time), or a proposal
(`propose_skill_update`, a worker's `proposeSkill`) becomes a shared skill (`<prefix>own-*`), audited, versioned
(old versions in `forge/super-agent/backup/skills/`) and trialled.

**Trials.** A new skill is attached per run for three scored uses (verifier pass = 1, fail = 0.3, critique mean).
It is kept (added to the agent's definition) when it scores at least the agent's baseline, retired otherwise.

## Limits (settings.growth)

`verify`, `learning`, `critiqueImportant` (on by default), `maxKnowHowPerDay` 40, `maxInstallsPerDay` 15,
`maxSmithPerDay` 8, `maxReviewsPerDay` 40; `maxSkillsPerDay` 15. Coaching is capped at 12 a day. Budget holds stop
all of it like any other work.

## Where to see it

The dashboard's **Quality and learning** panel: first-try check rate, critique coverage, know-how searches, skills on
trial, kept and retired, lessons and playbooks, skills written here, capability gaps, coaching changes with before
and after scores, rescue challenges. Each agent's page shows its scores over time, gaps, trials, changes and lessons.
State is in `forge/super-agent/growth.json`.
