export default async function (input) {
  const items = input.draftItems;
  if (!Array.isArray(items) || items.length === 0) throw new Error("draftItems must be a non-empty array of strings");
  const regions = (input.launchRegions || []).map(r => String(r).toLowerCase());
  const langs = (input.launchLanguages || []).map(l => String(l).toLowerCase());
  const flags = [];
  items.forEach((text, i) => {
    const t = String(text).toLowerCase();
    const n = i + 1;
    if (/(esrb|pegi|classind|rating)/.test(t) && /(select|choose|will select|pick)/.test(t)) {
      flags.push(`Item ${n}: hand-picked age rating — ratings are assigned via the IARC questionnaire from truthful content descriptors, not selected by target demographic.`);
    }
    if (t.includes("privacy policy") && /(not needed|not required|unnecessary)/.test(t)) {
      flags.push(`Item ${n}: claims no privacy policy needed — a hosted privacy policy URL is a store requirement regardless of data collection.`);
    }
    if (t.includes("gdpr") && /(does not apply|not applicable|no eu users)/.test(t) && regions.some(r => r.includes("eu") || r.includes("europe") || r.includes("germany") || r.includes("france"))) {
      flags.push(`Item ${n}: denies GDPR while EU is a launch region — BLOCK-level contradiction with the plan.`);
    }
    if (t.includes("lgpd") && /(not relevant|does not apply|not applicable)/.test(t) && regions.some(r => r.includes("brazil") || r.includes("br"))) {
      flags.push(`Item ${n}: denies LGPD while Brazil is a launch region — BLOCK-level contradiction with the plan.`);
    }
    if (t.includes("no personal data") && t.includes("at all")) {
      flags.push(`Item ${n}: 'no personal data at all' — use 'no data leaves the device' nuance for local high-score tables/user-entered names.`);
    }
    if (/(english)/.test(t) && /(all three regions|all regions|no translation)/.test(t) && langs.some(l => !l.startsWith("en"))) {
      flags.push(`Item ${n}: English-only shipping while the plan lists non-English languages (${input.launchLanguages.join(", ")}).`);
    }
    if (/(ready to submit|only needs to click submit)/.test(t)) {
      flags.push(`Item ${n}: 'Ready to submit' status claim — submission is the owner's act; legal review and IARC ratings must come first.`);
    }
    if (t.includes("children") && /(no special handling|not needed)/.test(t)) {
      flags.push(`Item ${n}: children's-data handling dismissed based on age target — 10+ still includes children; disclose no-data-from-any-user instead.`);
    }
  });
  return flags.length ? flags.join("\n") : "No contradictions flagged (still verify claims against the build manually).";
}