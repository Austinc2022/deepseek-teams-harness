export default async function (input) {
  const { listing_text, facts } = input;
  if (typeof listing_text !== "string" || !listing_text.trim()) throw new Error("listing_text must be a non-empty string");
  if (typeof facts !== "object" || facts === null) throw new Error("facts must be an object");
  const flags = [];
  const text = listing_text;
  const coopMatch = text.match(/\b(co-?op|multiplayer|with a friend|together)\b/i);
  if (coopMatch && (!facts.has_coop || facts.single_player_only)) {
    flags.push({ claim: coopMatch[0], issue: "copy implies multiplayer/co-op but build is single player only" });
  }
  const reviewMatches = [...text.matchAll(/\b(\d[\d,]*)\s*(\+\s*)?(five-?star\s+)?reviews?\b/gi)];
  for (const m of reviewMatches) {
    const claimed = parseInt(m[1].replace(/,/g, ""), 10);
    if (claimed > facts.user_review_count) {
      flags.push({ claim: m[0], issue: `copy claims ${claimed} reviews but fact sheet says ${facts.user_review_count}` });
    }
  }
  const itemMatches = [...text.matchAll(/\b(\d[\d,]*)\s*(\+\s*)?(decoration\s+)?items?\b/gi)];
  for (const m of itemMatches) {
    const claimed = parseInt(m[1].replace(/,/g, ""), 10);
    if (claimed > facts.decoration_item_count) {
      flags.push({ claim: m[0], issue: `copy claims ${claimed} items but build has ${facts.decoration_item_count}` });
    }
  }
  if (/\brated\b|\bESRB\b|\bCERO\b|\bUSK\b|\bGRAC\b|\bClassInd\b/i.test(text) && !facts.rating_certificate) {
    flags.push({ claim: "ratings reference", issue: "copy references a rating but no rating certificate exists yet" });
  }
  return { flag_count: flags.length, flags: flags.length ? flags : "no contradictions found" };
}