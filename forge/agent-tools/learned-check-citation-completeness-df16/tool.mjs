export default async function (input) {
  const { citations, required_count } = input;
  if (!Array.isArray(citations) || typeof required_count !== 'number' || required_count < 1) {
    throw new Error('Need citations: string[] and required_count: number >= 1');
  }
  const lines = [];
  let ok = 0;
  for (const raw of citations) {
    const s = String(raw);
    const urlMatch = s.match(/https?:\/\/[^\s,)]+/i);
    const hasUrl = !!urlMatch;
    const urlValid = hasUrl && !/https?:\/\/[^/\s]*\.(example|test|invalid|localhost)\b/i.test(urlMatch[0]) && !/https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(urlMatch[0]);
    const hasDate = /\b(19|20)\d{2}\b/.test(s) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(s);
    const passes = urlValid && hasDate;
    if (passes) ok++;
    lines.push(`${passes ? 'PASS' : 'FAIL'} | url=${hasUrl ? (urlValid ? 'valid' : 'placeholder/unresolvable') : 'missing'} date=${hasDate ? 'yes' : 'missing'} | ${s}`);
  }
  return {
    summary: `${ok}/${citations.length} citations have both a valid URL and a date; need >= ${required_count}: ${ok >= required_count ? 'PASS' : 'FAIL'}`,
    detail: lines.join('\n')
  };
}