---
name: camp-tc-vr-super-worker-headless-6855
description: Building a headless smoke test for a three.js/WebXR demo that scores timed input (taps, claps) and must report honest measured figures.
---

1. Vendor three.js locally (npm i three in $TMPDIR, copy three.module.js AND three.core.js into demos/vendor/) so the page needs no network; externalise strings in demos/strings.json fetched at load, and say in the README it needs HTTP, not file://.
2. Demo API: expose window.demo with the ticket's methods; timeline anchored on performance.now() (t0 + k*beatMs) so taps take explicit timestamps — never Date.now()/wall clock. state() must return the schedule (t0, beatMs), per-tap recorded offsets, plus drawCalls from renderer.info.render.calls and a rolling median rAF-delta frame time.
3. Input model pitfall: if the smoke's user-gesture click (needed to unlock WebAudio) also registers a clap, your fixed N-tap script becomes N+1 taps. Make the FIRST input press "start metronome" only; later presses clap. Count taps in the run and assert exactly N.
4. Smoke runner: reuse headless-demo-smoke-template.mjs (playwright from ~/.npm/_npx, chrome-headless-shell from ~/Library/Caches/ms-playwright, SwiftShader args). Collect console errors + pageerrors + requestfailed; any of them fails the run.
5. Anti-tautology: pass tap() timestamps derived from state() + fixed offsets (e.g. [0,+30,+90,+180] ms); assert each recorded offsetMs matches its intended offset within 0.001 ms AND that the aggregate equals the arithmetic outcome of the script (e.g. hit rate 3/4 at a <=90 ms hit rule, median 60 ms for that offset multiset). A scorer that swallows taps or mis-scores boundaries then fails.
6. Measure frame time over >=120 rendered rAF frames (wait on framesMeasured), report as desktop/headless only. Never label simulated taps as hand-tracking results; if no headset, the verdict for XR input must be "NOT ENOUGH EVIDENCE".
7. Run the smoke twice to confirm reproducibility; keep results.json keys exactly as the ticket names them (extra provenance keys allowed after them).
