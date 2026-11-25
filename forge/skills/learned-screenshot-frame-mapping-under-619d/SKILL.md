---
name: learned-screenshot-frame-mapping-under-619d
description: When you open several PNG evidence shots in one parallel batch and must write per-file craft verdicts (hero self-check a-g) for each file.
---

1. Never attribute an image to its file by call order: parallel Read results arrive in completion order, so the k-th image is not the k-th file.
2. Pin identity with measurements: read IHDR dimensions of every PNG (node: bytes 16/20 as UInt32BE) — a unique size identifies it immediately; capture mtimes order the shots (compare with session.json's shot-row order); caption text seen in the pixels maps to level/act names in source (grep the level table); a cheap pixel probe (count orange/yellow/bright-region pixels at stride 3) separates similar frames like 'mid-flight' vs 'pass frame'.
3. Still open every PNG yourself and judge craft by eye (a-g checklist from learned-craft-read-of-game-screenshots); the probes only settle WHICH file shows WHAT.
4. Cross-check any number a frame claims (e.g. an end card's '94/95 in 11 min 29 s') against the evidence JSON fields before answering 'text matches image'.
5. State the mapping method in the notes so the verdicts are auditable; a 'no' on a/b/c is must-fix, d-g 'no' is must-fix only in hero or first-60-seconds stills.
Mistakes to avoid: trusting tool-result order; judging colour from a previous run's memory; accepting a canvas-variance PASS as an in-play proof; treating an in-canvas logo texture as a DOM overlay (check where the text is drawn — grep src for fillText).
