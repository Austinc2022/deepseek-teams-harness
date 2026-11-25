---
name: learned-ticketing-a-department-game-sp-f40a
description: When a department (usually Design) delivers a game concept and build request, and the COO must decide it and open the build ticket.
---

1. **Get the full request text first.** Trigger texts are truncated, and build-request bodies are often NOT on disk: grepping the harness for the request id or its title can return 0 hits, and the run transcript shows only the tool name. If you cannot recover the full text, write the whole brief yourself from the report. Do not ticket a truncated brief.
2. **Check the department's own history before trusting a pick.** Run transcript_search on the concept name plus 'KILLED'. If an earlier run killed the same concept, name each collision it cited and judge it yourself with one or two searches. Decide by charter: the same mechanic on another platform with a different look is allowed (genre); recreating a specific game's name, characters, look or levels is not.
3. **Scope every prior-art claim.** Replace 'no game does this' or 'first' with 'no VR game found that <loop>, n=<queries>'. Name the off-platform peers in GAME.md, and list in the brief the elements that must not be used (for example: no heads or portraits when the mobile peer sculpts heads). Record the result with knowledge_add (measured, with the queries as source).
4. **Attack the spec for the gate's known objections before ticketing:**
   - Is the first 60 s scripted with numbers (first action by t<=5 s, first reward by t~12 s, first clear by t<=45 s)?
   - Does replay length come from construction (seeds x rounds x clock), not from authored content?
   - Is a 'calm' design free of fail states?
   - Is there a readability feature that tells the player WHERE to act, not just a score?
5. **Give the builder a technical default with numbers** (data representation, vertex budget, the exact scoring formula) and allow deviation only with a measured reason in NOTES.md. This saves a turn of exploration.
6. **Make the proofs non-tautological:**
   - A solvability or 'generator guarantee' test must drive the same INPUT layer the player uses, at a human-plausible rate. Replaying the generator's own witness proves nothing.
   - Every test gets a failing control, quoted in NOTES.md.
   - Evidence numbers are bounds (draw calls <=100, triangles <=100k, timestamp order 0<=startIso-generatedAt<=5000 ms), never 'not null'.
7. **Carry the previous game's inherited base defects as numbered deltas** (D1..Dn), each with file:line and a test. Kit fixes that are still in flight must never block the build.
8. **Base choice is decided ONCE.** Use the verified base by default. Swap to a newer kit only if the COO sends an explicit phrase ('KIT vX VERIFIED') before the fork. Never re-base after forking. Until the fork, the builder works kit-free in staging/ on pure modules with tests.
9. **Open with open_ticket(build:<id>, planItem, dependsOn the delivered base ticket, talent principal, research true for new tech, workstream).** decide_build has no talent, research or dependsOn fields.
   - The done-when lists 8-10 numbered measurable items: base line, test counts, vite build, freeze-check both ways, browser session.json bounds, the bot length run, the screenshot list, GAME.md with the audit index and prior art, root hygiene, NOTES checkpoints, and no gate proposal.
10. **After opening, add plan items** for: the base-swap message, forwarding the sibling game's generic critique must-fix items as ONE mid-build message, and the disk check + critique when it reports.
11. **Close the loop:** rate the department (reasons are specific, with what was right and what was wrong), set the initiative confidence with an ARGUED odds line, and propose a skill update when the department's method had the gap.

**Common mistakes:**
- Ticketing a false 'first' claim into GAME.md.
- Letting the bot call game ops directly.
- A plan item with dependsOn a ticket id plus a ticket spec opens the ticket at once (plan dependencies gate only on plan item ids).
- Re-basing mid-build when a newer kit lands.
