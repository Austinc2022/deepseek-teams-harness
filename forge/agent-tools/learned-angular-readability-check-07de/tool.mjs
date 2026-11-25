export default async function (input) {
  const { pointSizePt, distanceM, thresholdDeg = 1.0 } = input;
  if (typeof pointSizePt !== "number" || pointSizePt <= 0) throw new Error("pointSizePt must be a positive number");
  if (typeof distanceM !== "number" || distanceM <= 0) throw new Error("distanceM must be a positive number");
  const heightM = pointSizePt * 0.0003528; // 1 pt = 0.3528 mm cap-to-baseline approx
  const angularDeg = 2 * Math.atan(heightM / (2 * distanceM)) * (180 / Math.PI);
  const verdict = angularDeg >= thresholdDeg ? "READABLE" : (angularDeg >= 0.35 ? "MARGINAL" : "NOT READABLE");
  return {
    angularDeg: Number(angularDeg.toFixed(3)),
    thresholdDeg,
    verdict,
    note: verdict === "NOT READABLE" ? "below ~0.35 deg absolute minimum; text will be illegible at this distance" : (verdict === "MARGINAL" ? "between absolute minimum and comfortable reading size" : "meets comfortable reading angular size")
  };
}