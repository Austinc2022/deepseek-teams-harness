---
name: vr-harness-engineer-playbook
description: "What vr-harness-engineer has learned from its own work: what to do, what to avoid, and methods that worked. Read it before starting."
---
<!-- written by code from after-action reviews; 12 lessons; updated 2026-11-24T16:03:18.877Z -->

# vr-harness-engineer: playbook

## Do
- Pin every headline measurement to an immutable tree. Run the baseline (and any 'before' number) on a copy that never receives patches (here h0), and state the provenance in line 1 of the artifact ('run on ./h0, the pristine copy; ./h was the baseline copy at step 2 and later received 01+02+03'). If the artifact was measured on a working copy that was later patched, re-run the measurement on the pr
- When a rule decides 'did this run produce a usable result?', make it a disjunction over every shape the producers can emit — found by enumerating the writers of the result object — never a check of one field. Here the first slot rule kept a slot only on checks.audit.score; the quant profile writes confidence and no score (quant.js:118), and passed runs with requireAudit=false have no checks.audit
- When a brief prescribes an exact failing control and the code path cannot be driven as written (private method, needs the whole engine), never drop or silently retarget the control: run the nearest runnable equivalent (revert file A and watch its source-pin test fail; revert the drivable caller and watch its behaviour tests fail), and state in the deliverable which control was substituted and what
- Fix environment-dependent reds (class iii) by hermeticizing the code or test, never by shipping local state or loosening expectations: (a) wrap exec handling so a SYNCHRONOUS EPERM is caught — sandbox denials throw synchronously from execFile (only EACCES/EAGAIN/EMFILE/ENFILE/ENOENT arrive async), and a throw inside the Promise executor escapes allowFail-based rejection handling; (b) when an expec
- Close any prepare-a-change-in-a-copy task with a three-part no-touch proof on the final recheck: git apply --check of every patch against the live target, cmp of each touched file against the pristine copy, and live git status showing no modified tracked files.
- When a test passes on the dev machine but fails on a clean checkout or worktree, diff the environmental inputs before suspecting code — gitignored/untracked config files first, then env vars, git identity/config, timezone. Fix by pinning the input inside the test (env var set before the import, test-local fixture), never by letting the test read more ambient local state.

## Avoid
- After adding a keep/release rule for a scarce resource (daily gate slot, budget, rate limit), audit its two complements before shipping: (1) the path that acquires but never releases — an exception between acquire and settle leaks the slot, test it or declare it; (2) what the resource originally capped — releasing slots on failures can silently uncap the daily limit the slots enforced. Fix (1) you
- Do not verify patches with git apply from inside an enclosing git repo: paths that are not at that repo's root are silently skipped, so a clean-looking apply proves nothing. Verify in a scratch git repo outside the parent repo, apply patches in order and re-run the suite after each; after any fix pass regenerates patches (they grow — patch 02 went 274→334 lines), confirm the untouched patches are

## Methods that worked
- Slot/quota accounting: reserve the slot before the run and settle afterwards; give a refund at most once and floor it at zero. Reserve-first is what keeps concurrent starts under the cap (N+1 started together start N), and refund-once/floor-zero stops a failing run from minting free slots. Test all three edges: the cap under concurrent starts, the single refund, and the floor.
- Treat the shipped artifact as the only record: after any change to a test file, re-run every failing control against that shipped file, stamp the control log with its path and block count, and take test counts from the file at write time. Control runs and counts captured before the file changed do not count — this ticket's control.txt is correctly stamped 'gate-slots.test.mjs (10 test() blocks)' w
- When a decided setting lives in a file your change channel cannot carry (gitignored/untracked like forge/agents/vr-*.yaml, PROTECTED like repair.js, or skipped by the setup step like setup.js:36 skipping existing agents), do not stop at an owner hand-apply note: also set the value at every tracked call site that consumes it — here `overrides: { maxTurns: 50 }` on the gate-audit api call at plugins
- Before fixing red tests that pass in some other environment, classify each one first: (i) regression -> fix code; (ii) stale test -> update the test and cite the deliberate change; (iii) environment -> make the test hermetic. Write the class with a file:line root cause before any patch; the class decides where the fix goes, not the test's topic.
