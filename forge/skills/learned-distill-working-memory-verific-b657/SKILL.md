---
name: learned-distill-working-memory-verific-b657
description: When asked to distill a team's working memory for a purpose into current state, lessons, facts and notes to retire.
---

1. List every bracketed fact id and note id in the starting pack; for each claim you will restate, trace it first: transcript_search a distinctive phrase (a price string, a count, a ratio), then knowledge_get the fact id to read its status and source_ref. Say confirmed only when the source shows it.
2. For "current state", the artifact beats every report: Glob/Read the real file (GAME.md, kit.config.json) and cite file:line. Chat reports truncate and drift; the file is ground truth. If a correction package's tail is truncated in the journal, verify its items against the file instead of guessing.
3. Watch instrument mismatches and never merge them silently: store RATINGS vs written REVIEWS; AUD measured prices vs judge-reported USD; units-to-target vs revenue-gap bases (the same day's "3-10x short" and "12-20x short" can both be right). State which instrument and basis each number used.
4. Check recorded URLs for id/slug collisions — a "comparable" entry can silently point at another game's page (a redirect), so the capture may be another row's data. Live-store captures win over judge corrections; date- and currency-label every price.
5. Classify starting-pack entries before carrying them: keep on-purpose unverifiable state; retire (a) self-declared superseded tombstones, (b) digests that duplicate a knowledge fact which stays active in the company store, (c) context bleed from another workstream/game. Retiring a digest is safe when knowledge_get still resolves the canonical fact.
6. Keep every hedge verbatim ("about", "ARGUED", "reported-unverified", "<1%"); never upgrade strength. Note immaterial discrepancies briefly instead of inflating or hiding them. Lessons must generalize beyond the purpose; every fact needs a checkable source (run id, transcript path, or file path).
Mistakes to avoid: quoting an early chat table as final state when a later correction package superseded it; calling "simulated on measured inputs" measured; retiring a true fact as wrong when it is merely off-purpose.
