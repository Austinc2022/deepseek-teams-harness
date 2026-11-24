---
name: learned-webxr-lifecycle-test-stack-d02a
description: When you need to prove a WebXR/Three.js app survives enter → end → re-enter of an immersive-vr session, in a real browser or in vitest.
---

Two-layer stack, always in this order.

1. Unit layer first (catches the crash class before you ever touch a browser). Drive the REAL App class in vitest with tests/fake-env.js: installEnv() + fakeRenderer() + mockXR() + MockSession. MockSession.end() dispatches 'end' asynchronously after the promise resolves. Assert: after exit, gate.state === 'ready', isPresenting false, camera restored, and a SECOND requestSession resolves to a NEW session (sessions are not reusable — a stale session is an InvalidStateError). This is where xr.js sessionEnded's undeclared `title` ReferenceError shows up: it crashes on every session end, so the test fails on the unfixed src and passes after the fix. Keep the test ≤90 lines.

2. Browser layer (real headless Chromium + IWER). Install iwer (2.8.0 is vendored here), build the app in evidence mode (VITE_EVIDENCE=1, keeps window.__kit and the IWER runtime via ?iwer=hands), serve it, then Playwright:
   - page.goto, wait for #btn-vr to be visible (gate.check() must resolve 'ready')
   - click #btn-vr (user gesture is required for requestSession)
   - xr.waitForFrames(60) → assert ≥60 frames, sessionMode === 'immersive-vr'
   - click #btn-desk or call session.end() → wait for 'end' event, assert sessionMode() === null and the title DOM is visible again
   - click #btn-vr again → assert a NEW sessionId, waitForFrames, end again → assert null
   - xr.screenshot(desktop.png) → assert non-blank, record sha256
   - Collect console errors, page errors, failed requests, external requests → 0 each.

Gotchas measured from the vendored iwer 2.8.0 source:
- XRSystem.requestSession rejects with InvalidStateError if an active session already exists; you must end before re-entering.
- session.end() returns a promise that resolves BEFORE the 'end' event fires. Await the promise, then wait on the event.
- three.js WebXRManager.setSession registers its OWN 'end' listener first, so renderer.xr.isPresenting is already false when the app's sessionEnded handler runs. Do not rely on isPresenting being true inside that handler.
- IWER installRuntime({forceInstall:true}) overwrites navigator.xr; it also patches navigator.userAgent and WebGL makeXRCompatible. Call it before the app boots.
- Headless Chromium has no GPU; pass --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader to launch args, or the page errors out. Check the sandbox CDN allowlist first — Playwright browser installs are often blocked.
- The sandbox here has NO Chromium binaries (node_modules/.local-browsers is empty) and blocks cdn.playwright.dev + storage.googleapis.com, so step 2 cannot run without an owner allowlist. Say so in the evidence's Open risks rather than claiming a browser run that did not happen.
