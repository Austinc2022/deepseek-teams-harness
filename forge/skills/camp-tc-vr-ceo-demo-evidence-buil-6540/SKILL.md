---
name: camp-tc-vr-ceo-demo-evidence-buil-6540
description: When making a go / revise-demos / stop build decision from VR/WebXR demo evaluations with measured tester behaviour and a revenue target to be honest about.
---

# Demo-evidence build gate

1. **Rank evidence types.** Only measured behaviour counts as fun evidence: repeat play counts, completion, session length, unprompted replay intent, fps/nausea readings. Adjectives ("relaxing", "visually impressive") and stakeholder opinions (art director, producer memos) are explicitly NOT evidence — quote them only to mark them as excluded.
2. **Per-demo verdict on the funnel.** For each demo compute: did testers repeat the core behaviour unprompted; did sessions last; would they replay; did it hit the fps target; what was the discomfort rate. A demo fails if replay intent is near zero OR it misses the fps target OR most testers report lag/discomfort — even if a stakeholder loves it.
3. **Cut with re-demo thresholds, not vague hope.** For each cut feature, write numeric thresholds that would reverse the cut (e.g. n>=20, fun >=4.0/5, >=70% replay, mean session >=8 min). Small n excuses nothing when all measures point the same way (e.g. 0/8 replay + 6/8 lag + 48 fps).
4. **Scope = only demo-proven fun + mandated platform items.** Mandated items (comfort options, fps target, first-60s core loop, platform fallbacks) are labelled "mandate, not demo evidence" honestly. Never let a mandated item borrow a demo's credibility.
5. **Effort budget with kill gates.** Cap person-weeks (team size x weeks). Milestones every ~3 weeks with PRE-REGISTERED playtest thresholds (n, repeat-play %, mean session, fun rating, discomfort rate) and a kill rule: miss thresholds twice => stop before marketing spend.
6. **Revenue honesty against BOTH benchmarks.** State the copies/day arithmetic for $1M/day and $1M/year at the assumed price. Then say plainly: lab fun of n~24 measures zero demand — no purchase intent, no market size, no retention beyond one session. The lower benchmark may be an upside scenario, never an expectation. Plan base case near zero revenue until a store/wishlist signal exists.
7. **Write "what the demos do and do not support"** as its own section. Gaps to check every time: desktop/browser performance if only headset was tested; multi-day retention; willingness to pay; first-60s if not timed.
