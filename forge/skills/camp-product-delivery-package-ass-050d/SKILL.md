---
name: camp-product-delivery-package-ass-050d
description: When the product build is finished and the delivery package (source, build instructions, all reports) must be assembled and handed over with nothing published.
---

# Assembling the delivery package (nothing published)

When the build is done and you must hand over a delivery package: source tree, build instructions, and all reports — with nothing sent anywhere.

1. **Prove the build from a clean checkout.** Follow your own build instructions literally in a fresh directory/clone. If a step is missing or a command fails, fix the instructions, not the memory of how you built it.
2. **Structure the package.** `product/` (source + build instructions in README), then test results, locale/coverage report, performance and comfort report, fun-proxy results, security and dependency review notes, privacy policy draft, release checklist — each as a separate file with the date and the exact commands used to produce it.
3. **Cross-check completeness against the requested deliverable list**, item by item. A missing report is a failed delivery, even if the build works.
4. **Every claim in every report points to evidence**: a command output, a test name, a file path, or a measured number. Mark anything unverified as unverified.
5. **Confirm nothing is published.** No deploy, no push to a public registry, no store upload, no tag. If a step would publish, stop and leave it for the explicit release gate.

## Verify before handing over
- [ ] Clean-checkout build works from the written instructions alone.
- [ ] Every requested deliverable exists as a file, listed in the package index.
- [ ] All tests in the report were actually run; failures are shown, not hidden.
- [ ] Nothing was deployed, published or uploaded.
