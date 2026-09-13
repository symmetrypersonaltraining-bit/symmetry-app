/**
 * WHAT A TOKEN COSTS, SO THE APP CAN COUNT ITS OWN SPEND.
 *
 * Anthropic first-party API rates, US dollars per million tokens. These are
 * the only two models the app calls — see `modelFor` in anthropic.ts, and the
 * note there about why the split is by JOB rather than by importance.
 *
 * THESE ARE A COPY, AND COPIES GO STALE. They exist because there is no
 * balance or price endpoint to read at runtime, and an estimate built on a
 * wrong rate is worse than no estimate. Anything that consumes them is
 * labelled an estimate for the same reason. If a model is added to the app,
 * add it here in the same commit or its spend silently counts as zero —
 * `costOf` returns 0 for an unknown model on purpose, because guessing a rate
 * for a model nobody priced would be the worse failure.
 */
export const PRICES_PER_MTOK = {
  "claude-sonnet-4-6": { in: 3.0, out: 15.0 },
  "claude-haiku-4-5": { in: 1.0, out: 5.0 },
} as const;

export type PricedModel = keyof typeof PRICES_PER_MTOK;
