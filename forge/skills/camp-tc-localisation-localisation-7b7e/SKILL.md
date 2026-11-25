---
name: camp-tc-localisation-localisation-7b7e
description: A contractor or engineer hands over a localisation-ready claim (e.g. "all strings in strings.json, no hard-coded text") and you must sign off or reject before translation starts.
---

1. Never trust the claimed key count. Open the string file, count actual keys, and compare with the claim; check any _meta for self-contradictions (e.g. key_count vs real entries, unmapped lists).
2. Search the build notes and meta for hard-coded text: canvas/2D draw calls, 3D text meshes inside .glb assets, text baked into texture atlases (PNG), audio/voiceover lines without transcripts, and duplicated strings across sources (pick one source of truth).
3. Check the declared font's glyph coverage. Latin-only fonts mean CJK renders as tofu; treat "language X is compact so no layout work" as false until proven — CJK glyphs are full-width ems, need kinsoku line breaking, and typically need +30–50% width and ~2x line height.
4. Check store metadata support per locale explicitly. If a locale's store is unsupported, say plainly that store text cannot be delivered or claimed for it; do not silently substitute another locale's listing. Respect stated limits (title/short-desc char caps) and flag when the platform's counting unit is unverified.
5. Assign an owner and a format to every string (UI label, sentence, placeholder pattern, texture rect, 3D mesh, audio) and identify which need extraction or asset re-bake per locale.
6. Mark conclusions with insufficient proof as "not enough evidence" instead of asserting them; list them as blockers. Verdict first, then two strongest evidence items.
7. Deliver the full result in the final message when the role is read-only; keep under the stated word cap.
