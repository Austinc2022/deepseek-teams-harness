export default async function (input) {
  const out = [];
  for (const l of input.lines) {
    const converted = l.base * (l.ratePct / 100);
    const revenue = converted * l.price;
    const claimed = l.reportClaim;
    const ratio = claimed != null ? claimed / revenue : null;
    out.push(`${l.label}: ${l.base.toLocaleString()} ${l.unit} x ${l.ratePct}% = ${converted.toLocaleString(undefined,{maximumFractionDigits:2})} ${l.unit}; x $${l.price} = $${revenue.toLocaleString(undefined,{maximumFractionDigits:0})}` +
      (claimed != null ? ` | report claims $${claimed.toLocaleString()} -> ${Math.abs(revenue-claimed) < 1 ? "match" : `OFF by ${ratio.toFixed(2)}x (correct total: $${revenue.toLocaleString(undefined,{maximumFractionDigits:0})})`}` : ""));
  }
  const p = input.pricePerUnit;
  const yr = input.targetYearDollars, dy = input.targetDayDollars;
  const yrUnits = yr / p, dyUnits = (dy * 365) / p;
  out.push(`---`);
  out.push(`$${yr.toLocaleString()}/yr at $${p}/unit = ${yrUnits.toFixed(1)} units/yr (~${(yrUnits/365).toFixed(2)}/day)`);
  out.push(`$${dy.toLocaleString()}/day (= $${(dy*365).toLocaleString()}/yr) at $${p}/unit = ${Math.ceil(dyUnits).toLocaleString()} units installed (${(dyUnits/365).toFixed(0)}/day signing for a year)`);
  return out.join("\n");
}