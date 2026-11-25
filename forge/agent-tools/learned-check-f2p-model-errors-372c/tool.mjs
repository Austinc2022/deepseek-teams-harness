export default async function (input) {
  const { dau, dauDerivation = "", arpdau, arpdauBasis = "", iapConversionPct, iapConversionPeriod = "unspecified", iapPrice, storeFeePct, platform, blendedIncludesIAP } = input;
  const flags = [];
  if (/lifetime installs/i.test(dauDerivation)) {
    flags.push("OVERSTATES: DAU derived from lifetime installs. Lifetime installs map to MAU at ~2-10%; DAU is ~10-20% of MAU. And a new entrant does not inherit an incumbent's base.");
  }
  if (blendedIncludesIAP && iapConversionPct != null) {
    flags.push("OVERSTATES: IAP double-counted — blended ARPDAU already includes IAP, yet IAP is added again.");
  }
  if (iapConversionPct != null && iapConversionPeriod === "daily" && iapConversionPct >= 1) {
    const monthly = iapConversionPct / 30;
    flags.push(`OVERSTATES ~30x: ${iapConversionPct}% conversion read as daily. Industry norm is monthly/lifetime. Monthly reading = ${monthly.toFixed(3)}%/day -> purchases/day = ${Math.round(dau * monthly / 100)} vs ${Math.round(dau * iapConversionPct / 100)} claimed.`);
  }
  if (iapConversionPct != null && iapConversionPeriod === "unspecified") {
    flags.push("AMBIGUOUS: conversion period unstated; daily vs monthly changes IAP revenue by ~30x. State both.");
  }
  if (storeFeePct > 0 && /browser|web|webxr/i.test(platform)) {
    flags.push("UNDERSTATES: 30% app-store fee is not charged to a browser game. Web pays 0% store fee on ads; Stripe ~2.9%+30c or merchant-of-record 5-7% on IAP. Correcting raises net.");
  }
  if (arpdau > 0.1 && /webxr|browser/i.test(platform)) {
    flags.push(`OVERSTATES: ARPDAU $${arpdau} benchmarked on ${arpdauBasis || "mobile/native"}. Ads-only mobile casual is $0.01-0.05; WebXR ads are format-limited (no mid-session video in VR). Realistic WebXR ARPDAU $0.01-0.05.`);
  }
  return { flags, summary: flags.length ? flags.length + " error(s) found" : "no flags" };
}