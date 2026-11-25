export default async function (input) {
  const {
    chapters, totalMinutesStated, autoAdvanceSeconds,
    voDeliveredChapters, voTotalSeconds,
    avatarRadiusMeters, doorwayMeters,
    smokeTests, smokePassed, captionsEntries, manifestAudioFiles
  } = input;

  for (const [k, v] of Object.entries(input)) {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`'${k}' must be a finite number`);
  }
  if (chapters <= 0 || voDeliveredChapters <= 0 || smokeTests <= 0) throw new Error("counts must be positive");
  if (voDeliveredChapters > chapters) throw new Error("voDeliveredChapters cannot exceed chapters");
  if (smokePassed > smokeTests) throw new Error("smokePassed cannot exceed smokeTests");

  const lines = [];
  const autoAdvanceTotalSec = chapters * autoAdvanceSeconds;
  const statedTotalSec = totalMinutesStated * 60;
  lines.push(`auto-advance total = ${chapters} x ${autoAdvanceSeconds}s = ${autoAdvanceTotalSec}s (${(autoAdvanceTotalSec/60).toFixed(1)} min) vs stated ${statedTotalSec}s (${totalMinutesStated} min) -> ${autoAdvanceTotalSec === statedTotalSec ? "MATCH" : "MISMATCH of " + Math.abs(autoAdvanceTotalSec - statedTotalSec) + "s"}`);

  const avgVo = voTotalSeconds / voDeliveredChapters;
  lines.push(`avg VO per delivered chapter = ${voTotalSeconds}s / ${voDeliveredChapters} = ${avgVo.toFixed(1)}s vs ${autoAdvanceSeconds}s window -> VO ${avgVo > autoAdvanceSeconds ? "EXCEEDS window by " + (avgVo - autoAdvanceSeconds).toFixed(1) + "s (cut off / overlap)" : "fits window"}`);

  const extrapolatedVo = avgVo * chapters;
  lines.push(`extrapolated VO for all ${chapters} chapters = ${extrapolatedVo.toFixed(0)}s (${Math.floor(extrapolatedVo/60)}:${String(Math.round(extrapolatedVo%60)).padStart(2,"0")}) -> still ${Math.abs(extrapolatedVo - statedTotalSec) < 30 ? "matches" : "does not match"} stated ${totalMinutesStated} min`);

  const avatarDiameter = avatarRadiusMeters * 2;
  lines.push(`avatar diameter = 2 x ${avatarRadiusMeters}m = ${avatarDiameter.toFixed(2)}m vs doorway ${doorwayMeters}m -> ${avatarDiameter <= doorwayMeters ? "passes" : "IMPOSSIBLE: avatar is " + (avatarDiameter - doorwayMeters).toFixed(2) + "m too wide"}`);
  const maxRadius = doorwayMeters / 2;
  lines.push(`fix options: doorway >= ${avatarDiameter.toFixed(2)}m, or avatar radius <= ${maxRadius.toFixed(2)}m`);

  const passPct = (smokePassed / smokeTests) * 100;
  lines.push(`QA pass rate = ${smokePassed}/${smokeTests} = ${passPct.toFixed(1)}%, failures = ${smokeTests - smokePassed}`);

  lines.push(`content coverage: chapters=${chapters}, captions=${captionsEntries}, manifest audio=${manifestAudioFiles}, VO delivered=${voDeliveredChapters} -> shipped coverage = ${manifestAudioFiles}/${chapters} = ${((manifestAudioFiles/chapters)*100).toFixed(1)}%`);
  lines.push(`missing captions = ${chapters - captionsEntries}; missing manifest audio = ${chapters - manifestAudioFiles}; missing VO = ${chapters - voDeliveredChapters}`);

  return lines.join("\n");
}