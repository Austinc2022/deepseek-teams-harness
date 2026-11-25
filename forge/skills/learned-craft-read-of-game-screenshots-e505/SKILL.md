---
name: learned-craft-read-of-game-screenshots-e505
description: When a game ticket reports hero.png or evidence screenshots as 'verified', before you write its fix message, forward its lessons to a sibling build, or let it near the gate.
---

## Why
Builders' evidence checks (file exists, non-blank, canvas variance above a threshold) pass on frames that fail on craft. Orbwend turn 5 (2026-11-24) reported 'hero verified by eye', but hero.png was the DOM start menu. Its gates rendered near-black, its trail drew as an opaque bar, rings covered the HUD banner and the end card overlapped leftover objects. Every past game whose stills looked like this scored Craft 3-5/10 at audit. Treat that as an argued link, n of about 9 audits. Only the reviewer opening the PNGs catches this.

## Steps
1. **List the images.** List hero.png and every PNG in rc/screenshots/ (or wherever GAME.md points). Compare each mtime with the newest src/ file. A PNG older than the last source change is stale: it has to be regenerated, not judged.
2. **Open every PNG yourself** with the Read tool. Never accept the worker's 'by eye' line, a variance number or a file size as a craft check.
3. **Write yes or no for each image** on these 7 lines:
   - a. **In-play moment:** the game world is mid-loop. It is not a DOM menu, title card, loading screen or HTML overlay.
   - b. **Hook at thumbnail size:** at about a quarter size you can still name the core mechanic, and the key object fills a meaningful part of the frame.
   - c. **Value contrast:** key gameplay objects stand clear of the background. No near-black bodies on a dark sky.
   - d. **Effects as intended:** trails, glows and transparency read soft. There are no opaque bars, black halos or z-fighting.
   - e. **UI legible:** HUD text sits on top, is not covered by world geometry, and is readable at headset scale.
   - f. **State hygiene:** end cards and transitions show no leftover objects from the previous state.
   - g. **Text matches image:** every caption, GAME.md line or evidence-row text that describes the image or the controls is true.
4. **Grade the answers.**
   - A 'no' on a, b or c is must-fix for craft.
   - A 'no' on d, e, f or g is must-fix if it shows in the hero or in the first-60-seconds stills. Otherwise it is should-fix.
5. **Turn each 'no' into one fix line** with three parts:
   - the likely file:line, found by grepping the material, colour or overlay;
   - the PNG to regenerate;
   - a check the worker can measure. Examples: the hero is captured from the canvas with the DOM overlay hidden; the mean luminance of the object region minus the background is above a stated number; the HUD's draw order or renderOrder is last.
6. **Merge and send once.** Put the fix lines into the one merged fix message, together with the critique must-fix items and the failed go/no-go lines. Never send them as a separate stream.
7. **Re-check after the fix pass.** Open the new PNGs again and redo the 7 lines. A worker's 'fixed' is not a yes.
8. **Forward the generic lines.** Lines that apply to any game on the same kit (a, e, f, g, the capture method) go to sibling builds in their one forwarded message. Game-specific art points stay with their game.
9. **Record the result.** Note the result in memory and in the plan item for the disk check. Set the expectation as argued: 'if a-c stay no, the audit lands near the 0.70-0.72 plateau'.

## Mistakes to avoid
- Treating a canvas-variance PASS as proof of an in-play frame. A DOM menu over a lit scene passes it.
- Judging colour from memory of an earlier run. Open the current file.
- Writing off colour or contrast faults as 'software renderer'. SwiftShader is wrong about frame time, but it renders colour and alpha correctly enough to judge craft.
- Sending craft fixes before the critique verdict, which makes two messages the worker has to reconcile.
- Letting a craft 'no' survive 2 fix passes unchanged. Record it as a design problem under GAME.md open risks and decide; do not loop.
