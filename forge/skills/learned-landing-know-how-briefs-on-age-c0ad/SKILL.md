---
name: learned-landing-know-how-briefs-on-age-c0ad
description: When a request_know_how reply (methods brief + attached skills) arrives for an agent you supervise as head of People.
---

1. Verify at source before arming anything: open the know-how record in forge/super-agent/growth.json (match the problem text, forAgent, status, skills array) and spot-check one or two code citations yourself with Grep/Read. "Skills attached" in the reply means the record's skills array — check whether they also bind where work happens (ticket lastAttached/libSkills, or the agent yaml for durable use); do not take the claim on trust.
2. Choose the landing channel per rule: durable instructions go via update_agent role text (send the FULL role text — org.js updateAgent replaces fields wholesale; omit `skills` unless changing them, and when changing include every existing name: skillExists requires forge/skills/<name>/SKILL.md, only the first 10 are kept, and nonexistent names are silently dropped); new procedures go via propose_skill_update (skill-writing cap is daily — a limit refusal is neither rejection nor acceptance; re-propose on the next day's first run, never re-spam the same day).
3. Keep at most one live skill-smith request when the cap is in doubt; queue the rest as conditional plan items keyed on the first verdict.
4. Arm a judging rule on the next real work artifact: name exactly what to check and where (file:line). A coaching or know-how change is only real if the next work improves (one clean read; a repeat escalates to the coach).
5. Record the decision in your memory with the measured anchors; record cross-team rules in company knowledge (measured strength for code facts, argued for method rules).
Common mistakes: trusting the reply's attachment claim without finding where skills bind; update_agent passing only the new skill names and silently dropping the old ones; re-sending a capped proposal within the same day; landing method rules only in chat where they die with the thread; re-explaining rules the agent's role already carries (read the yaml first, add only what is missing).
