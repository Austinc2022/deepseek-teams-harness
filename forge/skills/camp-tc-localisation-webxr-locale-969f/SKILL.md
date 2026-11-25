---
name: camp-tc-localisation-webxr-locale-969f
description: Read-only localisation sign-off review before shipping a WebXR/browser app, when given a contractor localisation report, a UI spec, and QA build notes.
---

1. Read every fixture in the evidence pack; treat claims in reports as claims, not facts. Note the pack boundaries (e.g. only 2 files = no build, no strings file).
2. Check the launch locale list's stated basis. Reject 'big markets', 'MT is easy', or any market-size argument: each shipping locale needs (a) human review status, (b) no measured layout/font failure. Build the bounded list in three tiers: ship (reviewed + fixes applied), defer (raw MT: post-edit + LQA first, ship post-launch), block (measured hard failure, e.g. RTL not implemented, missing glyphs).
3. Verify MT status against the contractor's own status line; count raw-MT locales and name them. Raw MT never ships without post-edit + LQA.
4. Extract specific numbers from QA notes and do the arithmetic yourself: char counts (e.g. 14 to 19 chars = +36% expansion), px clip widths, missing-glyph reports. One measured break is enough to refute 'no expansion risk' or 'LTR is fine'.
5. RTL: check mirroring (HUD positions), bidi (digit runs stay LTR inside RTL lines), Arabic shaping font, whether gameplay arrows must mirror, and native review. If RTL is unimplemented, block that locale rather than shipping clipped text.
6. CJK: check font coverage (Latin fonts like Arial lack CJK; also check icon/arrow codepoints), line breaking without spaces, and native review for raw MT output.
7. Reject 'translators can translate the spec / no keys needed': specs drift from builds (look for strings or glyphs in QA notes absent from the spec). Extract stable keys with placeholders intact ({n}/{total}); parameterise device labels (controller 'A') as tokens.
8. Store text: flag verbatim reuse across locales; mark unsupported claims (superlatives, offline/technical claims, self-declared family-friendly badges vs formal age ratings). Never MT an unsubstantiated claim.
9. Reject 'shrink font automatically' overflow handling; require fluid layout, per-string max-length notes, and one LQA pass per shipping locale.
10. Deliver: sign-off yes/no, minimum fix list with acceptance criteria, bounded language list with evidence-tied reasons and explicit uncertainty, and a strings key table in a code block.
