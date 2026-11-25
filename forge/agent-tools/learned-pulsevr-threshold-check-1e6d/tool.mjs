export default async function (input) {
  const p = input.price_per_month, fee = (input.platform_fee_pct ?? 0) / 100;
  const base = input.addressable_base;
  if (p <= 0 || base <= 0) throw new Error("price and base must be positive");
  const grossYr = p * 12;
  const vat = (input.vat_pct_on_eu ?? 0) / 100, eu = input.eu_share ?? 0;
  const netMoGross = p * (1 - fee);
  const euNetMo = vat > 0 ? (p / (1 + vat)) * (1 - fee) : netMoGross;
  const blendedNetMo = netMoGross * (1 - eu) + euNetMo * eu;
  const blendedNetYr = blendedNetMo * 12;
  const rows = [];
  for (const goal of [1e6, 365e6]) {
    rows.push({
      goal: goal === 1e6 ? "$1M/year" : "$1M/day ($365M/yr)",
      subs_gross: Math.ceil(goal / grossYr),
      subs_net_30pct: Math.ceil(goal / (p * 12 * (1 - fee))),
      subs_net_blended: vat > 0 ? Math.ceil(goal / blendedNetYr) : null,
      share_of_base_gross: +(goal / grossYr / base * 100).toFixed(2) + "%",
    });
  }
  let churnAdj = null;
  if (input.claimed_subscribers && input.monthly_churn_pct != null) {
    const c = input.monthly_churn_pct / 100;
    const paidMonths = (1 - Math.pow(1 - c, 12)) / c;
    churnAdj = {
      claimed_gross: Math.round(input.claimed_subscribers * grossYr),
      churn_adj_gross: Math.round(input.claimed_subscribers * p * paidMonths),
      churn_adj_net: Math.round(input.claimed_subscribers * blendedNetMo * paidMonths),
      avg_paid_months_yr1: +paidMonths.toFixed(2),
    };
  }
  return { gross_year_per_sub: grossYr, net_year_per_sub_blended: +blendedNetYr.toFixed(2), rows, churnAdj };
}