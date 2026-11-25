export default async function (input) {
  const { stations, openHours, sessionMinutes, changeoverMinutes, playersPerSession, ticketPrice, weekdayUtil, weekendUtil, goalPerDay } = input;
  for (const [k, v] of Object.entries({ stations, openHours, sessionMinutes, changeoverMinutes, playersPerSession, ticketPrice, weekdayUtil, weekendUtil, goalPerDay })) {
    if (typeof v !== "number" || !isFinite(v)) throw new Error(`${k} must be a finite number`);
  }
  if (stations <= 0 || openHours <= 0 || sessionMinutes <= 0 || ticketPrice <= 0) throw new Error("stations, openHours, sessionMinutes, ticketPrice must be > 0");
  if (weekdayUtil < 0 || weekdayUtil > 1 || weekendUtil < 0 || weekendUtil > 1) throw new Error("utilisation must be in [0,1]");
  const cycle = sessionMinutes + changeoverMinutes;
  const sessionsPerStation = Math.floor((openHours * 60) / cycle);
  const slotsPerDay = sessionsPerStation * stations * playersPerSession;
  const weeklyTickets = 5 * slotsPerDay * weekdayUtil + 2 * slotsPerDay * weekendUtil;
  const avgTicketsPerDay = weeklyTickets / 7;
  const revPerDay = avgTicketsPerDay * ticketPrice;
  const revPerYear = revPerDay * 365;
  const staffPerDay = 2 * openHours * 22;
  const fixedPerDay = staffPerDay + 9000 / 30.4 + 1000 / 30.4;
  const variableRate = 0.03 + 0.06 + 0.08 + 0.09; // processing, maintenance, marketing, royalty
  const costPerDay = fixedPerDay + revPerDay * variableRate + 20000 / 365 + 55 + 250000 / 5 / 365;
  const margin = (revPerDay - costPerDay) / revPerDay;
  const venuesForGoal = goalPerDay / revPerDay;
  const capital = venuesForGoal * 250000;
  return {
    sessionsPerStationPerDay: sessionsPerStation,
    playerSlotsPerDay: slotsPerDay,
    avgTicketsPerDay: Math.round(avgTicketsPerDay),
    revenuePerDay: Math.round(revPerDay),
    revenuePerYear: Math.round(revPerYear),
    listedFixedPerDay: Math.round(fixedPerDay),
    fullCostPerDay: Math.round(costPerDay),
    contributionMarginPct: Math.round(margin * 1000) / 10,
    contributionPerYear: Math.round((revPerDay - costPerDay) * 365),
    venuesNeededForGoal: Math.round(venuesForGoal * 10) / 10,
    buildoutCapital: Math.round(capital)
  };
}