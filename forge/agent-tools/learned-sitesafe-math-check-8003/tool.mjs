export default async function (input) {
  const { goal_dollars_per_year, price_per_site_year, closes_per_ae_year = 12, seats_per_site = 40 } = input;
  if (price_per_site_year <= 0) throw new Error("price_per_site_year must be > 0");
  if (closes_per_ae_year <= 0) throw new Error("closes_per_ae_year must be > 0");
  const sites = goal_dollars_per_year / price_per_site_year;
  const seats = sites * seats_per_site;
  const ae_years = sites / closes_per_ae_year;
  return {
    goal_per_day: Math.round(goal_dollars_per_year / 365),
    sites_needed: Math.round(sites),
    seats_needed: Math.round(seats),
    ae_years_needed: Math.round(ae_years * 10) / 10,
    market_share_of_180k: Math.round((sites / 180000) * 1000) / 10,
    years_at_480_sites_per_year: Math.round((sites / 480) * 10) / 10
  };
}