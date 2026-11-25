export default async function (input) {
  const { base, pct, price_per_unit, report_units, report_revenue } = input;
  for (const [k, v] of Object.entries({ base, pct, price_per_unit, report_units, report_revenue })) {
    if (typeof v !== 'number' || !isFinite(v)) throw new Error(`${k} must be a finite number`);
  }
  if (base <= 0 || price_per_unit < 0) throw new Error('base must be > 0 and price_per_unit >= 0');
  const correct_units = base * pct / 100;
  const correct_revenue = correct_units * price_per_unit;
  const units_ok = Math.abs(correct_units - report_units) <= Math.max(1e-9, correct_units * 1e-6);
  const rev_ok = Math.abs(correct_revenue - report_revenue) <= Math.max(1e-9, correct_revenue * 1e-6);
  const ratio = report_revenue > 0 ? report_revenue / correct_revenue : null;
  return {
    correct_units,
    correct_revenue,
    units_ok,
    revenue_ok: rev_ok,
    report_vs_correct_ratio: ratio,
    verdict: units_ok && rev_ok ? 'OK' : `WRONG: report says ${report_units} units / $${report_revenue}; correct is ${correct_units} units / $${correct_revenue}` +
      (ratio && (ratio > 9 || ratio < 1/9) ? ' (order-of-magnitude error)' : '')
  };
}