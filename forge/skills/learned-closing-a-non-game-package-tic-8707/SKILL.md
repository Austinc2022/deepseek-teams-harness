---
name: learned-closing-a-non-game-package-tic-8707
description: Use when a ticket's deliverable is a document or patch package (harness repair prep, specs, owner hand-apply packages), not a game, and fix passes or automatic critiques keep reopening it.
---

## Why
Document and patch packages converge badly under critique loops. Critics keep finding wording nits, a partial panel can turn up stale items, and every pass risks an unread-input race. Measured on one ticket (kd4e28dbd16): about 7 documentation passes. Two critiques had only 1 to 2 real verdicts of 5 (one was the literal verdict 'placeholder'). At least 3 passes were lost because a message arrived seconds before the turn ended and was never read.

## Steps
1. **Before the LAST pass, write the close criteria as disk checks**, in your memory note, not only in the message. Each check must be something you can verify with Read or Grep yourself. Examples: line 1 of a file names X; the count of a section marker is N; the report has the strings 'A', 'B' and 'C'; the report is at most N lines; a required file exists and is at most N lines; a placeholder line is gone. Also write down what happens on fail ("close as is; carry the missing items in the owner message"), so the result never earns another pass.
2. **Send the last pass only when the ticket is idle or just ended.** If it delivered seconds ago, wait for 'ended'. An input sent in the last seconds of a turn is lost.
3. **When it delivers, run your own checks first** with Read/Grep on the live files. Do not trust the builder's summary, and do not open another critique.
4. **Triage any automatic critique that lands anyway:**
   - Count real verdicts. A placeholder text, a score of 0 with 'nothing' as the must-fix, or an aborted critic is not a verdict. Fewer than 3 of 5 real verdicts is not a panel.
   - Check each must-fix item against the CURRENT disk. The critic may have read the files before the last pass landed.
   - Sort what remains: (a) already fixed on disk, (b) a decision you can make yourself when you use the package (for example, how to split a repair), (c) genuinely missing. Only (c) is a candidate for a pass, and only if it would mislead the person who applies the package. Otherwise fix it in your own owner message.
5. **Close:** accept_ticket. Its reason lists every check with its measured result, the panel count, and how each must-fix item was dealt with. Rate the builder, then update the plan items that depended on it.
6. If the package goes to the owner, the owner message carries the corrections you decided in step 4. Examples: which optional step to skip, which patches to apply separately, which numbers to expect after each step, and what was NOT run.

## Mistakes to avoid
- Setting the close criteria after reading the result. You will move the goalposts.
- Treating a partial or broken critique as a must-fix list.
- Sending "one more" pass for a wording nit that you could state yourself in the owner message.
- Forgetting that reply_owner with cannot-finish may start a rescue challenge, even with 4 attempts listed. Note the challenge id and the exact text, so you can resend after reading the challenge result.
