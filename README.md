# DeepSeek Harness + Agent Forge (on your Claude subscription)

This folder contains a local install of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(`dsh` 0.2.1-rc.5) and two local plugins:

| Plugin | What it does |
|---|---|
| `plugins/claude-code-bridge` | Serves every harness model call through **genuine Claude Code sessions** on your local Claude Code login (your subscription). It adds the `claude-code` provider (opus / sonnet / haiku) and makes it the default model. |
| `plugins/agent-forge` | **Configurable agents, teams, orchestrations and multi-agent chat**, with `forge_*` tools for the harness lead agent, a standalone console and a CLI. |
| `plugins/agent-forge-web` | Puts Agent Forge **inside the DSH web UI**: four sidebar pages (Agent chat, Agents, Agent teams, Workflows) served from `/forge/` on the DSH web server, behind the DSH login. |

DSH's own **Agent Teams** bundle is also enabled in the `web` profile (`spawn_teammate`, a shared task board, and a team UI).

## Start

```bash
./dsh web                 # Web UI → prints http://127.0.0.1:3080/?token=...
                          #   also starts the bridge (127.0.0.1:3099) and the Agent Forge console (127.0.0.1:3091)
./dsh headless "task"     # one-shot task in the terminal
./forge-cli serve         # Agent Forge console without the harness
```

In the Web UI sidebar you get four Agent Forge pages:

| Page | What you do there |
|---|---|
| **Agent chat** | Group chat with any agents you pick (or a whole team). Reply modes: `sequential` (each agent replies in turn and sees earlier replies), `parallel` (all at once), `mention` (only `@name`d agents reply). An agent that writes `@other-agent` hands the floor to it, up to the room's hand-off limit. |
| **Agents** | Create, edit, clone, delete and test-run agents (model, effort, memory, skills, sub-agents, permission, host/sandbox/container/VM). Skills tab: install from GitHub or a folder. |
| **Agent teams** | Group agents into teams, start a chat with a team, or start a new workflow from a team. |
| **Workflows** | Visual stage builder (single or parallel agents per stage) or code orchestrations; run them and watch live progress, per-agent transcripts and results on the Runs tab. |

The same console also runs standalone at `http://127.0.0.1:3091/?token=$(cat forge/.cache/console-token)` (or `./forge-cli serve`).
DSH's own **Agent Teams** feature (`spawn_teammate`) shows up as a team button in a chat's header once the lead agent has spawned teammates; ask it to, for example, *"Spawn a reviewer teammate and a tester teammate for this task"*.

All state stays in this folder: `.dsh-home/` holds harness profiles and sessions, and `forge/` holds agents, memory and runs.
Node 24 is installed in `~/.local/node`, and the launchers add it to `PATH` automatically.

## Agent Forge concepts

```
forge/
  agents/<name>.yaml           one file per agent (edit by hand, in the console, or via the lead agent)
  teams/<name>.yaml            named groups of agents
  orchestrations/<name>.js     code orchestrations (loops, branching, structured output)
  orchestrations/<name>.yaml   declarative stage pipelines (what the console's visual builder makes)
  skills/<name>/SKILL.md       skill library; agents select skills by name
  memory/                      per-agent / per-team / global memory
  runs/<id>/                   run.json, per-agent transcripts, artifacts/
  reports/news, reports/security
```

### Agent configuration

