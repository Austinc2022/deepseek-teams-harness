---
name: camp-one-command-reproducible-bui-441d
description: When creating or repairing the build/ entry point: a one-command build that produces the store artifact from a clean checkout, with a version file and artifact verification.
---

When: you must create or fix the `build/` entry point — one command that turns the repo into a shippable store artifact.

1. **Read the project first.** Inspect `package.json` (or equivalent) for the real build script, output dir and node/toolchain version. Never invent build steps; wrap what exists.
2. **Define the artifact contract up front.** Name it `<name>-<version>.<ext>` (e.g. `braidsong-1.2.0.zip`), fixed output dir (`build/out/`), and a single source of truth for the version: `version.json` (or `VERSION`) at repo root holding `{"version": "x.y.z", "build": N}`. Every other file (manifest, package.json, changelog) is derived from it — never bumped independently.
3. **Write `build/build.sh` (or `make release`) that, in order:**
   - fails fast if the git tree is dirty or `node_modules` is missing (use `npm ci`, never `npm install`);
   - reads the version from `version.json` and fails if the artifact for that version already exists (no silent overwrite);
   - runs the lint/test/smoke gates that exist (do not skip tests to make a build green);
   - runs the project's build into a clean `build/out/` (delete stale output first);
   - packages the artifact, writes a `SHA256SUMS` line, and prints a summary: version, artifact path, size, checksum.
4. **Verify the artifact, not just the exit code.** Unzip/inspect it and check: entry HTML present; every referenced JS/CSS/asset file exists in the package (grep the HTML/JS for relative paths and confirm each); no dev files leaked (`node_modules`, `.map` unless intended, `.git`, test dirs); total size under any store budget.
5. **Run the build twice** from a clean checkout state and compare checksums (or, if not byte-identical, confirm only timestamps differ). A build that only works in your current shell state is not done.
6. **Handover checklist:** one command named and documented at the top of `build/README.md`; `version.json` current; `release-checklist.md` updated with what this build covers; artifact + checksum path listed; known gaps (untested store step, missing screenshot) stated explicitly.

**Common mistakes:** bumping the version in two places so they drift; `npm install` instead of `npm ci`; packaging from the source tree instead of the build output; claiming 'build passes' from exit code 0 without inspecting the artifact; hiding failing tests behind `--no-verify`.
