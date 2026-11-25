import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

function decodePNG(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG file');
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!w || !h) throw new Error('missing IHDR');
  if (bitDepth !== 8) throw new Error('unsupported bit depth ' + bitDepth);
  if (interlace !== 0) throw new Error('interlaced PNG not supported');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('unsupported color type ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const line = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const r = raw[pos + x];
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v;
      switch (filter) {
        case 0: v = r; break;
        case 1: v = r + a; break;
        case 2: v = r + b; break;
        case 3: v = r + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = r + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error('bad filter ' + filter + ' at row ' + y);
      }
      line[x] = v & 0xff;
    }
    pos += stride;
  }
  return { w, h, channels, data: out };
}

export default async function (input) {
  const file = path.resolve(process.cwd(), input.file);
  if (!file.startsWith(process.cwd())) throw new Error('file outside working folder');
  const img = decodePNG(fs.readFileSync(file));
  const x0 = Math.max(0, Math.min(img.w - 1, input.x | 0));
  const y0 = Math.max(0, Math.min(img.h - 1, input.y | 0));
  const cw = Math.max(1, Math.min(img.w - x0, (input.w == null ? img.w - x0 : input.w) | 0));
  const chh = Math.max(1, Math.min(img.h - y0, (input.h == null ? img.h - y0 : input.h) | 0));
  const px = (x, y) => {
    const i = (y * img.w + x) * img.channels;
    return [img.data[i], img.data[i + 1] || img.data[i], img.data[i + 2] || img.data[i]];
  };
  const luma = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  if (input.mode === 'stats') {
    let sum = 0, clipped = 0, n = 0;
    const mean = [0, 0, 0];
    for (let y = y0; y < y0 + chh; y++) for (let x = x0; x < x0 + cw; x++) {
      const c = px(x, y); n++;
      sum += luma(c);
      mean[0] += c[0]; mean[1] += c[1]; mean[2] += c[2];
      if (c[0] >= 250 && c[1] >= 250 && c[2] >= 250) clipped++;
    }
    return {
      image: { w: img.w, h: img.h, channels: img.channels },
      crop: { x: x0, y: y0, w: cw, h: chh },
      meanLuma: +(sum / n).toFixed(4),
      meanRGB: mean.map((v) => +(v / n).toFixed(1)),
      clippedWhiteFrac: +(clipped / n).toFixed(4),
    };
  }
  const cols = Math.max(8, input.cols || 100), rows = Math.max(4, input.rows || 40);
  const ramp = input.ramp || ' .:-=+*#%@';
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let lineStr = '';
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const sx = x0 + Math.floor((cIdx + 0.5) * cw / cols);
      const sy = y0 + Math.floor((r + 0.5) * chh / rows);
      const v = luma(px(Math.min(sx, x0 + cw - 1), Math.min(sy, y0 + chh - 1)));
      lineStr += ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))];
    }
    lines.push(lineStr);
  }
  return { image: { w: img.w, h: img.h }, crop: { x: x0, y: y0, w: cw, h: chh }, ascii: lines.join('\n') };
}