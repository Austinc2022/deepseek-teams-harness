import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

export default async function (input) {
  const root = process.cwd();
  const rel = (input && input.path) || '.';
  const maxDepth = (input && input.maxDepth) || 4;
  const target = resolve(root, rel);
  if (!target.startsWith(root)) throw new Error('path escapes working folder: ' + rel);
  const lines = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch (e) { lines.push('(unreadable: ' + dir + ' ' + e.message + ')'); return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, e.name);
      const relPath = p.slice(root.length + 1) || '.';
      if (e.isDirectory()) {
        lines.push(relPath + '/');
        walk(p, depth + 1);
      } else {
        try { lines.push(relPath + '  (' + statSync(p).size + ' bytes)'); }
        catch { lines.push(relPath + '  (stat failed)'); }
      }
    }
  }
  walk(target, 0);
  return 'Working folder: ' + root + '\n' + lines.join('\n');
}