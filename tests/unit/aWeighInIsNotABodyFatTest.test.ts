// "hassan tried to log weight and its requiring measurements to log weight."
//
// The weigh-in nudge counts the days since somebody's last WEIGH-IN:
//
//   "It's been 12 days since your last weigh-in"
//   [ Log it now ]   [ Remind me tomorrow ]
//
// and "Log it now" went to /log-bodyfat. That page takes seven-site or
// four-site caliper readings, or a body-fat percentage typed in directly. It
// has no weight field at all. So Hassan did exactly what the card told him to
// and was asked to measure his subscapular skinfold in order to write down a
// number he had just read off his bathroom scale.
//
// He could not have completed it. There was no path from that button to the
// thing the button was asking him for.
//
// This is a wiring test rather than a behavioural one — the failure was a
// destination, and the destination is the thing worth pinning.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const NUDGE = read("src/components/WeighInNudge.tsx");
const CARDS = read("src/components/MetricCards.tsx");

/** Comments describe the bug on purpose; only real code should be matched. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("the weigh-in nudge does not send anyone to the caliper page", () => {
  assert.doesNotMatch(
    code(NUDGE),
    /log-bodyfat/,
    "the weigh-in nudge is routing to the body-fat page again",
  );
});

test("the body-fat page genuinely cannot take a weight", () => {
  // Why the above matters rather than being a cosmetic mis-link: there is no
  // weight input on that page to fall back to.
  const BF = code(read("src/app/(app)/log-bodyfat/page.tsx"));
  assert.doesNotMatch(BF, /setWeight\(/, "log-bodyfat now takes a weight — revisit this test");
});

test("both sides of the open-the-weight-logger handshake use one constant", () => {
  // The nudge sits on /progress, the same page as the metric cards, so it opens
  // the weight card by event rather than by URL. Two hardcoded strings would
  // drift apart silently and the button would do nothing at all.
  assert.match(CARDS, /export const LOG_WEIGHT_EVENT = "sym:log-weight"/);
  assert.match(code(NUDGE), /import \{ LOG_WEIGHT_EVENT \} from "@\/components\/MetricCards"/);
  assert.match(code(NUDGE), /dispatchEvent\(new CustomEvent\(LOG_WEIGHT_EVENT\)\)/);
  assert.match(code(CARDS), /addEventListener\(LOG_WEIGHT_EVENT, openWeight\)/);
  assert.match(code(CARDS), /removeEventListener\(LOG_WEIGHT_EVENT, openWeight\)/);
});

test("the Sunday reminder's deep link still works", () => {
  // /progress?log=weight is the other way in and predates this. Both must open
  // the same card.
  assert.match(code(CARDS), /get\("log"\) === "weight"\) openWeight\(\)/);
});

test("tapping Log it now does not clear the nudge", () => {
  // Opening the form is not logging a weight. A nudge that dismisses itself on
  // the way to the scale disappears for anyone who gets distracted en route.
  const c = code(NUDGE);
  const fire = c.indexOf("dispatchEvent(new CustomEvent(LOG_WEIGHT_EVENT))");
  assert.ok(fire > 0, "the button never fires the event");
  // The onClick block only: from the onClick that contains the dispatch, to
  // the button's label.
  const handler = c.slice(c.lastIndexOf("onClick", fire), c.indexOf("Log it now", fire));
  assert.doesNotMatch(handler, /dismiss\(\)/);
});
