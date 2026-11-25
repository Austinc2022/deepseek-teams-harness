export default async function (input) {
  const { deposits, depositPrice, refunded, kept, month2Active, monthlyPrice, segmentSize } = input;
  const stretchSubscribers = input.stretchSubscribers ?? 500;
  const floorPerYear = input.floorPerYear ?? 1_000_000;
  const floorPerDay = input.floorPerDay ?? 1_000_000;
  if (deposits <= 0 || monthlyPrice <= 0 || segmentSize <= 0) throw new Error("deposits, monthlyPrice, segmentSize must be > 0");
  if (refunded + kept !== deposits) throw new Error(`refunded (${refunded}) + kept (${kept}) must equal deposits (${deposits})`);
  const yearly = monthlyPrice * 12;
  const grossCollected = deposits * depositPrice;
  const refundedDollars = refunded * depositPrice;
  const netRetained = kept * depositPrice;
  const runRatePerYear = month2Active * yearly;
  const retentionOfKeepers = kept > 0 ? (month2Active / kept * 100).toFixed(1) + "%" : "n/a";
  const retentionOfDepositors = (month2Active / deposits * 100).toFixed(1) + "%";
  const subsForYearFloor = Math.ceil(floorPerYear / yearly);
  const subsForDayFloor = Math.ceil((floorPerDay * 365) / yearly);
  const segmentCeilingPerYear = segmentSize * yearly;
  const segmentCeilingPerDay = segmentCeilingPerYear / 365;
  const segmentCeilingHitsDayFloor = segmentCeilingPerDay >= floorPerDay;
  const stretchPerYear = stretchSubscribers * yearly;
  const stretchPerDay = stretchPerYear / 365;
  const depositRetentionRate = month2Active / deposits;
  const depositorsNeededForYearFloor = Math.ceil(subsForYearFloor / depositRetentionRate);
  return {
    collected: `gross $${grossCollected.toFixed(0)}; refunded $${refundedDollars.toFixed(0)} (${(refunded/deposits*100).toFixed(1)}%); net kept $${netRetained.toFixed(0)}`,
    retention: `month-2 active = ${month2Active} = ${retentionOfKeepers} of keepers, ${retentionOfDepositors} of depositors`,
    observedRunRate: `$${runRatePerYear.toFixed(0)}/yr if ${month2Active} actives pay $${monthlyPrice}/mo for 12 months (upper bound)`,
    floors: `$${floorPerYear.toLocaleString()}/yr needs ${subsForYearFloor.toLocaleString()} continuously retained subs at $${monthlyPrice}/mo; $${floorPerDay.toLocaleString()}/day ($${(floorPerDay*365/1e6).toFixed(1)}M/yr) needs ${subsForDayFloor.toLocaleString()} subs`,
    funnel: `at observed ${ (depositRetentionRate*100).toFixed(1) }% deposit-to-month-2 retention, ${subsForYearFloor.toLocaleString()} retained subs needs ~${depositorsNeededForYearFloor.toLocaleString()} depositing customers`,
    segmentCeiling: `${segmentSize.toLocaleString()} students x $${monthlyPrice}/mo x 12 = $${(segmentCeilingPerYear/1e6).toFixed(1)}M/yr = $${Math.round(segmentCeilingPerDay).toLocaleString()}/day -> ${segmentCeilingHitsDayFloor ? "reaches" : "DOES NOT reach"} the $${floorPerDay.toLocaleString()}/day floor even at 100% penetration`,
    stretch: `${stretchSubscribers} subs = $${stretchPerYear.toLocaleString()}/yr = $${stretchPerDay.toFixed(0)}/day = ${(stretchPerYear/floorPerYear*100).toFixed(1)}% of the $1M/yr floor, ${(stretchPerYear/(floorPerDay*365)*100).toFixed(2)}% of the $1M/day floor`
  };
}