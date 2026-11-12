# Many companies on one computer

One `./dsh web` can run any number of companies. Each company is complete and separate. It has its own:

- CEO, departments, leads, HR, auditor and gate
- agents, teams, super teams and super agents, with their tickets and plans
- memory, knowledge, skills and dreams
- charter, budget, ledger, autopilot and advisory team
- headquarters link and execution targets

Every agent, team and super agent belongs to exactly one company, and no agent can read another company's folder.

## Where companies live

| Company | Folder | Runs in |
|---|---|---|
| The main company (the one you had before) | `forge/` | `./dsh web` itself, as before |
| Every other company | `companies/<id>/` (a complete forge of its own) | its own process: `company-cli serve` on a private `127.0.0.1` port |

`companies/` is git-ignored: it holds each company's runs, memory and state.

Company processes are detached. Restarting `./dsh web` leaves them running, and the next portal takes them over. While the portal runs, it restarts a company that crashed (at most 5 times in 15 minutes, then it stops and shows the error). A restart first ends the agent sessions the crashed process left behind.

## Using it

**Companies** in the sidebar lists every company with what it spent today, what needs you, its open tickets and its decisions. From there you can open, start, stop, restart, rename, archive or read the log of any company, and create new ones.

To create a company, choose:

- **Name and id.** The id is the folder name and the address.
- **Profile.** `generic`, `vr-studio` or `quant`. `quant` drives the one quant engine in `quant/`, so only one company may use it, and the main company already does.
- **Models.** Claude Opus 5.5 for every agent (the default, like the main company), or the profile's own mix.
- **Mission, daily budget and autopilot.**

Setup takes a few seconds and makes no model calls. Once the company starts, its CEO begins planning straight away.

Every company page (desk, dashboard, knowledge, advisory, connections) has a **Company** switcher at the top. The sidebar pages follow the company you pick. The main company's pages are at `/company/` and the others at `/company/c/<id>/`, behind the same portal login.

**Stop** ends the company's server and every agent session it started. **Archive** stops it and moves its folder to `companies/.archive/`. Nothing is deleted.

## Command line

```sh
./company-cli --company northwind status
./super-cli   --company northwind say "Focus on the CLI first"
./forge-cli   --company northwind ...
./company-cli --company northwind charter '{"budget":{"dailyUsd":10}}'
```

Without `--company` the CLIs work on the main company, as before.

## Isolation

- **Folders.** Each company's state is its own forge home. Nothing is shared except the code, the Claude login (`.dsh-home`) and the repository's skills, which are copied into a new company when it is created. Skills the main company made itself are not copied.
- **Reading.** Every agent run gets read-deny rules for the other companies' folders: the main company may not read `companies/`, and a company may not read `forge/` or another company's folder. Sandboxed builders also get them in the sandbox's `denyRead`. The rules are added when each run starts, so agents saved earlier and companies created later are covered too (`plugins/agent-forge/lib/isolation.js`).
- **Processes.** Each company has its own super agent loop, autopilot, budget check and loop lock.
- **Headquarters.** Each company joins a group headquarters on its own, from its own Connections page, with its own authority setting (docs/GROUP.md).

## Limits

- The portal's other pages (Agent Forge, Super Teams, the CLI workbench and the project board) show the main company only. Other companies are run through their own desk, dashboard, CEO and CLIs.
- Renaming a company changes its name on the pages after a restart. Agents keep their old role text until you run `./company-cli --company <id> setup --refresh-agents`.
- All companies share one Claude subscription and its usage limits. Each company's daily budget applies to that company only. The Companies page shows the totals.

Code: `plugins/company/lib/fleet.js` (create, start, stop, adopt, proxy) and `plugins/company-dashboard` (the routes, the Companies page, `ui/switcher.js`).
