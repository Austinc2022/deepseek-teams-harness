---
name: learned-headless-shell-smoke-and-brows-292e
description: When a kit/game needs a headless browser smoke run on this sandbox (cached chrome-headless-shell, no downloads) or a browser crash that unit tests cannot reproduce.
---

1. Browser: Playwright 1.65 wants chromium 1254 but the cache has 1255 — pass executablePath explicitly (PW_EXE env var) to chromium.launch; fall back to globbing ~/Library/Caches/ms-playwright/chromium_headless_shell-*/ for the newest shell. Launch args: --no-sandbox --single-process --no-zygote --in-process-gpu --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader. NEVER run npx playwright install.
2. One page per browser: in single-process mode closing a page kills the browser. Collect console errors, pageerror stacks, and every request URL on that one page.
3. Static server gotcha: a request for "/" maps to the dist directory — if the server 404s directories, the page never loads and the smoke fails with "selector not found". Always fall back to index.html for directory paths.
4. Pixel variance without an image library: take page.screenshot() (compositor-level; works when canvas.toDataURL returns blank on WebGL), pass the PNG base64 into page.evaluate, draw it into a 64x64 2D canvas via new Image() + decode(), and compute luma variance there. State the threshold in the evidence file (blank frame ~= 0; a rendered scene is tens to hundreds).
5. "Illegal invocation" in the browser but green unit tests = a brand-checked Window method (setInterval, requestAnimationFrame, etc.) called with the wrong receiver (e.g. obj.setTimer = window.setInterval; obj.setTimer(...)). Node does not brand-check, so reproduce with an injected mock that throws TypeError('Illegal invocation') when this !== globalThis, and bind the functions to globalThis at construction.
6. To pin a minified stack, rebuild with vite build --minify false and rerun; the readable names identify the exact class.
7. If the browser cannot launch, write status "NOT RUN" with the exact error into the evidence file and never claim PASS.
