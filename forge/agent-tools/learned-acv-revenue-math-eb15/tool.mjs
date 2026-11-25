export default async function (input) {
  const { monthly_price_per_site, tam_sites, site_counts = [], targets_yearly = [1000000, 365000000] } = input;
  if (!(monthly_price_per_site > 0)) throw new Error("monthly_price_per_site must be > 0");
  if (!(tam_sites > 0)) throw new Error("tam_sites must be > 0");
  const yearly = monthly_price_per_site * 12;
  const lines = [];
  for (const n of site_counts) {
    lines.push(`${n} sites: $${(n * monthly_price_per_site).toLocaleString()}/mo = $${(n * yearly).toLocaleString()}/yr`);
  }
  for (const t of targets_yearly) {
    const sites = t / yearly;
    lines.push(`$${t.toLocaleString()}/yr needs ${Math.ceil(sites).toLocaleString()} sites (${(100 * sites / tam_sites).toFixed(2)}% of ${tam_sites.toLocaleString()} TAM)`);
  }
  return lines.join("\n");
}