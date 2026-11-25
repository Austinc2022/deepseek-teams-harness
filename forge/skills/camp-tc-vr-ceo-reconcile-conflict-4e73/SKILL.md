---
name: camp-tc-vr-ceo-reconcile-conflict-4e73
description: When two demo evaluation reports disagree on a VR (or any interactive) product gate and you must issue go / revise / stop without averaging.
---

1. Never average scores across demos that differ in hardware OR build; treat each demo as a test of a specific (hardware, build) pair and report per-pair.
2. Find the confound via engineering notes (e.g. stock Quest 2 browser audio path at 120ms vs fixed low-latency path at 28ms). If root cause is identified and any test shows recovery, downgrade 'stop' to 're-demo'; do NOT upgrade to 'go' unless the fix passed a FULL demo protocol (same song list, same n, same metrics).
3. Pick the mass-market hardware as the governing target; premium-hardware wins count as 'proven' but do not license a go.
4. Re-demo spec must name: hardware, build version, sample size, latency ceiling, fun threshold, replay rate, comfort/nausea ceiling, sustained fps.
5. Stop only if the core loop fails on the governing hardware with no identified root cause, or the fix fails the re-demo.
6. Restate revenue against both $1M/day and $1M/year with copy arithmetic at the price point; mark unverified sales notes and give an honest band.
