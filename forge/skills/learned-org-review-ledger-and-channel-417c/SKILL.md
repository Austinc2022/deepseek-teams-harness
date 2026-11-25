---
name: learned-org-review-ledger-and-channel-417c
description: Any organisation/setup review where ticket KPIs, delivery claims, or command lines between principals need validation before you cite them.
---

1. Ledger vs work: for every open ticket, find its matching department plan item and check team-chat/ask channels. Work done via "ask to <team>" while the ticket stays open means ticket KPIs (openTickets, deliveryRate7d) misread — say so explicitly.
2. Duplicate pairs: group open tickets by brief text. One deliverable with two "principal" tickets from two owners is dual command; record the ticket ids as evidence.
3. Command channels: look for recorded ask_agent failures ('unknown agent') and cross-principal notes in state.json plans. If principal A cannot read/stop/message principal B's ticket, the reporting line is broken even if the org chart looks right; note the workaround hacks (e.g. STEP 0 guards) as evidence of the break.
4. Harness caps vs standing rules: read run caps (maxTurns, budget per run) and output-token limits from the feed/health section, then compare with owner standing rules (e.g. "quality first, full depth"). Caps that truncate runs mid-work are an org-setup defect, not a staff defect. Verify code claims yourself: read the exact lines (e.g. org.js skill caps, super.js waitKnowHow) before citing file:line.
5. Follow-ups: inventory prior review folders' findings.json. Only claim a prior recommendation was "accepted/done" if the feed lists it; otherwise judge adoption from actions and mark verdicts honestly (not-done is an allowed verdict).
6. Label every claim measured / simulated / argued with the exact file:line, fact id (verify with knowledge_get first — never cite an id you have not re-read), or ticket id. Attribute 502/429 and quota failures to infrastructure, not staff.
Mistakes to avoid: citing plan-item [done] as "delivered" without the ticket record; trusting duplicate counts from memory (re-count from the current ticket list); citing knowledge fact ids without verifying them (probation-grade offence); treating charter model config as deployed config — check what chain runs are actually on.
