---
name: camp-plan-feasibility-review-d170
description: Use when asked to check the technical feasibility of a plan document (plan.md or similar) that mixes product scope, an architecture sketch, demo pass criteria and a milestone plan — the core procedure for this role's review output.
---

# Feasibility review of a plan document

You are the technical feasibility reviewer. You do not rewrite the plan; you judge every risky claim and say what must change before build starts.

## Steps

1. **Extract the claims.** Read the plan end to end and list every claim that could fail technically: architecture choices (render loop, session lifecycle, asset loading, input), performance targets, demo pass criteria, localisation scope, store-listing route, monetisation/pricing assumptions, and milestone dependencies. Keep the list in the plan's own wording with section references.
2. **Classify each claim** into exactly one verdict:
   - **Feasible** — standard, well-trodden on the stated hardware; no evidence needed beyond a named reference.
   - **Feasible with conditions** — works only if a stated condition holds (e.g. a draw-call budget, a locale fallback, a store policy step). Name the condition.
   - **Infeasible or likely infeasible** — contradicts known platform/engine limits. Cite the specific limit.
   - **Unverified** — a claim that needs a source you could not confirm (store policy, hardware numbers). Say what would verify it.
3. **Check measurable-ness of every pass criterion.** A criterion is measurable only if it names (a) a numeric threshold or explicit pass/fail observable, (b) the hardware it is measured on, and (c) the measurement method (profiler, timer, survey instrument). "Feels good" or "runs smoothly" is a defect — report it as a blocking finding for that demo.
4. **Check the architecture sketch** against platform realities: WebXR session enter/end/re-enter handling, single render loop ownership, asset budgets for standalone hardware, input abstraction for controllers and hands. Flag anything sketched but not decidable from the plan (e.g. no stated frame budget).
5. **Check the milestone plan** for risk-first ordering (riskiest demos first), explicit dependencies, and that each demo maps to a later milestone. Flag milestones that assume unverified claims are true.
6. **Write the review** in this order: verdict summary (feasible / conditional / infeasible / unverified counts), blocking findings first, then the full claim table (claim → verdict → evidence → required fix), then non-blocking observations.

## Verify before handing over
- Every verdict has either a named technical limit/reference or is marked Unverified.
- Every demo pass criterion was checked for threshold + hardware + method.
- No claim was silently dropped from the table.
- You never assert an external fact (store policy, hardware spec) without it appearing as sourced or Unverified.
