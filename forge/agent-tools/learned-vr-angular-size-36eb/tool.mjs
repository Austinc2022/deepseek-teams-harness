export default async function (input) {
  const items = input.items;
  if (!Array.isArray(items) || items.length === 0) throw new Error("items must be a non-empty array");
  const rows = items.map(function (it) {
    const h = it.height_m, d = it.distance_m;
    if (!(h > 0)) throw new Error("height_m must be > 0 for " + it.name);
    if (!(d > 0)) throw new Error("distance_m must be > 0 for " + it.name);
    const angleRad = 2 * Math.atan(h / (2 * d));
    const angleDeg = angleRad * 180 / Math.PI;
    let verdict = "FAIL";
    if (angleDeg >= 2.0) verdict = "OK-preferred";
    else if (angleDeg >= 1.5) verdict = "OK-minimum";
    else if (angleDeg >= 1.0) verdict = "marginal";
    return { name: it.name, height_mm: h * 1000, distance_m: d, angle_deg: Math.round(angleDeg * 1000) / 1000, verdict: verdict };
  });
  let out = { rows: rows };
  if (input.target) {
    const a = input.target.angle_deg * Math.PI / 180, D = input.target.distance_m;
    if (!(a > 0) || !(D > 0)) throw new Error("target angle and distance must be > 0");
    out.target_height_mm = Math.round(2 * D * Math.tan(a / 2) * 1000 * 100) / 100;
  }
  return out;
}