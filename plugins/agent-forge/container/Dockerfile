# Image for agents with execution.mode: container.
#   docker build -t agent-forge-claude:latest plugins/agent-forge/container
# Login inside containers uses a long-lived subscription token from `claude setup-token`,
# exported on the host as CLAUDE_CODE_OAUTH_TOKEN (forwarded by the forge runner).
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates python3 build-essential ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code
RUN useradd -m agent
USER agent
ENTRYPOINT []