```yaml
name: vuln-hunter
description: Audits a source tree for vulnerabilities
role: |                       # appended to the Claude Code system prompt
  ...
backend: claude-code          # claude-code (default, Agent SDK) | claude-cli | codex | opencode (your local CLI) | dsh (dsh headless, e.g. a DeepSeek model)
model: opus                   # opus | sonnet | haiku | full model id
effort: high                  # low | medium | high | xhigh | max
permission: allow             # allow (default) | acceptEdits | auto | plan | deny
tools: default                # all Claude Code tools, or a list: [Read, Grep, Glob, Bash, WebSearch, WebFetch]
skills: [vuln-hunting]        # only these skills are visible (builtinSkills: true to also allow Claude Code's bundled skills)
subagents: [coder]            # other forge agents exposed as native Claude Code Task sub-agents
memory:
  mode: markdown              # none (stateless) | markdown | journal | hybrid | session
  scope: team                 # agent | team | global
  namespace: vuln-patterns    # optional shared memory namespace
execution:
  mode: sandbox               # host | sandbox | container | vm
  allowedDomains: [example.org]   # sandbox network allowlist additions
  # container: image: agent-forge-claude:latest   (build: docker build -t agent-forge-claude plugins/agent-forge/container)
  # vm:        command: [ssh, -T, devbox]          (or [limactl, shell, default])
maxTurns: 80
mcpServers: {}                # passed through to Claude Code
disallowedTools: [WebSearch, mcp__github__delete_repository]   # always blocked
mcp: [github, playwright]     # servers from the shared MCP library (forge/mcp/<name>.yaml)
externalMcp: false            # true = also load .mcp.json, your Claude Code MCP config and claude.ai connectors
fallbackModel: sonnet
maxBudgetUsd: 5
settingSources: [project]     # project | local | user Claude Code settings to load
env: { MY_FLAG: "1" }
project: ~/code/my-app        # default working folder (relative paths are relative to forge/)
folders: [~/Documents/specs]  # extra folders the agent may read and write
```

**MCP servers** live in a shared library (Agents page, MCP servers tab, with templates for filesystem, GitHub, Playwright, memory, sequential thinking and Context7, plus a connection test). Each agent ticks the servers it should get; by default an agent sees only those, not your personal Claude Code MCP servers or claude.ai connectors. Put secrets in as `${VAR}` references to the harness environment; literal values are stored in `forge/mcp/` (mode 600) and shown masked in the browser.

Every agent also has its own folder, `forge/agent-homes/<name>/`. Its `files/` subfolder is the agent's content library: reference docs, briefs, examples or data you give it, plus work products it saves. The files are listed in the agent's instructions on every run, and you can browse, upload, edit and delete them on the Agents page under **Folders and files**. Working folder order: the folder a run or chat passes, then `project`, then the agent's own folder. Cloning an agent copies its content library. Sandbox and container modes grant access to all of these folders.

Memory modes:
- `none`: stateless.
- `markdown`: curated notes the agent writes with `memory_save`, `memory_search` and `memory_read`. An index is injected at the start of each run.
- `journal`: every run's task and outcome is appended automatically, and the last entries are injected.
- `hybrid`: markdown and journal together.
- `session`: resumes the agent's previous Claude Code conversation.

