---
name: camp-fun-proxy-run-and-report-bfae
description: When the delivery package must include fun-proxy results: choosing measurable stand-ins for fun, instrumenting and running them, and writing the results up honestly.
---

# Fun-proxy measurement and report

When the delivery package must include "fun-proxy results": measurable stand-ins for fun, run and reported honestly.

1. **Fix the proxy set before measuring.** Pick 3-5 measurable proxies tied to the product's core loop (e.g. session length, retry rate after failure, time-to-first-success, interaction attempts per minute, completion rate of a first level, error/undo rate). Write each as a number with a target and a pass/fail line. Do not invent proxies after seeing results.
2. **Build the harness first.** Each proxy must come from an automated run (test script, replay bot, or instrumented session) with the measurement code committed alongside the product. A proxy you cannot re-run is not evidence.
3. **Run each proxy at least 3 times** and report the median plus the range. One lucky run is not a result.
4. **Record the raw numbers, not adjectives.** Never write "feels fun". Write "retry rate after failure 62% (target >50%) — pass".
5. **State limits explicitly**: synthetic players are not humans, so phrase conclusions as "fun proxy", never as a fun verdict or a store-readiness claim.

## Verify before handing over
- [ ] Every proxy has target, method, raw numbers, and pass/fail.
- [ ] Each measurement can be re-run by a command given in the report.
- [ ] Failures are reported as failures with the number that failed.
- [ ] Report says "fun proxy" and nothing stronger.
