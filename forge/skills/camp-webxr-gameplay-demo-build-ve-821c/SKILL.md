---
name: camp-webxr-gameplay-demo-build-ve-821c
description: Use when building a small runnable HTML5/WebXR gameplay demo in demos/, then producing its README run steps, automated headless smoke-test result, fun-proxy measurements, and a list of what could not be verified without a headset.
---

# WebXR Gameplay Demo: Build & Verify

## Procedure

1. **Scaffold one demo per planned feature.** Create `demos/<feature>/index.html` as a self-contained page (inline CSS/JS or local ES modules). Use the WebXR Device API (or Three.js + WebXR) with an explicit non-XR desktop fallback so it also runs in a plain browser. Keep assets local or version-pinned CDN; no build step required to run.
2. **Serve on a secure context.** WebXR needs `localhost` or HTTPS. Write `demos/<feature>/README.md` with exact copy-paste run steps (e.g. `python3 -m http.server 8000` then open `http://localhost:8000/demos/<feature>/`), browser requirements, and how to enter XR.
3. **Instrument before measuring.** Expose `window.__demoMetrics` with `frames`, per-frame `performance.now()` deltas, `errors`, and `interactions`. Add a deterministic stop hook (`?frames=180`) so headless runs terminate.
4. **Run the headless smoke test.** With Playwright/headless Chrome: load the page, capture `console.error` and `pageerror`, drive a few scripted inputs, sample 120+ frames, compute mean and p95 frame time. Assert zero uncaught errors and that frame time meets the plan's budget (or document the headless-only penalty). Save `demos/<feature>/smoke-result.json` with timestamp, browser version, frame stats, and error list.
5. **Define and measure fun proxies.** Convert each planned fun proxy into a concrete metric (time-to-first-successful-input, input-to-response latency, task completion in a trial, replay proxy). Log measured values; mark any proxy N/A with a reason when it cannot be measured headlessly.
6. **Document headset-only gaps.** Explicitly list what desktop/headless testing cannot cover: tracking accuracy, room-scale bounds, controller/hand presence, comfort and motion sickness, stereo depth, and real device frame pacing.

## Handover checklist

- [ ] Demo loads in a plain browser with zero console errors; desktop fallback works
- [ ] README has exact run steps and XR entry instructions
- [ ] `smoke-result.json` saved with mean + p95 frame time and error list
- [ ] Every planned fun proxy defined, measured, or marked N/A with a reason
- [ ] Headset-only limitations enumerated in the README
- [ ] Changes reloaded and smoke test rerun before reporting done
