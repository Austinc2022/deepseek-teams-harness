---
name: learned-judging-truncated-work-53cd
description: A judging prompt embeds a work sample that is visibly truncated, and the full text may exist in agent transcripts.
---

1. Treat the embedded text as the authoritative sample, up to the truncation; do not assume the missing tail satisfies unmet requirements.
2. Search the company transcript corpus for distinctive phrases from the work to recover the full agent output, using transcript_search with exact rare terms.
3. If the recovered transcript matches the prompt's text and contains the tail, use it to check completeness and word count, but flag that the prompt-supplied excerpt was truncated.
4. Score against the request's explicit checklist (count items, labels, evidence strength, URLs, word limit), and separate what is actually evidenced from what is argued.
5. Check for an explicit capability gap: which ability of the named agent would have fixed the deficiency.
