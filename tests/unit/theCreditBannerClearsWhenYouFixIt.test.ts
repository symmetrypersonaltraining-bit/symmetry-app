// ============================================================================
// A BANNER THAT WON'T CLEAR IS A BANNER YOU LEARN TO IGNORE.
//
// Dustin, 13 Sep, 5:33pm Central, on the trainer home:
//   *"I added but the notification won't clear."*
//
// He had topped the account up and pressed "I added credit — record it". The
// red card still said **"Every AI feature is down — the account is out of
// credit"**.
//
// WHAT THE DATA SAYS, and it is worse than a stuck card:
//
//   11:24–11:36  five real billing refusals ("Your credit balance is too low")
//   15:12        coach_action SUCCEEDS — three calls, no error
//   17:33:09     he records a $30 top-up
//   17:33        the screenshot: still "Every AI feature is down"
//   17:41        another success
//
// The AI came back at 15:12. The card kept saying every feature was down for
// the next TWO AND A HALF HOURS, through a top-up and three successful calls,
// because the only thing that could clear an outage was the refusal ageing out
// of a six-hour window. It would have cleared itself at 17:36:56 — four minutes
// after he complained — by expiry, not by knowing anything.
//
// The button he pressed wrote a row that nothing read.
//
// ── WHY NOT JUST SHORTEN THE WINDOW ─────────────────────────────────────────
//
// Because the window is a timeout, and a timeout is what you use when you have
// no evidence. Here there is evidence, with timestamps on it: a call that
// SUCCEEDED after the refusal proves the key works, and a top-up recorded after
// it is his own statement that he has dealt with it. Believing him is safe
// precisely because it is self-correcting — if he is wrong, the next call fails
// and the card is back within seconds.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { creditHealth } from "@/lib/ai/creditHealth";

const ROUTE = readFileSync(join(process.cwd(), "src/app/api/ai-credit/route.ts"), "utf8");

const NOW = Date.parse("2026-09-13T22:33:00Z"); // 17:33 Central
const REFUSAL = {
  at: "2026-09-13T16:36:56Z", // 11:36 Central — just inside the 6h window
  feature: "coach_card",
  error: '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low"}}',
};
const base = { topUps: [{ amount_usd: 30, added_on: "2026-09-13" }], spend: [], windowDays: 1 };

describe("the credit banner clears when you fix it", () => {
  it("a refusal with nothing since it still reads as an outage", () => {
    // The signal must keep working. This is the case the card exists for.
    const h = creditHealth({ ...base, lastFailure: REFUSAL, now: NOW });
    assert.equal(h.state, "out");
    assert.ok(h.outage, "a live refusal with nothing to disprove it is still an outage");
  });

  it("recording a top-up after the refusal clears it — the button he pressed", () => {
    const h = creditHealth({
      ...base,
      lastFailure: REFUSAL,
      lastTopUpAt: "2026-09-13T22:33:09Z", // 17:33:09 Central, the real row
      now: NOW,
    });
    assert.equal(h.outage, null, "the top-up he recorded is not read — this is the bug");
    assert.notEqual(h.state, "out", "the red banner is still up after he fixed it");
  });

  it("a successful call after the refusal clears it — the stronger proof", () => {
    const h = creditHealth({
      ...base,
      lastFailure: REFUSAL,
      lastSuccessAt: "2026-09-13T20:12:12Z", // 15:12 Central
      now: NOW,
    });
    assert.equal(h.outage, null, "the AI demonstrably worked after the refusal");
  });

  it("a top-up from BEFORE the refusal proves nothing", () => {
    // Otherwise the first top-up ever recorded would suppress every future
    // outage, and the card would go quiet exactly when it is needed.
    const h = creditHealth({
      ...base,
      lastFailure: REFUSAL,
      lastTopUpAt: "2026-09-01T12:00:00Z",
      now: NOW,
    });
    assert.ok(h.outage, "an older top-up must not suppress a newer refusal");
  });

  it("a success from BEFORE the refusal proves nothing either", () => {
    const h = creditHealth({
      ...base,
      lastFailure: REFUSAL,
      lastSuccessAt: "2026-09-13T16:00:00Z", // before the 16:36 refusal
      now: NOW,
    });
    assert.ok(h.outage, "a success that predates the refusal is not evidence");
  });

  it("a later unrelated failure cannot mask a live billing refusal", () => {
    // The other direction of the same comparison, and it silences the card at
    // exactly the wrong moment. At 17:41 on 13 Sep the newest error row was
    // "No valid JSON after 2 attempts" — not a billing problem — sitting on top
    // of five real refusals. `limit(1)` over all errors would have picked it,
    // isBillingFailure would have said false, and the outage would have
    // vanished while the account was still empty.
    assert.doesNotMatch(
      ROUTE,
      /\.neq\("error", ""\)[\s\S]{0,120}\.limit\(1\)/,
      "the route takes the most recent error of ANY kind again — a JSON parse " +
        "failure will hide a billing refusal behind it",
    );
    assert.match(ROUTE, /isBillingFailure/,
      "it must pick the most recent BILLING refusal, using the one definition of that");
    assert.match(ROUTE, /OUTAGE_WINDOW_MS/,
      "and bound the scan to the window rather than reading the whole table");
  });

  it("the route actually fetches both, or the logic above never sees them", () => {
    assert.match(ROUTE, /lastSuccessAt/, "the route must pass the last success through");
    assert.match(ROUTE, /lastTopUpAt/, "…and the last top-up");
    assert.match(ROUTE, /error\.is\.null/, "it has to query for calls that did NOT error");
    assert.match(
      ROUTE,
      /from\("ai_credit_topups"\)[\s\S]{0,160}created_at/,
      "the top-up time must come from created_at — added_on is a DATE and cannot order within a day",
    );
  });
});
