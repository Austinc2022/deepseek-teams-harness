---
name: vr-super-worker-playbook
description: "What vr-super-worker has learned from its own work: what to do, what to avoid, and methods that worked. Read it before starting."
---
<!-- written by code from after-action reviews; 4 lessons; updated 2026-11-24T14:53:33.539Z -->

# vr-super-worker: playbook

## Do
- Schedule the real-browser smoke on the first unit-green build, not as a final gate. It is the only check that sees Web-API receiver bugs (Chrome brand-checks window.setInterval & co. to Window; Node does not, so unit suites stay green), and running it mid-build converts a crash class into one extra edit instead of a late failed delivery. The how-to (cached chrome-headless-shell, PW_EXE, one page p

## Avoid
- (nothing yet)

## Methods that worked
- Debug game loops and pacing in a headless full-session sim before any browser run: drive the real App/session class with the test suite's fake renderer + mock XR at a fixed timestep until session end, dump the game's capture object, and run two seeded bots (a perfect bot and a human-ish imperfect one). Fix loop bugs there with regression tests and failing controls, tune cadence until measured sess
- When the base tree (kit, framework, dependency) fails its readiness check mid-build, don't block on it: build base-independent modules in a staging/ folder with their own focused test runs, re-poll the readiness signals after each step, and only once READY copy the base in (excluding node_modules/dist/.npm-cache artifacts) and move staging into it — then run the full suite once at the merge point.
- When working under the free-model chain, checkpoint the deliverable to disk at the earliest possible moment (first outline, first section, first test file) rather than composing everything in-context and writing once — the chain dies wholesale on 429/502 with all candidates rate-limited, so a run killed mid-work otherwise leaves literally nothing. Even this no-work run shows the failure mode: ever
