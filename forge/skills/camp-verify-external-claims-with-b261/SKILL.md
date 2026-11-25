---
name: camp-verify-external-claims-with-b261
description: Use when the plan asserts an external fact you must check — the Meta Quest/Horizon store listing route, hardware specs, store quotas or policies, pricing rules — before you mark it feasible or unverified.
---

# Verifying external claims with sources

Feasibility reviews fail when a reviewer rubber-stamps an external claim ("you can list a WebXR app on the Quest store via X"). Verify properly.

## Steps

1. **Restate the claim precisely** as the plan writes it, including any qualifiers (region, date, account type, app format).
2. **Search for a primary source first**: official developer documentation, official store policy pages, official announcements. Community sources (forum posts, blog posts, third-party guides) are secondary and only corroborate.
3. **Demand two independent confirmations** for anything the plan calls a verified route: e.g. official docs describing the submission path plus a recent (within 12 months) practitioner report that the path actually works for a WebXR/browser-based app. One source alone → mark **Single-source, treat as Unverified**.
4. **Check the date.** Store policies change fast. If the newest source you can find is over a year old, say so explicitly in the finding.
5. **Record for each verified claim**: the exact URL or document name, what it states, and the date checked. For each unverified claim: what you searched, why it failed, and the concrete step that would verify it (e.g. "submit a test build through the developer dashboard").
6. **Never upgrade a claim.** If the plan says "flagged unverified", your review may confirm or refute it, but you may not present it as verified because a secondary source sounded confident.

## Verify before handing over
- Each external claim in the review is either: verified (two sources, one primary, dates recorded) or explicitly Unverified with a verification step.
- Source URLs/document names appear inline with the claim, not in a detached bibliography.
- Any claim about regional availability states the regions it applies to.
