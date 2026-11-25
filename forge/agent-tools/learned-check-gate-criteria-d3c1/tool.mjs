export default async function (input) {
  const ev = input.evidence || {};
  const out = [];
  for (const c of input.criteria) {
    const lim = c.limits || {};
    const reasons = [];
    let verdict = 'PASS';
    const fail = (r) => { verdict = 'FAIL'; reasons.push(r); };
    const weak = (r) => { if (verdict === 'PASS') verdict = 'NOT ENOUGH EVIDENCE'; reasons.push(r); };

    if (lim.require_human_testers === true) {
      const humans = ev.human_testers ?? 0;
      const bots = ev.bot_runs ?? 0;
      if (humans < 5) fail(`requires >=5 human testers; evidence shows ${humans} humans, ${bots} bot runs (bot replays excluded)`);
    }
    if (lim.min_restarts !== undefined) {
      if ((ev.restarts ?? 0) < lim.min_restarts) fail(`restarts ${ev.restarts} < required ${lim.min_restarts}`);
    }
    if (lim.min_median_fun !== undefined) {
      if (ev.median_fun === undefined) weak('no median fun rating supplied');
      else if (ev.median_fun < lim.min_median_fun) fail(`median fun ${ev.median_fun} < required ${lim.min_median_fun}`);
    }
    if (lim.max_snap_turn_deg !== undefined) {
      if (ev.snap_turn_deg === undefined) weak('snap turn degrees not stated');
      else if (ev.snap_turn_deg > lim.max_snap_turn_deg) fail(`snap turn ${ev.snap_turn_deg} deg > limit ${lim.max_snap_turn_deg} deg`);
    }
    if (lim.no_smooth_locomotion === true && (ev.smooth_locomotion_deg_s ?? 0) > 0) fail(`smooth locomotion present at ${ev.smooth_locomotion_deg_s} deg/s; plan forbids smooth locomotion`);
    if (lim.no_camera_bob === true && (ev.camera_bob_cm ?? 0) > 0) fail(`camera bob ${ev.camera_bob_cm} cm present; plan forbids camera bob/shake`);
    if (lim.tool_scale_1to1 === true) {
      if (ev.tool_scale === undefined) weak('tool scale not stated');
      else if (Math.abs(ev.tool_scale - 1) > 1e-6) fail(`tool scale ${ev.tool_scale}x; plan requires 1:1`);
    }
    if (lim.max_reach_cm !== undefined) {
      if (ev.reach_cm === undefined) weak('max reach not stated');
      else if (ev.reach_cm > lim.max_reach_cm) fail(`reach ${ev.reach_cm} cm > limit ${lim.max_reach_cm} cm from seated shoulder`);
    }
    if (lim.seated_default === true && ev.seated_default === false) fail('seated mode exists but is OFF by default; plan requires seated by default');
    if (lim.min_fps !== undefined) {
      const scenes = (ev.fps_by_scene || []).filter(s => !lim.require_fps_device || s.device === lim.require_fps_device);
      if (scenes.length === 0) fail(`no fps measurement on required device (${lim.require_fps_device || 'any'})`);
      else {
        const worst = scenes.reduce((a, b) => (a.fps <= b.fps ? a : b));
        if (worst.fps < lim.min_fps) fail(`busiest-scene fps ${worst.fps} on ${worst.device} (${worst.scene}) < required ${lim.min_fps}`);
      }
      const offDevice = (ev.fps_by_scene || []).filter(s => lim.require_fps_device && s.device !== lim.require_fps_device);
      if (offDevice.length) reasons.push(`ignored off-device numbers: ${offDevice.map(s => `${s.device} ${s.fps}fps`).join(', ')}`);
    }
    if (lim.max_first_score_s !== undefined) {
      if (ev.first_score_s === undefined) weak('time to first score not stated');
      else if (ev.first_score_s > lim.max_first_score_s) fail(`first score at ${ev.first_score_s}s > limit ${lim.max_first_score_s}s`);
    }
    if (ev.mandatory_tutorial_before_score === true && /no mandatory text tutorial/i.test(c.text)) fail('mandatory text/tutorial wall before first score');
    if (lim.require_daily_seed === true && ev.daily_seed === false) fail('daily seed missing; plan: no retention hook = fail');
    if (verdict === 'PASS' && reasons.length === 0) reasons.push('all stated numbers within limits');
    out.push({ id: c.id, verdict, reasons });
  }
  return out.map(r => `${r.id}: ${r.verdict} — ${r.reasons.join('; ')}`).join('\n');
}