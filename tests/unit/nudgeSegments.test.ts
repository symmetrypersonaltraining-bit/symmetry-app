// Who gets nudged about nutrition, and how often.
//
// Dustin, 10 Aug: "only bug people about nutrition that are consistently
// logging then suddenly stop. 2 times reminding is enough dont bug them with
// it... some clients dont use the nutrition and that's fine."
//
// The old rule fired when `daysSinceMeal == null` — which is exactly the client
// who has NEVER logged a meal. The people least interested in the food logger
// were the ones being chased about it, in Dustin's name, in their inbox.
//
// These messages go out looking like he wrote them, so the segmentation is
// pinned here rather than left to be re-derived by whoever edits it next.

import test from "node:test";
import assert from "node:assert/strict";
import {
  segmentForTest as segment,
  NUTRITION_HABIT_DAYS,
  NUTRITION_LAPSE_DAYS,
  NUTRITION_MAX_PER_LAPSE,
} from "../../src/app/api/ai-nudges/segment.ts";

const base = {
  id: "c1",
  name: "Test Client",
  goal: "Fat Loss",
  w7: 5,
  w30: 20,
  daysSinceWorkout: 1,
  mealDays7: 6,
  mealDays30: 24,
  daysSinceMeal: 0,
  everTrained: true,
  everLoggedMeal: true,
};

// ─── who must NEVER get a nutrition nudge ───────────────────────────────────

test("a client who has never logged a meal is never nudged about nutrition", () => {
  // The headline bug. Training hard, no interest in the food logger — and the
  // old rule targeted them specifically.
  const r = { ...base, everLoggedMeal: false, mealDays30: 0, mealDays7: 0, daysSinceMeal: null };
  assert.notEqual(segment(r).seg, "nutrition_gap");
});

test("a client who dabbles below the habit threshold is left alone", () => {
  // Logged a handful of times, never really adopted it. Not a lapse.
  const r = { ...base, mealDays30: NUTRITION_HABIT_DAYS - 1, mealDays7: 0, daysSinceMeal: 12 };
  assert.notEqual(segment(r).seg, "nutrition_gap");
});

test("a regular logger who is still logging is not nudged", () => {
  const r = { ...base, daysSinceMeal: 1 };
  assert.notEqual(segment(r).seg, "nutrition_gap");
});

test("a one-day gap is not a lapse", () => {
  const r = { ...base, daysSinceMeal: NUTRITION_LAPSE_DAYS - 1 };
  assert.notEqual(segment(r).seg, "nutrition_gap");
});

test("a rehab client is never routed to the pushy track", () => {
  const r = { ...base, goal: "Rehab & Pain Relief", daysSinceMeal: 10 };
  const { seg, tone } = segment(r);
  assert.notEqual(seg, "nutrition_gap");
  assert.equal(tone, "gentle");
});

// ─── who SHOULD get one ─────────────────────────────────────────────────────

test("a consistent logger who suddenly stopped is exactly who gets nudged", () => {
  // Dustin's actual description of the target.
  const r = { ...base, mealDays30: 20, mealDays7: 0, daysSinceMeal: NUTRITION_LAPSE_DAYS };
  assert.equal(segment(r).seg, "nutrition_gap");
});

test("still true further into the lapse", () => {
  const r = { ...base, mealDays30: 18, mealDays7: 0, daysSinceMeal: 7 };
  assert.equal(segment(r).seg, "nutrition_gap");
});

test("nutrition nudges never outrank someone who has stopped training", () => {
  // Missing training is the bigger problem; it must win the segment.
  const r = { ...base, mealDays30: 20, daysSinceMeal: 9, daysSinceWorkout: 12 };
  assert.equal(segment(r).seg, "escalate");
});

// ─── the cap ────────────────────────────────────────────────────────────────

test("two reminders per lapse, and it resets when they log again", () => {
  // Counted since the last meal log, so logging empties it by definition —
  // two reminders per time they fall off, never a running tally that
  // eventually silences someone for good.
  assert.equal(NUTRITION_MAX_PER_LAPSE, 2);
});

test("the thresholds stay in the range that means 'a real habit'", () => {
  // 8 days in 30 is roughly twice a week sustained. If someone loosens this to
  // 1-2 days, occasional users start getting chased again.
  assert.ok(NUTRITION_HABIT_DAYS >= 6, "threshold too low — dabblers would be nudged");
  assert.ok(NUTRITION_LAPSE_DAYS >= 3, "too twitchy — a busy weekend is not a lapse");
});
