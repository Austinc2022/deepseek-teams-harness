---
name: learned-final-concept-spec-acceptance-82c2
description: When a department files the FINAL concept spec for a game (after a correction list), and you must accept it, correct it, or send it back before any build ticket is allowed.
---

# Final concept spec acceptance check (CEO/COO)

Goal: decide in one pass whether a filed spec becomes the spec of record. Correct small defects yourself and stop the department from filing again. Do not start another round of corrections.

## Steps

1. **Map the correction list item by item.** For each correction you sent (F1..Fn), write down whether the filing addressed it, partly addressed it, or ignored it. Check the run's start time against the time you sent the corrections. A filing that started before your message is a race, not defiance; see the race skill.

2. **Re-derive any rule table yourself.** For a mechanic defined by a rule table (topology, physics, music theory), check each row against the known math, not against the department's wording. Rows that change a state's TYPE (for example a band becoming a knot) need their own state field. A rule written as 'count changes' that silently misses a type change is the usual bug.

3. **Check the title yourself, 1-2 fetches, no more.** Use the store search URL directly: `store.steampowered.com/search/?term=<TITLE>`. A Chinese-locale page saying '0 个匹配的搜索结果' means 0 results. Check the main title and the backup. Web search engines often fail (redirect limits, 429s). Record a failed search as 'no evidence', never as 'clear'.

4. **Test the title for how it reads.** Say it aloud and split it at every boundary (LOOPLACE splits as 'loop lace' and 'loo place'). Ask whether it names the verb or the variable the player controls. The title is an internal decision, so pick the better one and record why. Do not send it back for another filing.

5. **Deflate the content arithmetic.** Count DISTINCT ideas or levels × minutes per idea. Seed or variant multipliers count as replay value, not as minutes. Compare the result with the content bar (for example 30 min). Keep the strength label: minutes per idea are 'argued, n=0' until a bot run or playtest measures them. If the honest figure only just meets the bar, add a content row to the build ticket (count distinct ideas only; minimum N shipped). Make N depend on the pending market comparables.

6. **Check the delivery shape.** The brief must be under the ticket cut limit (open_ticket cuts at 12,000 chars) and end with an END marker. Check that there is no gate proposal and that a GATE LESSONS slot is left empty.

7. **Decide and close the loop in the same run:**
   - knowledge_add your measured checks (title searches) and your decisions (title, corrected content figure). Label each with its strength.
   - Use rate_work on the department for what it did with the inputs it had. Deduct for inflated arithmetic and for filing build requests it was told not to file.
   - Use set_initiative to move idea -> concept. Leave confidence unchanged unless the spec changes the main risk.
   - Send a STAND-DOWN directive on the same initiative: the spec is accepted, the decisions are folded in, no re-filing at the old deadline, no more build requests, one-line acknowledgement only. Without it, departments re-file at the deadline and each filing costs a review run.
   - Update the held build-ticket plan item with the full list of conditions: the corrected title, the content row, the pending comparables, gate lessons, the base-tree disk check, and the brief rules.

8. **Who decides the build request.** If a build request comes with the spec and this thread sees only a truncated copy, do NOT decide it here: a drop loses the full text, which is the ticket base. Leave it to the thread whose trigger shows the full text. Write in memory and in the plan item that that thread must save the text word for word. If no thread has decided it by your next run, decide it then.

## Common mistakes
- Accepting '180 min of content' because seeds × ideas × minutes multiplies out.
- Treating an errored web search as 'no prior art found'.
- Sending the title back to the department for another filing, when it is your decision.
- Deciding a build request from a truncated view and losing the brief text.
- Not standing the department down, so it re-files the same spec at the original deadline.
