---
name: camp-tc-vr-super-worker-headless-6dee
description: Building a small three.js/WebXR demo that must run headless and report measured frame time, draw calls and scripted fun proxies in results.json.
---

1. npm init -y && npm i three (npm registry only; never a CDN). Serve the repo root so /node_modules/three/build/three.module.js resolves.
2. Resolve Playwright from require.resolve, else scan ~/.npm/_npx/*/node_modules/playwright/index.js. Resolve the browser from ~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell (never download). Launch headless with --no-sandbox --single-process --no-zygote --in-process-gpu --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader — SwiftShader gives real WebGL2 headless on macOS.
3. Expose window.demo with tilt(...)/reset()/state(); collect console errors, page errors and failed requests and FAIL the run on any. Always close browser AND server or node hangs.
4. Measure, never guess: rAF deltas in-page (drop ~60 warm-up frames, need >=120 samples) for frameTimeMs median/p95; renderer.info.render.calls for drawCalls; if WebGL fails, wrap renderer creation in try/catch, expose the exact error string and a scene-graph mesh count as the fallback, never invented timings.
5. Tuning trick: physics constants rarely give a sensible scripted-run outcome on the first try. Write a tiny offline Node replica of the page physics + the smoke driver's command schedule (ramp steps, hold times) and grid-search G/damping/start/slot until the fixed script lands the proxies inside the target window with 10/10 successes; THEN run the browser smoke and report only browser-measured numbers. Keep the sim script as a documented artifact.
6. Derive proxies from raw per-run arrays kept in results.json (e.g. median time-to-slot over successful runs, median reversal count from sign changes of commanded input). Put ALL user-visible strings in strings.json and hydrate even document.title from it — reviewers grep for literals.
7. Re-run the smoke after ANY page edit so results.json matches the final files, and sync README numbers to the final run.
