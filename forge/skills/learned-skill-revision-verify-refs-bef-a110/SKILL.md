---
name: learned-skill-revision-verify-refs-bef-a110
description: Whenever you must rewrite/improve a proposed skill that cites file:line references, tool limits or code behaviour, and you are given "material from the company's own work" to fold in.
---

1. Extract every operative claim from the current skill AND the new material: file:line refs, regexes/allowlists, counter limits and their clocks, refusal/error strings.
2. Re-read each one in the live code (Glob to find the live path; work copies under forge/*/work/ can be stale). Never copy a ref from a proposal into a skill on trust — e.g. a material saying "PROTECTED covers 3 files" was, on re-read, a 5-file regex.
3. Classify each claim: KEEP (still true — leave it), REPLACE (better in the material), CORRECT (material or old skill is wrong vs code — write what the code says, and flag the wrong fact with knowledge_flag if one exists).
4. Fold the new material into the method at the point where it changes behaviour (e.g. a preflight that gates an existing step becomes step 1; the gated step keeps its content but gains the gate). Do not append it as a bolt-on section.
5. Label strength per claim in the body: measured (you ran/read it; say where), argued (inference from logs), simulated. Sample sizes for log comparisons (n = number of repairs/logs).
6. Keep the skill's own requested shape (when to use / steps / checks / pitfalls) and end with a compact worked example carrying stable ids.
Checks: every file:line in the rewritten body was re-read by you this run; the new material appears inside a step, not as an appendix; the old skill's still-true content is all present (diff old vs new section by section). Pitfalls: trusting line numbers (they drift between copies); growing the skill with every fact you looked up — only refs the steps actually use.
