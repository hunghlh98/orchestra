// hooks/lib/rate-card.js
// Token → USD rate card (Anthropic published list price per million tokens).
// orchestra v2.* ships Claude Opus 4.7 as the default for every agent (see
// agents/*.md frontmatter), so the rate card is single-model. Consumers
// running a different model mix should edit RATES_USD_PER_MTOK below — this
// is the single source of truth; metrics-collector.js persists the computed
// USD into tokens.jsonl rows and runs/<id>.json so display scripts read
// pre-computed values rather than recomputing from a duplicated rate table.
//
// Anthropic's API does NOT return USD in `usage` — only token counts. USD
// is therefore necessarily a derivation: tokens × rate / 1_000_000. The
// hook persists the result at write time so historical runs reflect the
// rate-card-at-time-of-emit, not the rate-card-at-time-of-display.

export const RATES_USD_PER_MTOK = {
  input: 15.0,        // Opus 4.7 input
  output: 75.0,       // Opus 4.7 output
  cache_read: 1.5,    // Opus 4.7 cache hit (~10% of input)
  cache_create: 18.75, // Opus 4.7 cache write (~125% of input)
};

export function computeUsd(tokens) {
  if (!tokens || typeof tokens !== "object") return 0;
  let cost = 0;
  for (const [key, rate] of Object.entries(RATES_USD_PER_MTOK)) {
    cost += ((tokens[key] || 0) / 1_000_000) * rate;
  }
  // Round to four decimals — sub-cent precision, avoids float-printing noise.
  return Math.round(cost * 10000) / 10000;
}
