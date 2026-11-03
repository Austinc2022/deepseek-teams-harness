---
name: release-checklist
description: Steps to prepare a release - semver bump, changelog, release notes, local tag; publishing only when explicitly allowed.
---
# Release checklist

1. Confirm the working tree is clean apart from the change being released and tests pass.
2. Choose the semver bump from the changes (breaking → major, feature → minor, fix → patch).
3. Update version files (package.json, pyproject.toml, Cargo.toml, etc.).
4. Update CHANGELOG.md (Keep a Changelog style) with user-facing notes.
5. Write release notes (highlights, breaking changes, upgrade steps).
6. Create a local commit `release: vX.Y.Z` and annotated tag `vX.Y.Z`.
7. Only if the task says `publish: true`: push the tag and publish. Otherwise list the exact
   commands a human should run.
