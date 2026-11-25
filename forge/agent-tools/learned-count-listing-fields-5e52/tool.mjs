export default async function (input) {
  if (!input || typeof input !== 'object') throw new Error('input must be an object with a fields map');
  const f = input.fields;
  if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error('input.fields must be an object of field-name -> string');
  const names = Object.keys(f);
  if (names.length === 0) throw new Error('input.fields is empty');
  const limit = (typeof input.limit === 'number' && input.limit > 0) ? input.limit : null;
  const lines = [];
  let totalChars = 0;
  for (const name of names) {
    const text = f[name];
    if (typeof text !== 'string') throw new Error(`field "${name}" must be a string, got ${typeof text}`);
    const chars = [...text].length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    totalChars += chars;
    let flag = '';
    if (limit !== null && chars > limit) flag = `  OVER LIMIT by ${chars - limit}`;
    lines.push(`${name}: ${chars} chars, ${words} words${flag}`);
  }
  lines.push(`TOTAL: ${totalChars} chars across ${names.length} fields` + (limit !== null ? ` (limit checked: ${limit})` : ''));
  return lines.join('\n');
}