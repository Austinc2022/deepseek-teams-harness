# Leaders: every level plans ahead and works in parallel

The CEO super agent, the super agents below it, the COO and the department heads are all **leaders**. They share one
engine in `plugins/super-agent/lib/` (`super.js`, `leaders.js`, `company-leaders.js`).

## Why

Measured over 22 hours before this change:

| | Before |
|---|---|
| Time with nothing running | 65% |
| Tickets running at once | at most 2, mostly 0 or 1 |
| CEO turns that started no work | 47 of 61 |
| COO | one batch cycle every 6 hours (31 to 69 minutes), idle the rest |
| Department heads | one directive per cycle, idle between cycles |
| Build requests | 17 waiting, with no one owning the backlog |

Every leader worked one thing at a time and slept until an outside event woke it. Asking an agent or running a
critique blocked a turn for up to 20 minutes, and the daily review told the CEO to open "at most two tickets".

## What every leader has

**A plan the code can act on.** Each to-do item has a stable id, an owner, a status, dependencies (`dependsOn`), a
workstream, and optionally a ready ticket. `plan_items` changes single items; `update_plan` rewrites the plan but keeps
items another thread changed meanwhile. Plans written before this change get ids once.

**Work that starts by itself.** An item with a ready ticket opens it as soon as its dependencies are done, without a
turn. A delivered ticket marks its item done, which unblocks the next items. A ticket that ends otherwise marks its
item blocked and tells the leader.

**Threads.** A leader runs several turns at once, one per thread ("lane"): your messages (`owner`), each workstream
(`ws:<name>`), each initiative for the company leaders (`ini:<id>`), and `main`. Work started in a thread reports back
to the same thread. Up to `maxLanes` threads per leader; your thread may use one turn over `maxEvals`, so your message
never waits behind long work.

**Nothing slow blocks a turn.** Tickets, asks to agents, teams and super teams, critiques, hires, department directives
and gate checks run in the background and come back as events. An agent's answer that arrives within 75 seconds is
returned in the same turn. A second ask to a busy team gets a chat of its own.

**Staying busy.** A leader with free capacity and ready plan items is woken to start them (`capacity`). A leader with
nothing planned and nothing running is asked to plan ahead (`plan-ahead`). Waking again for the same unchanged items
backs off 2x each time, up to 8x.

**Fair worker slots.** `maxWorkers` is shared: every leader with work gets an equal share, and slots a leader leaves
unused go to whoever is waiting.

## The company in continuous mode

`charter.autopilot.mode` is `continuous` (the default) or `cycle` (the original batch).

In continuous mode the COO and every department head run as leaders:

- **COO**: `direct_department` (several departments at once), `set_initiative`, `decide_build` (open the ticket itself,
  forward it to the CEO, or drop it), `hire`, `write_brief`, plus tickets, critiques and asks. Build requests go to the
  COO. The autopilot timer asks the COO for a review and brief instead of starting a batch cycle; the brief is filed
  with the cycle briefs and the CEO is told.
- **Department head**: `run_super_team` and `ask_team`/`ask_agent` in the background, then `report_to_coo` in the
  fixed report form. Code applies the report (`applyReports`, shared with the batch cycle) and sends proposals to the
  gate. Only the gate moves an initiative to the gated stage.

In cycle mode the COO and department leaders are paused and the batch cycle runs as before.

## Limits (settings)

| Setting | Default | Meaning |
|---|---|---|
| `maxWorkers` | 4 | tickets worked at once, shared fairly |
| `maxEvals` | 4 | leader turns at once (+1 for your messages) |
| `maxLanes` | 3 | threads per leader |
| `maxJobs` | 6 | background asks at once |
| `maxTicketsPerDay` | 30 | |
| `maxEvalsPerDay` | 400 | |
| `idleWakeMinutes` | 20 | how often an idle leader with ready items may be woken |
| `planAheadMinutes` | 180 | how often a leader with nothing planned is asked to plan ahead |
| `leaders.company` | true | run the COO and department heads as leaders (with continuous mode) |

Settings saved before this change keep their values but are raised once to at least these defaults. Budget holds,
the daily budget and the reserve still stop all new work.

## Watching it

The dashboard's **Leaders** panel shows, per leader: threads running, plan items ready, doing, blocked and done,
tickets against its fair share, background asks, and how busy it was over 24 hours. The panel's top line shows
company idle time and ready items that have not started. The org chart boxes and the unit pages show the same.
