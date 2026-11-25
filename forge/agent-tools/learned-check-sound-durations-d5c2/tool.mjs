export default async function (input) {
  if (!input || typeof input.markdown !== 'string') throw new Error('markdown string required');
  const rows = [];
  for (const line of input.markdown.split('\n')) {
    const m = line.match(/^\|\s*([a-z0-9_]+)\s*\|.*?\|\s*(\d+)\s*ms\s*\|\s*(feedback|state)\s*\|/i);
    if (m) rows.push({ id: m[1], ms: parseInt(m[2], 10), kind: m[3].toLowerCase() });
  }
  if (rows.length === 0) throw new Error('no | id | ... | <n> ms | feedback/state | rows found');
  const results = rows.map(r => ({
    id: r.id, ms: r.ms, kind: r.kind,
    ok: r.kind === 'state' || r.ms < 800,
    note: r.kind === 'state' ? 'exempt (state/loop sound)' : (r.ms < 800 ? 'under 800 ms' : 'EXCEEDS 800 ms cap')
  }));
  const bad = results.filter(r => !r.ok);
  return {
    rows: results,
    feedbackCount: results.filter(r => r.kind === 'feedback').length,
    violations: bad.map(r => `${r.id}=${r.ms}ms`),
    verdict: bad.length === 0 ? 'PASS: all feedback cues < 800 ms' : 'FAIL: ' + bad.length + ' cue(s) over cap'
  };
}