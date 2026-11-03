---
name: dev-planning
description: Format and checklist for implementation plans that reviewers can approve and coders can execute without guessing.
---
# Implementation plan format

1. **Goal**: one paragraph; what is done when this ships.
2. **Context found**: relevant files, modules, conventions, existing tests (with paths).
3. **Design**: the approach and why; alternatives rejected in one line each.
4. **Steps**: numbered; each names the exact files to create/modify and the change. Mark
   steps that are independent with `[parallel-group: X]` so they can be split across coders.
5. **Tests**: which tests to add/extend and the commands to run them.
6. **Risks & rollback**: migrations, compatibility, performance, security considerations.
7. **Out of scope**.

Keep it concrete. No placeholder steps such as "update as needed".
