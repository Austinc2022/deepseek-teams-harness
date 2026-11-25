---
name: learned-verify-and-arm-on-trial-skill-10d5
description: When the Skill Smith reports a skill you proposed is "written and on trial" for an agent — before closing the plan item that tracked it.
---

1. Read the delivered SKILL.md and diff it against your proposal by hand: every requested step/check/pitfall present, each factual claim backed by a real code citation or fact id (quote one), and an auditor header if the flow provides one. A step restated without its measured citation is a miss worth a follow-up note, not trust.
2. Find the trial record in forge/super-agent/growth.json ("trials" array): it names the AGENT the skill is on trial for, the exact skill name, status "trial", startedAt. Quote it (id + fields). This record — not the system notice — is the attachment evidence at agent level.
3. Check live work: in forge/super-agent/state.json, look at the target agent's open tickets for "libSkills"/"lastAttached" arrays and quote where the skill name appears. TRAPS: (a) the harness may attach a near-identical "learned-<name>-<hash>" twin to tickets while the trial record holds the "vr-own-<name>" — a name mismatch is NOT a failed attachment if content matches; (b) forge/agents/<agent>.yaml's static skills list usually will NOT contain a trial skill — its absence is normal, not a miss.
4. Only then mark the plan item done, and ARM the follow-up read in the plan: the target agent's next checked output gets judged against the skill's rules (list the rules in the item's text), one clean read. A skill is real only when the next work follows it.
5. Re-propose ONLY on trial rejection, and only with the trial evidence quoted. On acceptance, leave it kept and let the armed read decide whether it changed behaviour.
6. Rate the Skill Smith's delivery (rate_work) on faithfulness + verification cost, separating content quality from mechanism friction.
