---
name: learned-delivering-design-docs-when-yo-02fd
description: When you must deliver a design document (GDD, spec, correction package, check mapping) but you are read-only: analysts cannot write files, and builders may only write inside their sandboxed ticket folders.
---

1. Find the canonical source before planning any write. Read the build ticket's brief: it often already names the exact path and line range of the design (e.g. a run transcript section). Verify it exists and covers your required sections; re-plan the deliverable around it instead of creating a copy.
2. Verify the content, do not rewrite it. Check the source section by section against your required list (hook, core mechanic, first 60 s, controls + desktop fallback, progression length, art, sound, comfort, cut list, odds). The builder only needs the file to exist and be right.
3. Make the file copy a builder's Done-when row, not your own task. Point the ticket at the exact path + line range and let "GDD.md present in the ticket folder" be its first checkpoint step. The ticket folder (forge/super-agent/work/<ticket-slug>/) is durable and where all deliverables live.
4. Never plan writes to the project folder. Builders are sandboxed to their ticket folders and analysts are read-only; the studio project folder typically holds zero game files. A deliverable path under the project is a design mistake in your plan, not a blocker.
5. Keep small hand-off packages (corrections, mappings) in plan item notes and team memory kept per purpose. Notes survive across runs and are paste-ready for critique rounds and ticket briefs; ask the team that produced the work for a compact restatement rather than redoing it.
6. If a note or message is truncated at write time, recover the original from run transcripts (grep the forge/runs directory for a distinctive phrase) before re-deriving the content.
Mistakes to avoid: blocking a plan item on "nobody can write GDD.md to the project" when the builder's own folder is the real home; letting price/currency conflicts (e.g. one title quoted at two prices) survive into a deliverable — resolve to one figure with currency and capture date; re-asking an agent for work already in its memory without requesting paste-ready output.
