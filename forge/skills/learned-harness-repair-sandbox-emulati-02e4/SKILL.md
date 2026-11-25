---
name: learned-harness-repair-sandbox-emulati-02e4
description: When a harness repair's test step is red on tests that pass in a normal shell (or about to be), and you must find why, prove a fix, or decide whether the red tests are fixable by a repair at all — and the real sandbox-exec run cannot be observed because it cannot nest inside a sandboxed ticket.
---

**When to use.** When a harness repair's test step is red on tests that pass in a normal shell — to find why, to prove a fix, or to decide whether the red tests are fixable by a repair at all — and the real `sandbox-exec` run cannot be observed (it cannot nest inside a sandboxed ticket: `sandbox_apply: Operation not permitted`). Rebuild the repair's test environment before touching code: a plain-shell pass proves nothing about what the repair will see.

## Method

1. **Rebuild the repair's worktree.** A repair tests a git worktree of HEAD (repair.js:220-224): tracked files only; gitignored files absent (`forge/company/profile.json`, `forge/agents/vr-*.yaml`, forge runtime data); `node_modules`/`plugins/node_modules` symlinked read-only to the live install (repair.js:226-231), not copied. Keep a pristine copy for diffing. Exclude `.git` and runtime dirs.
2. **Run the repair's exact test loop** (repair.js:279-299): one node process per `plugins/*/test/*.test.{js,mjs}` (skip `node_modules`, `our-free-model`), cwd = the copy, `env -i PATH=<nodedir>:/usr/bin:/bin HOME=<scratch> TMPDIR=<scratch> FORGE_SANDBOX=off AGENT_FORGE_HOME=<scratch>/forge`. A file passes only on exit 0 AND a line `ℹ fail 0` (repair.js:293).
3. **Emulate the exec denial.** The profile denies every exec except node (tools.js:49-62, `exec:false`). Preload a module that makes any other exec fail with `EPERM` **thrown synchronously** — Node throws EPERM synchronously from `spawn`/`execFile`/`execFileSync` (only EACCES/EAGAIN/EMFILE/ENFILE/ENOENT become async errors; `spawnSync` returns `{error}`). An asynchronously-emulated EPERM will not reproduce the failures. Label results "emulated", never "measured in the sandbox".
4. **Validate the emulation against the repair's log first.** On the UNCHANGED copy, the emulated run must reproduce exactly the repair's first-failure per file — the repair logs only the first `✖` per file (repair.js:294) — with per-test durations in the same ballpark as the logged ones. Run the same copy in a plain env too: the plain-vs-emulated delta separates environment failures from real ones.
5. **Classify every red test:** (i) regression, (ii) stale test, (iii) environment (exec denial, missing gitignored data, or both). For (iii), follow the first failing line to the library call. Known shapes: a synchronous throw inside a Promise executor bypassing `allowFail:true`; a test pinned to a value only a gitignored file selects; a test file that itself runs git.
6. **Check PROTECTED and FORBIDDEN before promising any patch** (repair.js:45-47): a repair may not change repair.js, restart-guard.mjs, repair.test.mjs, tools.js, tool-run.mjs, nor node_modules/package.json/secrets/forge runtime data. Gitignored files are absent from the worktree, so a repair cannot patch them — give the owner a one-line hand-edit instead. Changes that loosen the sandbox itself (e.g. permitting git exec) are owner-only and refused by `changeProblems`: ship as a separate "owner applies by hand" patch.
7. **Patch in the copy, then re-verify both envs.** Diffs must apply cleanly (`patch -p1`/`git apply`) to the pristine copy and reproduce the changed copy byte-identically. For each patch record pass/fail per file in plain AND emulated env. Stay within the `changeProblems` limits (25 files / 800 lines).

## Checks that prove it worked

- **Fidelity:** unchanged copy under emulated exec denial reproduces exactly the repair's logged first-failures per file, durations in the same ballpark; the plain run of the same copy fails only the genuinely broken test(s).
- **Failing control per change:** revert each edit (or no-op a new helper) → the named tests FAIL with an error matching the defect; restore → green. A change with only a green run is unproven.
- **Patch applies:** `patch -p1` on the pristine copy yields byte-identical files (`cmp`).
- **Live untouched:** `cmp` of every touched file against pristine = identical; `git status` shows no tracked changes.
- **End state:** all patches together: plain env fully green; emulated env green except tests inside PROTECTED files, named explicitly with the owner patch (or accepted red) that resolves them.
- **Hygiene:** `changeProblems` returns `[]` for each patch and the combination.

## Pitfalls

- **The repair logs only the first `✖` per file** (repair.js:294): one file can hide three failing tests behind a one-failure log. Always run the whole file.
- **EPERM must be thrown synchronously** to match Node; it escapes `allowFail`/`catch` because it throws before the promise settles. An async emulation changes the failure shape and points at the wrong root cause.
- **One file can have two independent environment causes** (exec denial + missing gitignored data). Fixing one leaves it red; don't stop at the first cause.
- **Never copy `node_modules`** (gigabytes): symlink read-only as the repair does, and strip the symlinks before staging (repair.js:229-230). Repairs that run tests have been refused as "touching node_modules" (argued, not reproduced: install/test may rewrite plugin node_modules metadata).
- **A passing emulation is not a sandbox run.** At most check the profile compiles (reaches `sandbox_apply`); everything else is "untested in a real sandbox".
- **Repairs are quota-limited** (4 per UTC day, repair.js:118-119): one repair carrying all patches beats several — but it still cannot fix PROTECTED-file failures; the owner patch must land first, or the remaining red must be accepted.

Reference implementations (ticket kd4e28dbd16): `run-tests.sh` (the repair's exact loop), `exec-deny.mjs` (synchronous EPERM preload), `mkpatch.sh` (repo-root-relative diffs) in `forge/super-agent/work/harness-repair-prep-find-why-3-bd16/`.
