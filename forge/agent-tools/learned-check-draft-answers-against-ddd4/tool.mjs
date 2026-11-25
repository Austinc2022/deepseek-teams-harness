export default async function (input) {
  const { inventory, answers } = input;
  if (!inventory || typeof inventory !== 'string') throw new Error('inventory must be a string');
  if (!Array.isArray(answers)) throw new Error('answers must be an array of {id, text}');

  const flags = [];
  const inv = inventory.toLowerCase();

  const marketsInPlan = [];
  for (const m of ['us', 'u.s', 'united states', 'eu', 'europe', 'brazil', 'brasil', 'germany', 'deutschland']) {
    if (inv.includes(m)) marketsInPlan.push(m);
  }
  const deniesMarket = /no (eu|european) users|not in the plan|does not apply|not relevant|no .* users at all/i;

  for (const a of answers) {
    const t = (a.text || '').toLowerCase();
    const id = a.id || '?';
    // Contradiction: draft denies a market the plan includes
    if (deniesMarket.test(t)) {
      for (const m of ['eu', 'europe', 'brazil', 'brasil']) {
        if (marketsInPlan.some(x => x.startsWith(m.slice(0, 2))) && t.includes(m.split(' ')[0])) {
          flags.push(`${id}: denies "${m}" but inventory lists it as a target market`);
        }
      }
    }
    // Self-selected ratings
    if (/select (esrb|pegi|classind|lowest)/i.test(a.text || '')) {
      flags.push(`${id}: rating is self-selected; ratings come from the IARC questionnaire in the Meta dashboard`);
    }
    // Privacy policy "not needed"
    if (/not needed|not required/i.test(a.text || '') && /privacy/i.test(a.text || '')) {
      flags.push(`${id}: claims privacy policy not needed; Quest Store requires a privacy policy URL even with zero collection`);
    }
    // Absolute zero-data claim
    if (/no personal data at all|no data is collected/i.test(a.text || '')) {
      flags.push(`${id}: absolute no-data claim — scope to the app and disclose local-only storage (high-score table)`);
    }
    // Localisation "no translation"
    if (/no translation/i.test(a.text || '') || /english copy will be shipped for all/i.test(a.text || '')) {
      flags.push(`${id}: EN-only for localised markets conflicts with consumer-language duties (CRD 2011/83/EU Art.6, BR CDC Art.31)`);
    }
    // Readiness claim
    if (/ready to submit/i.test(a.text || '')) {
      flags.push(`${id}: readiness claim — verify all gates (IARC, hosted policy, legal review, localisation, claims-vs-build) are closed`);
    }
  }
  return { marketsInPlan: [...new Set(marketsInPlan)], flagCount: flags.length, flags };
}