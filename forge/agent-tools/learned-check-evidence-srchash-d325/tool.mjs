import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export default async function (input) {
  const root = path.resolve(input.root || 'rc');
  const srcDir = path.join(root, 'src');
  if (!fs.existsSync(srcDir)) throw new Error('no src dir at ' + srcDir);
  // gate-lite header() semantics: listTree(src) sorted, skip dotfiles, hash path then bytes
  const walk = (d) => {
    const out = [];
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const rel = path.relative(srcDir, p).split(path.sep).join('/');
      if (e.isDirectory()) out.push(...walk(p));
      else out.push(rel);
    }
    return out;
  };
  const files = walk(srcDir).filter((x) => !x.startsWith('.')).sort();
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(f).update(fs.readFileSync(path.join(srcDir, f)));
  const computed = h.digest('hex');
  const newestSrcMs = Math.max(...files.map((f) => fs.statSync(path.join(srcDir, f)).mtimeMs));
  const evDir = path.join(root, 'evidence');
  const headers = [];
  for (const f of fs.readdirSync(evDir).filter((x) => x.endsWith('.json')).sort()) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(evDir, f), 'utf8')); } catch { headers.push({ file: f, error: 'unparsable' }); continue; }
    const hd = j.header;
    const started = (hd && hd.startIso) || j.started || j.generatedAt || null;
    headers.push({
      file: f,
      srcHash: hd ? hd.srcHash : null,
      hashMatchesCurrentSrc: hd ? hd.srcHash === computed : null,
      startIso: started,
      newerThanNewestSrc: started ? (Date.parse(started) > newestSrcMs) : null
    });
  }
  return {
    computedSrcHash: computed,
    srcFileCount: files.length,
    newestSrcIso: new Date(newestSrcMs).toISOString(),
    headers
  };
}