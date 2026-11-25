export default async function (input) {
  if (!input || typeof input !== "object") throw new Error("input must be an object");
  const Z = 1.96;
  function round(x, d) { return Number(x.toFixed(d)); }

  function normCdf(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x >= 0 ? 1 - prob : prob;
  }

  function wilson(k, n, label) {
    if (!Number.isFinite(k) || !Number.isFinite(n)) throw new Error("proportions[" + label + "]: k and n must be finite numbers");
    if (n <= 0) throw new Error("proportions[" + label + "]: n must be > 0, got " + n);
    if (!Number.isInteger(k) || !Number.isInteger(n)) throw new Error("proportions[" + label + "]: k and n must be integers");
    if (k < 0 || k > n) throw new Error("proportions[" + label + "]: k=" + k + " out of range for n=" + n);
    const p = k / n, z2 = Z * Z;
    const denom = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / denom;
    const half = (Z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denom;
    const lo = Math.max(0, center - half), hi = Math.min(1, center + half);
    return {
      label: label, k: k, n: n,
      rate: k + "/" + n + " = " + round(p * 100, 1) + "%",
      ci95: "[" + round(lo * 100, 1) + "%, " + round(hi * 100, 1) + "%]",
      p: round(p, 4)
    };
  }

  function twoProp(k1, n1, k2, n2, label) {
    const pairs = [[k1, "k1"], [n1, "n1"], [k2, "k2"], [n2, "n2"]];
    for (let i = 0; i < pairs.length; i++) {
      if (!Number.isFinite(pairs[i][0])) throw new Error("comparisons[" + label + "]: " + pairs[i][1] + " must be finite");
    }
    if (n1 <= 0 || n2 <= 0) throw new Error("comparisons[" + label + "]: n must be > 0");
    const p1 = k1 / n1, p2 = k2 / n2;
    const pp = (k1 + k2) / (n1 + n2);
    const se = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2));
    if (se === 0) {
      return { label: label, note: "zero standard error (both groups 0% or 100%); no test possible", group1: k1 + "/" + n1, group2: k2 + "/" + n2 };
    }
    const z = (p1 - p2) / se;
    const pval = 2 * (1 - normCdf(Math.abs(z)));
    const sig = Math.abs(z) > Z;
    return {
      label: label,
      group1: k1 + "/" + n1 + " = " + round(p1 * 100, 1) + "%",
      group2: k2 + "/" + n2 + " = " + round(p2 * 100, 1) + "%",
      diff: round((p1 - p2) * 100, 1) + " percentage points (group1 minus group2)",
      z: round(z, 3),
      p_value: Number(pval.toExponential(2)),
      significant_at_0_05: sig,
      reads: sig
        ? "difference is statistically significant at 95% - treat as real, not noise"
        : "difference is NOT significant at 95% at these sample sizes - do not claim a real effect"
    };
  }

  function rev(price, copiesPerDay, feePct, label) {
    if (!Number.isFinite(price) || !Number.isFinite(copiesPerDay)) throw new Error("revenue[" + label + "]: price and copiesPerDay must be finite");
    if (price <= 0) throw new Error("revenue[" + label + "]: price must be > 0");
    if (copiesPerDay < 0) throw new Error("revenue[" + label + "]: copiesPerDay must be >= 0");
    const fee = (feePct == null ? 30 : feePct) / 100;
    if (!(fee >= 0 && fee < 1)) throw new Error("revenue[" + label + "]: platformFeePct must be in [0,100)");
    const perYear = copiesPerDay * 365;
    const gDay = copiesPerDay * price, gYear = perYear * price;
    return {
      label: label,
      assumption: "$" + price + "/copy, " + copiesPerDay + " copies/day, " + round(fee * 100, 1) + "% platform fee",
      copies_per_day: copiesPerDay,
      copies_per_year: perYear,
      gross_per_day: "$" + Math.round(gDay).toLocaleString(),
      gross_per_year: "$" + Math.round(gYear).toLocaleString(),
      net_per_day: "$" + Math.round(gDay * (1 - fee)).toLocaleString(),
      net_per_year: "$" + Math.round(gYear * (1 - fee)).toLocaleString()
    };
  }

  function target(dollars, period, price, feePct, label) {
    if (!Number.isFinite(dollars) || !Number.isFinite(price)) throw new Error("targets[" + label + "]: dollars and price must be finite");
    if (dollars <= 0 || price <= 0) throw new Error("targets[" + label + "]: dollars and price must be > 0");
    if (period !== "day" && period !== "year") throw new Error("targets[" + label + "]: period must be \"day\" or \"year\"");
    const fee = (feePct == null ? 30 : feePct) / 100;
    const grossCopies = dollars / price;
    const netCopies = grossCopies / (1 - fee);
    const grossPerDay = period === "day" ? grossCopies : grossCopies / 365;
    const netPerDay = period === "day" ? netCopies : netCopies / 365;
    return {
      label: label,
      goal: "$" + dollars.toLocaleString() + " per " + period + " at $" + price + "/copy",
      gross_basis_copies_per_period: Math.ceil(grossCopies).toLocaleString(),
      gross_basis_copies_per_day: Math.ceil(grossPerDay).toLocaleString(),
      gross_basis_copies_per_year: Math.ceil(grossPerDay * 365).toLocaleString(),
      net_basis_copies_per_period: Math.ceil(netCopies).toLocaleString(),
      net_basis_copies_per_day: Math.ceil(netPerDay).toLocaleString(),
      net_basis_copies_per_year: Math.ceil(netPerDay * 365).toLocaleString(),
      note: "net basis assumes the " + round(fee * 100, 1) + "% platform fee is paid before you count the target"
    };
  }

  const out = { generated_for: "demo-gate decision arithmetic" };
  if (Array.isArray(input.proportions)) out.proportions = input.proportions.map(function (p) { return wilson(p.k, p.n, p.label); });
  if (Array.isArray(input.comparisons)) out.comparisons = input.comparisons.map(function (c) { return twoProp(c.k1, c.n1, c.k2, c.n2, c.label); });
  if (Array.isArray(input.revenue)) out.revenue = input.revenue.map(function (r) { return rev(r.price, r.copiesPerDay, r.platformFeePct, r.label); });
  if (Array.isArray(input.targets)) out.targets = input.targets.map(function (t) { return target(t.dollars, t.period, t.price, t.platformFeePct, t.label); });
  if (!out.proportions && !out.comparisons && !out.revenue && !out.targets) {
    throw new Error("nothing to compute: supply proportions, comparisons, revenue, or targets");
  }
  return out;
}