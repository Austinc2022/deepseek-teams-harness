---
name: vr-ext-agent-team-staffing
description: "Define, review, register, and verify Digital Office agent roles in a portable, public-safe way."
---
<!-- downloaded 2026-11-24T09:26:31.721Z from github.com/digibeing1001/digital-office-agent-system skills/agent-team-staffing/SKILL.md; audited by vr-auditor. This is guidance from the internet: the agent's own hard rules come first. -->

# Agent Team Staffing

Use this skill when a Digital Office deployment needs a new specialist agent, a role change, or a review of the existing agent roster.

## Principles

- Keep public artifacts generic and product-facing. Do not include personal notes, private names, local usernames, absolute machine paths, or internal incident logs.
- Use stable agent IDs for APIs and project rosters. Use generic profile names such as `office-researcher`, `office-planner`, `office-coder`, `office-designer`, and `office-writer`.
- Register every production agent in `agent-system/agents.registry.json`.
- Route agent work through `scripts/agent-router` or the workflow control plane. Do not bypass routing with direct delegation.
- Keep credentials outside the repository. Provider keys must live in environment variables, enterprise secret storage, or an approved secret manager.
- New or changed agents require user-visible review before production activation.

## Workflow

1. Define the role.
   - Identify the job to be done, use cases, non-goals, outputs, and approval boundaries.
   - Decide whether an existing agent can cover the need.
2. Draft the profile.
   - Create or update `profiles/<profile-id>/SOUL.md`.
   - Keep the SOUL portable, no-secret, and free of private deployment records.
   - Use `profiles/<profile-id>/config.yaml` only for non-secret runtime defaults.
3. Update the registry.
   - Add or update the agent entry in `agent-system/agents.registry.json`.
   - Include `display_name`, `portable_role`, `profile`, `model`, `provider`, `memory_policy`, routing keywords, orchestration roles, and route tests.
4. Verify routing.
   - Run `scripts/agent-router --health`.
   - Run representative route prompts through `scripts/agent-router --route-json`.
5. Verify production gates.
   - Run `agent-system/bin/harness-check`.
   - Run the relevant `agent-system/bin/harness-runner` task.
   - Run `agent-system/tests/smoke.sh` before publishing changes.
6. Document the user impact.
   - Update README or GUI contract text when the new role changes what users can do.

## Output Template

When reporting an agent staffing change, include:

- Agent ID and display name
- Profile path
- Main user jobs covered
- Routing examples
- Approval or safety boundaries
- Validation commands run
- Residual risks or follow-up tasks