Execution modes:
- `host`: runs normally on your Mac.
- `sandbox`: Claude Code's native macOS sandbox. Writes are limited to the working directory and tmp, network is limited to an allowlist, and `~/.ssh` and `~/.aws` are unreadable.
- `container` / `vm`: run Claude Code remotely through Docker or an SSH/Lima prefix. Both need `claude` installed on the remote side and `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) exported. **These two modes are implemented but untested here, because Docker is not installed.**

Clone an agent:
- **Console:** use **Clone** on the Agents tab.
- **Lead agent:** ask for it in chat; it uses the `forge_agent_clone` tool.
- **CLI:** `./forge-cli agent clone code-reviewer perf-reviewer model=sonnet memory.mode=none 'role=Review for performance only'`

Install skills:
- **Console:** Skills tab → Install.
- **CLI:** `./forge-cli skill install github:anthropics/skills/skills/webapp-testing`, or a GitHub tree URL, or a local folder.
- Then add the skill to the agent's `skills:` list.

## Local CLI agents: Claude Code, Codex and OpenCode

Any agent can run through a coding CLI installed on your machine, using that CLI's own login:

| backend | Runs | Log in once with |
|---|---|---|
| `claude-cli` | `claude -p --output-format stream-json` | `claude` (then `/login`) |
| `codex` | `codex exec --json` | `codex login` |
| `opencode` | `opencode run --format json` | `opencode auth login` |

Install them with `npm i -g @anthropic-ai/claude-code @openai/codex opencode-ai`.
Ready-made agents named `claude-cli`, `codex` and `opencode` are in `forge/agents/`.

**Running many at once.** Every reply spawns its own CLI process, so you can:
- open several chats in **Agent chat** and send to all of them without waiting;
- put several CLI agents (or the same one several times) in a room set to `parallel`;
- use CLI agents as parallel stages in a workflow (`FORGE_MAX_PARALLEL`, default 4, caps workflow concurrency).

How agent settings map to each CLI:
- **model**: `opus`/`sonnet`/`haiku` go to Claude. For Codex and OpenCode, use `default` (the CLI's own choice) or an id such as `gpt-5.5` or `provider/model`.
- **effort**: `--effort`, Codex `model_reasoning_effort`, or OpenCode `--variant`.
- **permission**: `allow` skips approvals. `plan`/`deny` run read-only (Codex `-s read-only`, OpenCode plan agent). Codex with `execution.mode: sandbox` uses `-s workspace-write`.
- **memory.mode: session** resumes the CLI's own session.
- **Other settings**: role, memory context and the folder list go into the system prompt. Claude also gets `--add-dir`, MCP servers and tool lists. Forge memory tools (`memory_save` and similar) and skills only apply to the `claude-code` backend.
- **Custom binary**: set `cliPath` on an agent, or `FORGE_CLAUDE_BIN` / `FORGE_CODEX_BIN` / `FORGE_OPENCODE_BIN`.

## The three use cases

| Team | Orchestration | Run it |
|---|---|---|
| `dev-team` | `dev-pipeline`: plan → plan review loop → implementer (with `coder` + `test-writer` sub-agents) → parallel correctness + security review → fix loop → QA (+ fix round) → release prep | `./forge-cli run dev-pipeline task="..." repo=/abs/path/to/repo release=true` |
| `dev-team` | `pr-review` (YAML example): parallel reviews, then QA | `./forge-cli run pr-review repo=/abs/path` |
| `news-scouts` | `world-news`: 10 regional/beat scouts in parallel → verifier → editor. Writes `forge/reports/news/YYYY-MM-DD.md` | `./forge-cli run world-news` |
| `security-hunters` | `security-hunt`: recon of new releases → fetch source → 4 sandboxed hunters per target → triage with local PoC → private advisory drafts in `forge/reports/security/` | `./forge-cli run security-hunt` or `'targets=["https://github.com/o/r@v1.2.3"]'` |

Daily runs (macOS LaunchAgent; turn off with `off`):
```bash
scripts/schedule-daily.sh world-news 07:00
scripts/schedule-daily.sh security-hunt 02:30
```

From the Web UI chat you can also say: *"Run the world-news orchestration"*, *"Clone vuln-hunter as a haiku variant with no memory"*,
or *"Build an orchestration where planner and security-reviewer work in parallel, then implementer"*,
or *"Open a chat with planner and code-reviewer and ask them to debate the caching design"* (`forge_chat_start` / `forge_chat_post` / `forge_chat_read`).
The lead agent uses the `forge_*` tools to do these.

## Notes and limits

- **Subscription usage:** every agent is a real Claude Code session, so runs count against your Claude plan's usage limits. `FORGE_MAX_PARALLEL` (default 4) caps concurrent agents per run.
- **git is not installed** (only the macOS stub exists). Run `xcode-select --install` so the dev agents can use `git diff`, commits and tags.
- **Security team rules:** it analyzes downloaded source and local builds only, inside the sandbox, and writes **private** advisory drafts for coordinated disclosure. Never point it at systems you are not authorized to test.
- **Permissions:** `permission: allow` means agents run without confirmation prompts (Claude Code `bypassPermissions`). Use `sandbox` execution or `acceptEdits` for anything you don't fully trust.
- The bridge listens on 127.0.0.1 only and requires the token in `.dsh-home/claude-bridge-token`. The console requires its own token and rejects foreign Host headers.
- DSH is a developer preview, so expect breaking changes on upgrade. To upgrade: `npm install @deepseek-ai/dsh@<version>` in this folder, then re-pin `@deepseek-ai/dsh-experimental-agent-team-profile@<same version>` with `./dsh plugin --profile web add ...`.
- `deepseek-harness/` is a reference copy of the DSH source and docs (master branch). The running install comes from npm.
