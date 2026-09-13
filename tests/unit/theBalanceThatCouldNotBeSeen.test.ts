import test from "node:test";
import assert from "node:assert/strict";
import { creditHealth, costOf, isBillingFailure } from "../../src/lib/ai/creditHealth";

/**
 * Dustin, 13 Sep 2026: every AI feature had been down for an hour and the
 * first signal was features breaking in his hands. *"Nothing warns you when
 * the balance runs low."*
 */

const SPEND = (kIn: number, kOut: number, model = "claude-sonnet-4-6") =>
  ({ model, tokens_in: kIn, tokens_out: kOut });

const REFUSAL =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}';

test("a provider refusal means OUT, whatever the ledger believes", () => {
  // THE CASE THAT HAPPENED, and the reason the two signals are kept apart. The
  // ledger here says there is plenty left; the account is empty regardless.
  const h = creditHealth({
    topUps: [{ amount_usd: 100, added_on: "2026-09-01" }],
    spend: [SPEND(10_000, 1_000)],
    windowDays: 12,
    lastFailure: { at: new Date().toISOString(), feature: "plan_build", error: REFUSAL },
  });
  assert.equal(h.state, "out");
  assert.equal(h.outage?.feature, "plan_build");
  assert.equal(h.daysLeft, 0);
  assert.ok((h.remaining ?? 0) > 90, "the arithmetic is still reported — it is just not believed");
});

test("an old refusal is history, not a live outage", () => {
  const h = creditHealth({
    topUps: [{ amount_usd: 50, added_on: "2026-09-01" }],
    spend: [SPEND(10_000, 1_000)],
    windowDays: 12,
    lastFailure: { at: new Date(Date.now() - 9 * 3600_000).toISOString(), feature: "photo", error: REFUSAL },
  });
  assert.equal(h.state, "ok", "topping up must clear the card without waiting for a timer");
  assert.equal(h.outage, null);
});

test("a failure that is not about money is not an outage", () => {
  const h = creditHealth({
    topUps: [{ amount_usd: 50, added_on: "2026-09-01" }],
    spend: [SPEND(10_000, 1_000)],
    windowDays: 12,
    lastFailure: { at: new Date().toISOString(), feature: "plan_build", error: "No valid JSON after 2 attempts" },
  });
  assert.equal(h.state, "ok");
  assert.equal(isBillingFailure("No valid JSON after 2 attempts"), false);
  assert.equal(isBillingFailure(REFUSAL), true);
  assert.equal(isBillingFailure(null), false);
});

test("spend is priced from the real token counts", () => {
  // 1M in + 100k out on Sonnet: $3.00 + $1.50.
  assert.equal(Math.round(costOf(SPEND(1_000_000, 100_000)) * 100) / 100, 4.5);
  // Haiku is cheaper per token, and the model is matched loosely so a dated
  // id still prices.
  assert.equal(Math.round(costOf(SPEND(1_000_000, 100_000, "claude-haiku-4-5")) * 100) / 100, 1.5);
});

test("an unknown model costs zero rather than a guessed rate", () => {
  // Guessing a price for a model nobody priced is the worse failure: it would
  // put a confident wrong number on the card.
  assert.equal(costOf(SPEND(1_000_000, 100_000, "claude-something-new")), 0);
  assert.equal(costOf({ model: null, tokens_in: null, tokens_out: null }), 0);
});

test("low is whichever bites first — a fifth of the top-up, or five dollars", () => {
  // $100 added, $80.25 spent: $19.75 left is under the 20% mark.
  const big = creditHealth({
    topUps: [{ amount_usd: 100, added_on: "2026-09-01" }],
    spend: [SPEND(25_000_000, 350_000)], // $75.00 in + $5.25 out
    windowDays: 10,
  });
  assert.equal(big.spent, 80.25);
  assert.equal(big.state, "low", `${big.remaining} of ${big.added}`);

  // $20 added, $16 spent: 20% would be $4, but $4 left is under the $5 floor.
  const small = creditHealth({
    topUps: [{ amount_usd: 20, added_on: "2026-09-01" }],
    spend: [SPEND(4_000_000, 266_667)],
    windowDays: 10,
  });
  assert.equal(small.state, "low", `${small.remaining} of ${small.added}`);
});

test("healthy stays silent", () => {
  const h = creditHealth({
    topUps: [{ amount_usd: 50, added_on: "2026-09-01" }],
    spend: [SPEND(1_000_000, 100_000)], // $4.50 of $50
    windowDays: 10,
  });
  assert.equal(h.state, "ok");
  assert.equal(h.remaining, 45.5);
});

test("top-ups add up, so leftover credit carries into the next one", () => {
  const h = creditHealth({
    topUps: [
      { amount_usd: 20, added_on: "2026-09-01" },
      { amount_usd: 50, added_on: "2026-09-13" },
    ],
    spend: [SPEND(1_000_000, 100_000)],
    windowDays: 12,
  });
  assert.equal(h.added, 70);
  assert.equal(h.remaining, 65.5, "not 45.50 — the first top-up was not forgotten");
});

test("nothing recorded is UNTRACKED, not a false alarm", () => {
  const h = creditHealth({ topUps: [], spend: [SPEND(1_000_000, 100_000)], windowDays: 14 });
  assert.equal(h.state, "untracked");
  assert.equal(h.remaining, null, "no baseline means no number, rather than a made-up one");
  assert.ok(h.spent > 0, "spend is still counted, for the burn rate");
});

test("an untracked account still reports a live outage", () => {
  // The signal that needs no bookkeeping has to work when there is none.
  const h = creditHealth({
    topUps: [],
    spend: [],
    windowDays: 14,
    lastFailure: { at: new Date().toISOString(), feature: "coach_card", error: REFUSAL },
  });
  assert.equal(h.state, "out");
  assert.equal(h.outage?.feature, "coach_card");
});

test("the runway is whole days at the measured rate", () => {
  const h = creditHealth({
    topUps: [{ amount_usd: 50, added_on: "2026-09-01" }],
    spend: [SPEND(2_000_000, 200_000)], // $9 over 9 days = $1/day
    windowDays: 9,
  });
  assert.equal(h.perDay, 1);
  assert.equal(h.daysLeft, 41);
});

test("a zero burn rate gives no runway rather than infinity", () => {
  const h = creditHealth({ topUps: [{ amount_usd: 50, added_on: "2026-09-01" }], spend: [], windowDays: 9 });
  assert.equal(h.daysLeft, null);
  assert.equal(h.state, "ok");
});
