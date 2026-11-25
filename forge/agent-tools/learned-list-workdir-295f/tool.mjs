export default async function (input) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = process.cwd();
  const start = path.resolve(root, input.path || '.');
  if (!start.startsWith(root)) throw new Error('path escapes working folder');
  const lines = [];
  function walk(dir, depth) {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { lines.push(`[unreadable] ${dir}: ${e.message}`); return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      const rel = path.relative(root, p);
      if (e.isDirectory()) { lines.push(`dir  ${rel}/`); walk(p, depth + 1); }
      else {
        let size = 0;
        try { size = fs.statSync(p).size; } catch {}
        lines.push(`file ${rel} (${size} bytes)`);
      }
    }
  }
  walk(start, 0);
  return lines.join('\n') || '(empty)';
}