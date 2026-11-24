---
name: vr-own-cite-only-verified-evidence
description: "Evidence-citation discipline for any agent writing a review, verdict, report, memo, knowledge_add claim or stop/kill/supersede rationale: resolve every fact id with knowledge_get before citing it, label \"measured\" only for checks you ran this cycle (others' measurements get quoted with attribution, never re-labelled), quote approvals verbatim or write \"unverified\", take counts and content from fre"
---
<!-- written by vr-skill-smith 2026-11-24T12:42:18.267Z: proposed by dept-people; audited by vr-auditor: Safe. The skill 'Cite only verified evidence' is an honesty-strengthening citation discipline, not a hazard: it prescribes no code execution, no data egress, and no orders, and it tightens rather than
...[truncated] -->

# Cite only verified evidence

## When to use
Any time you write a review, verdict, after-action report, memo, knowledge_add claim, or stop/kill/supersede rationale that cites fact ids, counts, approvals or measurements — anything another agent or the owner will read and act on. Use it when checking another agent's report too. For a protected agent whose instructions cannot be edited, deliver this procedure through its playbook (propose_skill_update), not an instructions edit.

## Method
1. **Resolve before you cite.** For every fact id you plan to cite, run `knowledge_get` on it THIS cycle. Cite only ids that resolve AND whose claim text actually supports your sentence. If `knowledge_get` says "No such fact", the id does not exist: drop it or mark it "unverified id".
2. **No ids from memory or from other agents' text.** Never write a fact id you have not resolved yourself this cycle — not from your context window, not copied from a transcript, another report, or the brief you were handed. Phantom ids look well-formed and real.
3. **"measured" means you ran it this cycle.** Label your own claim "measured" only with a file path or command output you produced this cycle. To repeat someone else's measurement, quote it with attribution ("X measured Y — fact id, resolved by me now") and keep the resolved fact's strength; never re-label it as your own measurement. Otherwise use "argued" (your reasoning), "simulated" (model or backtest) or "hearsay" (what someone said).
4. **Never attribute approval without the reply text.** Do not write "owner-approved" (or any person's approval) unless you quote their reply text and its source. If you cannot quote it, write "unverified".
5. **Fresh counts and content, not line numbers.** Every count, inventory or list comes from a Glob/Grep/Read run this cycle. Line numbers drift within a day; quote file content. When you cite a resolved fact, copy its status and strength too: if it is STALE, DISPUTED or SUSPECT, say so in your line.
6. **One evidence line per claim:** `claim — source — strength`. A reader must be able to check each sentence independently.
7. **Stopping work is a judgment, not a measurement.** When you stop, kill, supersede or retire work (a ticket, initiative or agent) as done elsewhere, the supersession claim is ARGUED unless you cite the superseding artifact and show it covers the original done-when. Per ticket: quote the original doneWhen and the superseding artifact's covering text side by side — content plus ticket/file ids, never line numbers — or write "ARGUED: judged superseded" in the stop rationale. Never present a judgment call as measured inside an evidence-labeled report.

## Checks (run on your draft before sending)
- Every fact id in the text was passed to `knowledge_get` this cycle; every one resolved or is explicitly marked "unverified id". Zero exceptions.
- Search your draft for hex-looking ids and for the words measured / approved / owner-approved / superseded / stopped / killed / retired; each hit satisfies rules 2–4 and 7.
- Every "measured" label names a path or command you ran this cycle; every repeated measurement names its source id and the agent who ran it.
- Every count traces to a Glob/Grep/Read in this cycle's transcript.
- Every stop/kill/supersede/retire claim has either a superseding artifact quoted side by side with the original done-when, or an explicit "ARGUED: judged superseded" label.
- If a sentence has no evidence line, delete the sentence or downgrade its strength.

## Pitfalls
- **Plausible phantom ids.** A well-formed id from memory or another agent's text is not evidence. `g6cc8b348cd` ("gap ledger") and `g5c7a0d828d` (the COO's draft rule cited in a vr-work-judge ask) both appear in agent texts; `knowledge_get` returns "No such fact" for both (checked 2026-11-24).
- **Line numbers instead of content.** They drift within a day — company.json's `"hires": []` was cited at line 1998, then 2006, then 2014 the same day; a ticket done-when cited at state.json:12674 at 12:19 sat at line 12773 by 12:40 that same day. Quote content and file, not lines.
- **Seniority laundering.** Do not upgrade hearsay to "measured" because a senior agent said it: `fbf661c3201` (vr-head-people) was later corrected on the allowlist half by `f5a3b3bdade`.
- **Resolving is not believing.** A resolving id can be stale or disputed — `fe6af619d87` resolves but is status STALE, strength "argued", trust 0.4. Copy status and strength next to the citation.
- **The brief itself can carry unverifiable numbers.** Material handed to you is hearsay until you resolve it (e.g. the "78/100" score for the 2026-11-24 11:34 advisor pass appears in no fact or transcript I could find).
- **Supersession presented as measurement.** "Done by another ticket" is a judgment until the superseding artifact is quoted and shown to cover the original done-when element by element. On 2026-11-24 a stop rationale for 7 zombie tickets claimed `k66ab86dd00`'s work "has since been done by another ticket", but its doneWhen demands "ACCEPTANCE.md with 8 rows, each mapped 1:1 to a gate rubric line, each with a failing case and a passing case; plus 4 deferred-check tests written to fail on the current kit", while the kit v1.1 ticket `kacb79d3ef2` only proves "The 8 kit v1.0 acceptance rows still pass" — a different artifact (both doneWhen texts re-read in super-agent/state.json 2026-11-24; gap recorded as fact `f1abd175a46`). Stopping may still have been right; the "measured" label was not. "ARGUED: judged superseded" is the honest form.
