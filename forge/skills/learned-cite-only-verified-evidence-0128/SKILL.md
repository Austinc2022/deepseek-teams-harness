---
name: learned-cite-only-verified-evidence-0128
description: Whenever you write a review, verdict, after-action report, memo or knowledge_add claim that cites fact ids, counts, approvals or measurements — anything another agent or the owner will read and act on.
---

# Cite only verified evidence

## When to use
Any review, verdict, after-action report, memo or knowledge_add claim that cites fact ids, counts, approvals or measurements. Also use it when checking another agent's report. For a protected agent whose instructions cannot be edited, deliver this procedure through its playbook (propose_skill_update), not an instructions edit.

## Method
1. **Resolve before you cite.** For every fact id you plan to cite, run knowledge_get on it THIS cycle. Cite only ids that resolve AND whose claim text actually supports your sentence. If knowledge_get says "No such fact", the id does not exist: drop it or mark it "unverified id".
2. **No ids from memory or from other agents' text.** Never write a fact id you have not resolved yourself this cycle — not from your context window, not copied from a transcript, a report, or the brief you were handed. Phantom ids look well-formed and real.
3. **"measured" means you ran it this cycle.** Label your own claim "measured" only with a file path or command output you produced this cycle. To repeat someone else's measurement, quote it with attribution ("X measured Y — fact id, resolved by me now") and keep the resolved fact's strength; never re-label it as your own measurement. Otherwise use "argued" (your reasoning), "simulated" (model/backtest) or "hearsay" (what someone said).
4. **Never attribute approval without the reply text.** Do not write "owner-approved" (or any person's approval) unless you quote their reply text and its source. If you cannot quote it, write "unverified".
5. **Fresh counts and content, not line numbers.** Every count, inventory or list comes from a Glob/Grep/Read run this cycle. Line numbers drift within a day; quote file content. When you cite a resolved fact, copy its status and strength too: if it is STALE, DISPUTED or SUSPECT, say so in your line.
6. **One evidence line per claim:** claim — source — strength. A reader must be able to check each sentence independently.

## Checks (run on your draft before sending)
- Every fact id in the text was passed to knowledge_get this cycle; every one resolved or is explicitly marked "unverified id". Zero exceptions.
- Search your draft for hex-looking ids and for the words measured / approved / owner-approved; each hit satisfies rules 2–4.
- Every "measured" label names a path or command you ran this cycle; every repeated measurement names its source id and the agent who ran it.
- Every count traces to a Glob/Grep/Read in this cycle's transcript.
- If a sentence has no evidence line, delete the sentence or downgrade its strength.

## Pitfalls
- **Plausible phantom ids.** A well-formed id from memory or another agent's text is not evidence. (g6cc8b348cd "gap ledger" and g5c7a0d828d both appear in agent texts; knowledge_get returns "No such fact" for both, checked 2026-11-24.)
- **Line numbers instead of content.** They drift the same day (company.json "hires": [] was cited at 1998, then 2006, then 2014); quote content and file.
- **Seniority laundering.** Do not upgrade hearsay to "measured" because a senior agent said it. (fbf661c3201 was later corrected on the allowlist half by f5a3b3bdade.)
- **Resolving is not believing.** A resolving id can be stale or disputed — fe6af619d87 resolves but is STALE, strength "argued". Copy status and strength next to the citation.
- **The brief itself can carry unverifiable numbers.** Material handed to you is hearsay until you resolve it (e.g. a "78/100" figure that appears in no fact or transcript).
