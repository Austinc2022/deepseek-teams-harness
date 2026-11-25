---
name: camp-tc-devils-advocate-red-team-3cff
description: When reviewing another agent's demand/economics evaluation, funding memo, or revenue projection and you must decide whether the arithmetic, evidence trail and plausibility verdict hold up.
---

# Red-teaming revenue math in an evaluation

1. **Dimensional check every revenue line.** Write out units for each factor: `units × rate × price / period`. Flag any product whose unit changes mid-formula (rooms vs guests vs properties) and any price used across mismatched periods (monthly ARPU applied as a daily yield = ~30x inflation). Recompute with the *actual* pricing model from the source evidence, not a borrowed benchmark ARPU.
2. **Interrogate the base.** Ask: is the base an *installed, paying* base or a TAM/market-size number? Market reports that "count rooms, not buyers" cannot be multiplied by conversion rates. The correct base for a license model is paying properties; for usage pricing, paying sessions.
3. **Check the two targets separately.** If both $/day and $/year targets are required, produce explicit unit counts for each (e.g., properties needed = target / annual contract value). If the evaluation gives a percentage ("achievable at 0.4%") without multiplication, treat it as missing work and reverse-engineer it — inconsistencies between the two targets usually reveal a hidden unit flip.
4. **Test against an absolute ceiling.** Multiply the total addressable inventory by the best supported price and conversion to get the mathematical maximum. If the headline claim exceeds that ceiling even at 100% penetration, the claim is falsified by the evidence itself. Quote it.
5. **Separate realized revenue from stated intent.** Transactions, signed contracts and renewals are evidence; "would try"/"would pay" survey answers are not. Compute realized revenue first (actual contracts), then scenario ranges. Never average intent into a base case.
6. **Audit the evidence trail.** Every score must cite a figure in the source report with a location; watch for phantom evidence (e.g., "strong demand" appearing in the summary but not in the research) and for missing evidence-quality labels per segment/region.
7. **Demand the kill list.** Require >=3 concrete failure reasons with thresholds and owners, and kill criteria. Absent kill criteria is itself a defect; also check the evaluator didn't list only soft risks (hygiene, capex) while ignoring the data killers (zero paying transactions, unproven renewals).
8. **Verify the plausibility statement against your recompute**, and give a realistic range (y1 / y3 / ceiling) plus the evidence that would flip the decision. State the decision plainly: advance, advance-with-gates, or kill.

**Common mistakes to avoid:** trusting arithmetic that is numerically correct but dimensionally wrong; accepting TAM as an installed base; letting a borrowed ARPU stand in for the product's own prices; approving when no one has actually paid yet.
