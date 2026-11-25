export default async function (input) {
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const out = [];
  for (const c of input.checks) {
    if (c.kind === "size_to_deg") {
      if (!(c.distance_m > 0)) throw new Error("size_to_deg needs distance_m > 0");
      let mm = 0;
      if (typeof c.cm === "number") mm = c.cm * 10;
      else if (typeof c.pt === "number") mm = (c.pt / 72) * 25.4;
      else throw new Error("size_to_deg needs cm or pt");
      const deg = toDeg(Math.atan(mm / 10 / (c.distance_m * 100)) * 1);
      out.push({ kind: c.kind, input_mm: +mm.toFixed(2), distance_m: c.distance_m, degrees: +toDeg(Math.atan(mm / (c.distance_m * 1000))).toFixed(3) });
    } else if (c.kind === "deg_to_cm") {
      if (!(c.degrees > 0) || !(c.distance_m > 0)) throw new Error("deg_to_cm needs degrees > 0 and distance_m > 0");
      const cm = Math.tan(toRad(c.degrees)) * c.distance_m * 100;
      out.push({ kind: c.kind, degrees: c.degrees, distance_m: c.distance_m, cm: +cm.toFixed(1) });
    } else if (c.kind === "gaze_deg") {
      if (!(c.distance_m > 0)) throw new Error("gaze_deg needs distance_m > 0");
      const rise = c.target_height_m - c.eye_height_m;
      out.push({ kind: c.kind, rise_m: +rise.toFixed(2), distance_m: c.distance_m, degrees: +toDeg(Math.atan(rise / c.distance_m)).toFixed(1) });
    } else {
      throw new Error("unknown kind: " + c.kind);
    }
  }
  return out;
}