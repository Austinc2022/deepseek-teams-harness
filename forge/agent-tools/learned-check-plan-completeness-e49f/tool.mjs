export default async function (input) {
  if (!input || typeof input.markdown !== 'string' || input.markdown.length < 200) {
    throw new Error('input.markdown must be a plan string of at least 200 chars');
  }
  const md = input.markdown.toLowerCase();
  const checks = [
    ['scoop verdict', /(keep|re-?scope|kill)/.test(md) && /scoop/.test(md)],
    ['pre-registered demo criteria', /pass\/fail|pass-fail|pre-?registered/.test(md) && /fps|frame/.test(md)],
    ['frame rate number 72', /72/.test(md)],
    ['comfort metric', /discomfort|comfort/.test(md) && /%|\/12/.test(md)],
    ['clarity metric', /clarity/.test(md)],
    ['fun metric', /fun/.test(md)],
    ['PRD', /prd|product requirement/.test(md)],
    ['core loop', /core loop/.test(md)],
    ['exclusions', /exclu|out of scope|non-goal/.test(md)],
    ['monetisation', /moneti|pricing|price/.test(md)],
    ['US price', /\$/.test(md)],
    ['Japan price', /jpy|¥|japan/.test(md)],
    ['Germany price', /eur|€|germany|deutsch/.test(md)],
    ['Brazil price', /brl|r\$|brazil/.test(md)],
    ['architecture three.js', /three\.?js|webxr/.test(md)],
    ['fun proxy caveat', /real players|real-players|caveat/.test(md)],
    ['localisation languages bounded', /localis|localiz/.test(md) && /japanese|ja\b/.test(md) && /german|de\b/.test(md)],
    ['CJK handling', /cjk|kanji|japanese/.test(md)],
    ['externalised strings', /externali/.test(md) && /string/.test(md)],
    ['store route', /horizon store|quest store|new tab page|ntp/.test(md)],
    ['sources cited', /https:\/\//.test(md)],
    ['unverified flags', /unverified/.test(md)],
    ['target regions', /region|us, japan|united states/.test(md)],
    ['milestones', /milestone|m0|m1/.test(md)],
    ['risks with mitigations', /risk/.test(md) && /mitigat/.test(md)],
    ['feasibility sign-off', /sign-?off/.test(md)],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return { total: checks.length, passed: checks.length - missing.length, missing };
}