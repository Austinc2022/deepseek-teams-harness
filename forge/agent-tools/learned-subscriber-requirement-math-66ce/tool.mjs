export default async function (input) {
  const { monthlyPrice, hardwarePrice, waitlist, deposits, retainedPayers, targets } = input;
  if (monthlyPrice <= 0 || hardwarePrice < 0 || waitlist < 0 || deposits < 0 || retainedPayers < 0) throw new Error("all numeric inputs must be non-negative and monthlyPrice > 0");
  const arpu = monthlyPrice * 12;
  const y1PerSub = arpu + hardwarePrice;
  const out = [];
  for (const rate of [0.01, 0.03, 0.05, 0.08]) {
    const subs = Math.round(waitlist * rate);
    out.push({ rate, subs, recurring: Math.round(subs * arpu), y1Gross: Math.round(subs * y1PerSub) });
  }
  const retRate = deposits > 0 ? retainedPayers / deposits : 0;
  const lines = out.map(r => `${(r.rate*100).toFixed(0)}% of ${waitlist} = ${r.subs} subs -> recurring $${r.recurring.toLocaleString()}/yr, y1 gross $${r.y1Gross.toLocaleString()}`).join("; ");
  const targetLines = targets.map(t => `$${t.toLocaleString()}/yr needs ${Math.ceil(t/arpu).toLocaleString()} subs recurring, or ${Math.ceil(t/y1PerSub).toLocaleString()} new subs counting hardware in y1`).join("; ");
  const ceiling = Math.round(waitlist * arpu);
  return `ARPU $${arpu}/yr + $${hardwarePrice} hardware = $${y1PerSub}/sub y1. Range: ${lines}. Retained-payer rate ${(retRate*100).toFixed(1)}% (${retainedPayers}/${deposits}). Targets: ${targetLines}. 100% waitlist conversion ceiling = $${ceiling.toLocaleString()}/yr recurring.`;
}