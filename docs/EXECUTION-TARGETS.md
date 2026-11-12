# Execution targets: where builders run

By default every agent runs on this machine. Builders (the super agent's workers, builder hires and the verifiers) run in the macOS sandbox, and leaders and analysts run unsandboxed and read-only. An **execution target** sends a builder's Claude Code session somewhere else: a VM or another computer over ssh, or a Docker container, either on this machine or on an ssh host.

## Set one up

On the **Connections** page, under **Execution targets**, click **Add a target**, or write `forge/targets/<name>.yaml` yourself:

```yaml
kind: ssh                      # ssh | docker
description: Office build machine, 64 GB
host: devbox                   # an alias from ~/.ssh/config, or user@host
port: 22                       # optional
identityFile: ~/.ssh/id_ed25519   # optional
remoteRoot: ~/agent-forge-work # where work folders are copied on the remote side
claudePath: claude             # the claude CLI there
sync: auto                     # auto: copy the work folder up before each turn and back after it
                               # shared: the same path exists on both sides (a network share); none
fallback: sandbox              # sandbox: run in the local sandbox when the target is down; none: fail
allowAgents: true              # super agents may pick it for a ticket (false: only your own settings use it)
```

For Docker, use `kind: docker` with `image:` (build the bundled one with `docker build -t agent-forge-claude:latest plugins/agent-forge/container`), `runtime: docker | podman`, `network: open | none`, and optionally `ssh: <host>` to run the container on that host instead of here.

**Test** checks four things: the target is reachable, a small folder survives a round trip there and back, a `.env` file stays here, and the claude CLI answers on the remote side.

**Login on the remote side.** Either log in to Claude Code on that machine once, or run `claude setup-token` here and add `CLAUDE_CODE_OAUTH_TOKEN=...` to `.dsh-home/.env`. The token is then sent to each remote session in a private file (mode 600) that is deleted as the session starts. It is never put on a command line. Remote sessions share your subscription's usage limits.

## Who runs where

The most specific setting wins:

1. the ticket's own target (a super agent can choose one in `open_ticket`; `list_org` shows the choices);
2. the agent's own `execution.target`;
3. its team's `execution.target`;
4. its super team's `target`;
5. the company default for builders (`charter.execution.workerTarget`).

Set levels 2 to 5 on the Connections page.

Only sandboxed builders take a target. Leaders, analysts and the advisory team always run here, because they read this company's files. A builder whose inherited target is `host` stays in its sandbox.

## What is copied

With `sync: auto`, only the work folder (the ticket folder) goes to the target, with `rsync --delete`, and comes back after the turn, even when the turn fails. Other folders the session can see here are not copied, and they are dropped from the remote session.

These are never copied: `.env`, `.env.*`, `*.pem`, `*.key`, `*credentials*`, `*-token`, `*.token`, `.ssh/`, `.aws/`, `.gnupg/`, `.dsh-home/`.

## Safety

- **On a remote target**, the session's limits are the remote machine's or the container's. The local sandbox's domain allowlist does not apply there. Use a dedicated VM or container, and `network: none` for Docker when the work needs no network.
- **Targets are yours.** Only the owner creates or edits them (they hold host names and keys). Super agents can only choose among those marked `allowAgents`.
- **Hosts, ports and the remote folder are checked** for shell characters before anything runs.

Code: `plugins/agent-forge/lib/targets.js`, used by `runner.js`; the API is in `plugins/super-agent/lib/connect-http.js`.
