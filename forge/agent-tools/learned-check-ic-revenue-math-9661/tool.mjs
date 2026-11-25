export default async function (input) {
  const { priceUsd, grossPurchases, refunds, adSpendUsd, emailsCollected, emailsOpened, tamUsdB, tamShareClaimedPct, businessModel } = input;
  if (priceUsd <= 0) throw new Error("priceUsd must be > 0");
  if (grossPurchases < 0 || refunds < 0) throw new Error("purchase/refund counts must be >= 0");
  if (refunds > grossPurchases) throw new Error("refunds cannot exceed gross purchases");
  if (emailsCollected <= 0) throw new Error("emailsCollected must be > 0");
  if (emailsOpened < 0 || emailsOpened > emailsCollected) throw new Error("emailsOpened must be between 0 and emailsCollected");
  if (tamUsdB <= 0) throw new Error("tamUsdB must be > 0");
  if (tamShareClaimedPct < 0 || tamShareClaimedPct > 100) throw new Error("tamShareClaimedPct must be 0-100");

  const net = grossPurchases - refunds;
  const netRev = +(net * priceUsd).toFixed(2);
  const grossRev = +(grossPurchases * priceUsd).toFixed(2);
  const refundPct = grossPurchases > 0 ? +((refunds / grossPurchases) * 100).toFixed(1) : 0;
  const neverOpened = emailsCollected - emailsOpened;
  const openPct = +((emailsOpened / emailsCollected) * 100).toFixed(1);
  const costPerEmail = +(adSpendUsd / emailsCollected).toFixed(3);
  const costPerOpener = emailsOpened > 0 ? +(adSpendUsd / emailsOpened).toFixed(2) : null;
  const revPerAdDollar = adSpendUsd > 0 ? +(netRev / adSpendUsd).toFixed(5) : null;

  const annualUsd = businessModel === "monthly_sub" ? priceUsd * 12 : priceUsd;
  const perYr_1M = Math.ceil(1000000 / annualUsd);
  const perDay_1M = Math.ceil(perYr_1M / 365);
  const perYr_1Mday = Math.ceil(365000000 / annualUsd);
  const perDay_1Mday = Math.ceil(perYr_1Mday / 365);

  const claimedTamUsd = tamUsdB * 1e9 * (tamShareClaimedPct / 100);
  const claimedPerDay = claimedTamUsd / 365;
  const tamClaimHoldsFor1Mday = claimedTamUsd >= 365000000;
  const shareNeededFor1Mday = +((365000000 / (tamUsdB * 1e9)) * 100).toFixed(4);

  return {
    paidDemand: { grossPurchases, refunds, net, grossRev, netRev, refundPct, note: `net ${net} sale(s) = $${netRev}` },
    adEfficiency: { neverOpened, openPct, costPerEmail, costPerOpener, revPerAdDollar, note: revPerAdDollar !== null ? `$${netRev} revenue per $1 of ads` : "n/a" },
    gaps: {
      to1MPerYear: { targetUsd: 1000000, perYearUnits: perYr_1M, perDayUnits: perDay_1M, multipleOfNetRev: netRev > 0 ? Math.round(1000000 / netRev) : "infinite (no revenue)" },
      to1MPerDay: { targetUsd: 365000000, perYearUnits: perYr_1Mday, perDayUnits: perDay_1Mday, multipleOfNetRev: netRev > 0 ? Math.round(365000000 / netRev) : "infinite (no revenue)" }
    },
    tamCheck: {
      claimedShareUsd: Math.round(claimedTamUsd),
      claimedPerDay: Math.round(claimedPerDay),
      claimSays1MdayIsConservativeButClaimHolds: tamClaimHoldsFor1Mday,
      marketSharePctNeededFor1Mday: shareNeededFor1Mday
    }
  };
}