export default async function (input) {
  const p = input.price_usd, d = input.target_per_day_usd, y = input.target_per_year_usd;
  if (!(p > 0)) throw new Error("price_usd must be > 0");
  const fee = (input.platform_fee_pct ?? 30) / 100;
  return {
    per_day_copies: Math.round(d / p),
    per_day_yearly_copies: Math.round((d / p) * 365),
    per_year_copies: Math.round(y / p),
    per_year_per_day_copies: Math.round(y / p / 365),
    net_per_day: Math.round(d * (1 - fee)),
    net_per_year: Math.round(y * (1 - fee))
  };
}