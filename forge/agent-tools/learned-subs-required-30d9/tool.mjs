export default async function (input) {
  const { target_per_day_usd, monthly_price_usd, monthly_churn_pct, mau, platform_fee_pct = 30, cac_usd = 20, days = 365 } = input;
  if (monthly_price_usd <= 0) throw new Error("monthly_price_usd must be > 0");
  if (monthly_churn_pct < 0 || monthly_churn_pct >= 100) throw new Error("monthly_churn_pct must be in [0,100)");
  if (mau <= 0) throw new Error("mau must be > 0");
  const annual_price = monthly_price_usd * 12;
  const target_per_year = target_per_day_usd * days;
  const subs = target_per_year / annual_price;
  const payments_per_day = target_per_day_usd / monthly_price_usd;
  const pct_mau = (subs / mau) * 100;
  const churn = monthly_churn_pct / 100;
  const adds_per_month = subs * churn;
  const adds_per_day = adds_per_month / 30.4;
  const ua_per_month = adds_per_month * cac_usd;
  const ua_per_year = ua_per_month * 12;
  const net_arpu_active_year = annual_price * (1 - platform_fee_pct / 100);
  const avg_life_months = churn > 0 ? 1 / churn : Infinity;
  const ltv_gross = churn > 0 ? monthly_price_usd / churn : Infinity;
  return {
    target_per_year_usd: Math.round(target_per_year),
    required_active_subscribers: Math.round(subs),
    subscription_payments_per_day: Math.round(payments_per_day),
    pct_of_mau: +pct_mau.toFixed(3),
    churn_replacement_adds_per_month: Math.round(adds_per_month),
    churn_replacement_adds_per_day: Math.round(adds_per_day),
    implied_ua_spend_per_month_usd: Math.round(ua_per_month),
    implied_ua_spend_per_year_usd: Math.round(ua_per_year),
    gross_arpu_active_year_usd: +annual_price.toFixed(2),
    net_arpu_active_year_usd: +net_arpu_active_year.toFixed(2),
    avg_subscriber_life_months: isFinite(avg_life_months) ? +avg_life_months.toFixed(1) : "infinite (0% churn)",
    ltv_gross_usd: isFinite(ltv_gross) ? Math.round(ltv_gross) : "infinite (0% churn)"
  };
}