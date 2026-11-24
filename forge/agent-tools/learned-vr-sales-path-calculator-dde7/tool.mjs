export default async function (input) {
  const { price_usd, target_net_usd = 10000000, commission_rate = 0.30, quest_mau = 18000000, review_multiplier = 110, estimated_reviews } = input;

  if (!price_usd || price_usd <= 0) throw new Error('price_usd must be a positive number');
  if (commission_rate < 0 || commission_rate >= 1) throw new Error('commission_rate must be between 0 and 1');

  const net_per_sale = price_usd * (1 - commission_rate);
  const copies_needed = Math.ceil(target_net_usd / net_per_sale);
  const pct_of_mau = (copies_needed / quest_mau) * 100;

  let reviews_needed = null;
  let buyers_from_reviews = null;
  if (estimated_reviews) {
    buyers_from_reviews = estimated_reviews * review_multiplier;
    reviews_needed = Math.ceil(copies_needed / review_multiplier);
  }

  const reality_flag = pct_of_mau > 5 ? 'HARD' : pct_of_mau > 1 ? 'STRETCH' : 'PLAUSIBLE';
  const verdict = pct_of_mau > 20 ? 'NOT CREDIBLE for a one-day build' : pct_of_mau > 5 ? 'Requires months of polish + live ops' : 'Credible only with strong execution';

  return {
    price_usd,
    net_per_sale: Math.round(net_per_sale * 100) / 100,
    copies_needed_for_10m_net: copies_needed,
    pct_of_quest_mau: Math.round(pct_of_mau * 100) / 100,
    reviews_needed_at_factor: reviews_needed,
    buyers_from_estimated_reviews: buyers_from_reviews,
    reality_flag,
    verdict,
    assumptions: [
      'Quest MAU ~18M (internal training-camp figures)',
      `Meta commission ${commission_rate * 100}% (${commission_rate === 0.30 ? 'Horizon Store/App Lab' : 'in-headset web'})`,
      `Curran review-to-buyer factor ${review_multiplier}x (75 niche / 110 median / 250 casual)`,
      'Net revenue target after store cut',
      'No discounts, bundles, DLC, or subscriptions modeled',
    ],
  };
}