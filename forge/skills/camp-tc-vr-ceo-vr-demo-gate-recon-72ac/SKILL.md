---
name: camp-tc-vr-ceo-vr-demo-gate-recon-72ac
description: A VR build gate where two demo evaluators disagree (one go, one stop) and someone proposes averaging the scores or picking one report.
---

# Reconcile conflicting VR demo evaluators at a build gate

1. **Do not average scores across conditions.** First line of the analysis: state what each demo actually varied (hardware, build, audio/input path, song/content list, tester population). If demos differ on more than the thing being judged, the two scores are not repeated measurements of one quantity — their average describes no product. A "3.35 pass" is a number that does not exist in any market.

2. **Find the controlled comparison.** Look for a test that changed exactly one variable (e.g., same hardware, fix-only rebuild). That comparison identifies the causal lever (e.g., fun 2.3→3.9 when audio latency went 120→28 ms). Treat a diagnosed, fixable cause as grounds for REVISE, not STOP.

3. **Judge each evaluator on cause, not tone.** The optimistic report is scoped to its condition ("unqualified go" on Quest 3 = go for Quest 3 only). The pessimistic report may be wrong about cause ("core loop broken") while being right that the shipping default path fails. Both can be conditionally correct.

4. **Identify the mass-market target hardware/price point** and require the gate to pass there. Success on the premium headset is not success in the volume market at a mass-market price. If the failing path is the platform default (e.g., stock browser audio), the fix must ship as the product's path, not an opt-in.

5. **Mini-tests are directional only** unless they meet the full demo protocol: sample size, same content list, pre-registered thresholds. n=12 on a different song list at fun 3.9 with a 4.0 bar is not a pass.

6. **Set the re-demo as a pre-registered gate**: exact build, hardware and n per platform (fresh testers, no prior exposure), latency ceiling, fun bar, replay rate, session length, completion rate, comfort (mild/severe nausea bounds), fps floor. State what counts as already proven and exempt from re-testing (e.g., the premium-hardware result).

7. **Budget in two phases**: small capped validation budget now (e.g., 3 weeks / ~8 person-weeks), production budget only after the gate passes. Any threshold miss = STOP, with at most one narrow retry for a single marginal miss (e.g., latency 31–40 ms when the ceiling is 30).

8. **Restate revenue honestly**: convert the sales claim into copies/day arithmetic; benchmark against the verified category leader (lifetime copies and revenue, dated); label $1M/day-type claims not credible; treat $1M/year as a stretch ceiling (gross, before ~30% platform fee), give an argued base range, and count zero revenue before launch and collection. Demo fun scores are not willingness to pay.

Common mistakes: averaging across a hardware/build confound; treating Quest-3-only results as mass-market; accepting a mini-test as a gate pass; letting a producer's "pass either way" memo skip root-cause analysis; quoting an unverified sales note as a planning number.
