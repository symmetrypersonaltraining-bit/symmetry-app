import { test } from "node:test";
import assert from "node:assert/strict";
import {
  daysBetweenISO,
  deltaLine,
  lastWeekWindow,
  shiftISO,
  thisWeekWindow,
  weekStartOf,
  weeklyNumbersBlock,
  weekFactsLines,
  EMPTY_WEEK,
  WeekFacts,
} from "../../src/lib/ai/weekly-numbers";

/**
 * Dustin: "triple check the numbers because they have been off here and there
 * and not accurate."
 *
 * Every week boundary, every average, every direction word the weekly AI copy
 * is written from is pinned here. If a number the model states is wrong, it is
 * wrong in this file first — that is the whole reason the arithmetic was pulled
 * out of the prompt and into pure code.
 */

// ---- week boundaries -------------------------------------------------------

test("weekStartOf returns the Sunday of that week (Sunday maps to itself)", () => {
  // 2026-07-26 is a Sunday; 2026-08-01 is the Saturday that closes that week.
  assert.equal(weekStartOf("2026-07-26"), "2026-07-26");
  assert.equal(weekStartOf("2026-07-27"), "2026-07-26"); // Monday
  assert.equal(weekStartOf("2026-07-31"), "2026-07-26"); // Friday
  assert.equal(weekStartOf("2026-08-01"), "2026-07-26"); // Saturday
  assert.equal(weekStartOf("2026-08-02"), "2026-08-02"); // next Sunday
});

test("shiftISO crosses month and year boundaries", () => {
  assert.equal(shiftISO("2026-07-31", 1), "2026-08-01");
  assert.equal(shiftISO("2026-08-01", -1), "2026-07-31");
  assert.equal(shiftISO("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftISO("2026-03-01", -1), "2026-02-28"); // 2026 is not a leap year
});

test("daysBetweenISO is inclusive-exclusive and signed", () => {
  assert.equal(daysBetweenISO("2026-07-26", "2026-07-31"), 5);
  assert.equal(daysBetweenISO("2026-07-31", "2026-07-26"), -5);
  assert.equal(daysBetweenISO("2026-07-31", "2026-07-31"), 0);
});

test("lastWeekWindow is always the previous COMPLETE Sun-Sat week", () => {
  const w = lastWeekWindow("2026-07-31"); // Friday
  assert.deepEqual(w, { start: "2026-07-19", end: "2026-07-25", days: 7, complete: true });
  // Asked on a Sunday, "last week" must be the week that just ended, not the
  // one that started this morning.
  assert.deepEqual(lastWeekWindow("2026-07-26"), {
    start: "2026-07-19", end: "2026-07-25", days: 7, complete: true,
  });
});

test("thisWeekWindow runs Sunday -> today and is only complete on Saturday", () => {
  assert.deepEqual(thisWeekWindow("2026-07-26"), {
    start: "2026-07-26", end: "2026-07-26", days: 1, complete: false,
  });
  assert.deepEqual(thisWeekWindow("2026-07-31"), {
    start: "2026-07-26", end: "2026-07-31", days: 6, complete: false,
  });
  assert.deepEqual(thisWeekWindow("2026-08-01"), {
    start: "2026-07-26", end: "2026-08-01", days: 7, complete: true,
  });
});

test("last week and this week never overlap", () => {
  for (const d of ["2026-07-26", "2026-07-29", "2026-08-01", "2026-01-01", "2026-12-31"]) {
    const l = lastWeekWindow(d);
    const t = thisWeekWindow(d);
    assert.ok(l.end < t.start, `${d}: windows overlap (${l.end} >= ${t.start})`);
    assert.equal(shiftISO(l.end, 1), t.start, `${d}: gap between the two windows`);
  }
});

// ---- deltas ----------------------------------------------------------------

test("deltaLine refuses to compare against a missing side", () => {
  assert.equal(deltaLine("Avg protein", null, 180, "g", "higher"), null);
  assert.equal(deltaLine("Avg protein", 180, null, "g", "higher"), null);
  assert.equal(deltaLine("Avg protein", null, null, "g", "higher"), null);
});

test("deltaLine states direction and verdict, and never contradicts itself", () => {
  const up = deltaLine("Avg protein", 150, 180, "g", "higher")!;
  assert.match(up, /150g last week → 180g this week = \+30g UP/);
  assert.match(up, /moving the right way/);

  const down = deltaLine("Avg protein", 180, 150, "g", "higher")!;
  assert.match(down, /= -30g DOWN/);
  assert.match(down, /moving the wrong way/);

  // betterWhen "lower" flips the verdict but NOT the direction word.
  const lower = deltaLine("Weight", 200, 196, " lb", "lower")!;
  assert.match(lower, /DOWN/);
  assert.match(lower, /moving the right way/);

  // "neither" gets a direction but no judgement — calories aren't good or bad
  // in the abstract.
  const cals = deltaLine("Avg calories", 2000, 2400, " kcal", "neither")!;
  assert.match(cals, /UP/);
  assert.ok(!/right way|wrong way/.test(cals), "calorie moves must not be judged");

  const flat = deltaLine("Days logged", 5, 5, " days", "higher")!;
  assert.match(flat, /= \+0 days FLAT/);
  assert.ok(!/right way|wrong way/.test(flat), "a flat week has no verdict");
});

// ---- fact lines ------------------------------------------------------------

const WINDOW = { start: "2026-07-19", end: "2026-07-25", days: 7, complete: true };

function facts(over: Partial<WeekFacts> = {}): WeekFacts {
  return { ...EMPTY_WEEK(WINDOW), ...over };
}

test("a week with no logs says so instead of reporting zeros as an average", () => {
  const lines = weekFactsLines(facts(), "LAST WEEK", null).join("\n");
  assert.match(lines, /nothing logged \(logged food on 0 of 7 days\)/);
  assert.ok(!/0 kcal/.test(lines), "must not present 'no data' as a 0 kcal average");
});

test("averages are reported per logged day and compared to target with the direction stated", () => {
  const lines = weekFactsLines(
    facts({ loggedDays: 4, avg: { kcal: 2410.4, p: 181.6, c: 220, f: 70 }, adherence: 92.4 }),
    "LAST WEEK",
    { calories: 2200, protein: 190, carbs: 210, fats: 65 },
  ).join("\n");

  assert.match(lines, /logged food on 4 of 7 days/);
  assert.match(lines, /2410 kcal, 182g protein, 220g carbs, 70g fat/);
  // Calories over target, protein under — the two must not be described the same way.
  assert.match(lines, /calories \+210 \(ABOVE target\)/);
  assert.match(lines, /protein -8 \(BELOW target\)/);
  assert.match(lines, /carbs \+10 \(ABOVE target\)/);
  assert.match(lines, /Meal-plan adherence: 92%/);
  assert.match(lines, /do NOT recompute the direction/);
});

test("training and weight lines degrade honestly when data is thin", () => {
  const none = weekFactsLines(facts(), "LAST WEEK", null).join("\n");
  assert.match(none, /Training: nothing was on the calendar/);
  assert.match(none, /Weight: no weigh-in this window/);

  const one = weekFactsLines(
    facts({ workoutsScheduled: 4, workoutsCompleted: 3, weightStart: 198.2, weightEnd: 198.2 }),
    "LAST WEEK", null,
  ).join("\n");
  assert.match(one, /3 of 4 scheduled sessions completed/);
  assert.match(one, /198.2 lb \(one weigh-in — no within-week trend\)/);

  const trend = weekFactsLines(
    facts({ weightStart: 200, weightEnd: 197.6 }), "LAST WEEK", null,
  ).join("\n");
  assert.match(trend, /200 lb → 197.6 lb = -2.4 lb DOWN/);
});

test("a partial current week is labelled partial so it is never scored as finished", () => {
  const partial = weekFactsLines(
    { ...facts(), window: { start: "2026-07-26", end: "2026-07-29", days: 4, complete: false } },
    "THIS WEEK SO FAR", null,
  ).join("\n");
  assert.match(partial, /PARTIAL — still in progress, do NOT judge it as a finished week/);
  assert.match(partial, /0 of 4 days/);
});

// ---- the assembled block ---------------------------------------------------

test("the block carries both weeks, the movement and the do-not-recompute framing", () => {
  const block = weeklyNumbersBlock(
    facts({ loggedDays: 6, avg: { kcal: 2200, p: 190, c: 200, f: 60 }, adherence: 95, workoutsScheduled: 4, workoutsCompleted: 4 }),
    {
      ...facts({ loggedDays: 2, avg: { kcal: 2600, p: 150, c: 260, f: 80 }, adherence: 78, workoutsScheduled: 4, workoutsCompleted: 1 }),
      window: { start: "2026-07-26", end: "2026-07-29", days: 4, complete: false },
    },
    { calories: 2200, protein: 190, carbs: 210, fats: 65 },
  );

  assert.match(block, /LAST WEEK \(2026-07-19 → 2026-07-25, COMPLETE week\)/);
  assert.match(block, /THIS WEEK SO FAR \(2026-07-26 → 2026-07-29, PARTIAL/);
  assert.match(block, /Days logged: 6 days last week → 2 days this week = -4 days DOWN/);
  assert.match(block, /Avg protein: 190g last week → 150g this week = -40g DOWN/);
  assert.match(block, /Meal-plan adherence: 95% last week → 78% this week = -17% DOWN/);
  assert.match(block, /Sessions completed: 4 last week → 1 this week = -3 DOWN/);
  assert.match(block, /this week is still partial, so these are early reads/);
  assert.match(block, /do NOT recompute/);
});

test("with nothing logged in either week the block forbids inventing a trend", () => {
  const block = weeklyNumbersBlock(facts(), facts(), null);
  assert.match(block, /NO food logs in either week\. Do not invent numbers or infer a trend/);
  // And there must be no nutrition comparison line at all to hallucinate from.
  assert.ok(!/Avg calories:/.test(block), "no calorie delta may appear when neither week has logs");
  assert.ok(!/Avg protein:/.test(block), "no protein delta may appear when neither week has logs");
});

test("when today is left out of the averages the basis is spelled out beside the numbers", () => {
  // "logged food on 6 of 6 days" printed next to a 5-day average reads like an
  // arithmetic error to anyone checking it — and Dustin checks.
  const lines = weekFactsLines(
    { ...facts({ loggedDays: 6, avgDays: 5, avg: { kcal: 2713, p: 295, c: 58, f: 145 } }),
      window: { start: "2026-07-26", end: "2026-07-31", days: 6, complete: false } },
    "THIS WEEK SO FAR", null,
  ).join("\n");
  assert.match(lines, /logged food on 6 of 6 days/);
  assert.match(lines, /averages across the 5 completed logged days/);
  assert.match(lines, /today is still in progress and is deliberately excluded/);
  assert.match(lines, /2713 kcal, 295g protein/);
});

test("with nothing excluded the wording stays the plain per-logged-day one", () => {
  const lines = weekFactsLines(
    facts({ loggedDays: 6, avgDays: 6, avg: { kcal: 2293, p: 264, c: 32, f: 124 } }),
    "LAST WEEK", null,
  ).join("\n");
  assert.match(lines, /averages per logged day/);
  assert.ok(!/deliberately excluded/.test(lines), "nothing was excluded, so don't say it was");
});

test("each week is graded against the target that was actually in force during it", () => {
  // The live bug on 2026-07-31: last week (closed 07-25) was measured against a
  // target effective 07-30 — five days AFTER the week ended — turning "29g
  // BELOW protein" into "1g ABOVE" and pointing the coaching the wrong way.
  const LAST = { calories: 1963, protein: 293, carbs: 120, fats: 34 };
  const NOW = { calories: 1388, protein: 263, carbs: 12, fats: 32 };
  const block = weeklyNumbersBlock(
    facts({ loggedDays: 6, avgDays: 6, avg: { kcal: 2293, p: 264, c: 32, f: 124 } }),
    { ...facts({ loggedDays: 5, avgDays: 5, avg: { kcal: 2713, p: 295, c: 58, f: 145 } }),
      window: { start: "2026-07-26", end: "2026-07-31", days: 6, complete: false } },
    LAST,
    NOW,
  );

  assert.match(block, /vs targets \(1963 kcal \/ 293P \/ 120C \/ 34F\)/);
  assert.match(block, /vs targets \(1388 kcal \/ 263P \/ 12C \/ 32F\)/);
  // 264 vs 293 is 29 BELOW — the figure the old single-target query got wrong.
  assert.match(block, /protein -29 \(BELOW target\)/);
  // And this week, 295 vs 263, is genuinely above.
  assert.match(block, /protein \+32 \(ABOVE target\)/);
  // The change itself has to be surfaced or the jump reads as the client slipping.
  assert.match(block, /TARGETS CHANGED between the two weeks/);
  assert.match(block, /do not treat the change as the client slipping/);
});

test("an unchanged target produces no TARGETS CHANGED noise", () => {
  const T = { calories: 2200, protein: 190, carbs: 210, fats: 65 };
  const block = weeklyNumbersBlock(
    facts({ loggedDays: 5, avgDays: 5, avg: { kcal: 2200, p: 190, c: 210, f: 65 } }),
    facts({ loggedDays: 3, avgDays: 3, avg: { kcal: 2100, p: 180, c: 200, f: 60 } }),
    T,
    { ...T },
  );
  assert.ok(!/TARGETS CHANGED/.test(block));
});

test("a single-target caller is unchanged — currentTarget defaults to target", () => {
  const T = { calories: 2200, protein: 190, carbs: 210, fats: 65 };
  const one = weeklyNumbersBlock(facts({ loggedDays: 5, avg: { kcal: 2200, p: 190, c: 210, f: 65 } }), facts(), T);
  const two = weeklyNumbersBlock(facts({ loggedDays: 5, avg: { kcal: 2200, p: 190, c: 210, f: 65 } }), facts(), T, T);
  assert.equal(one, two);
  assert.ok(!/TARGETS CHANGED/.test(one));
});

test("sessions are only compared when both weeks actually had something scheduled", () => {
  const block = weeklyNumbersBlock(
    facts({ workoutsScheduled: 0, workoutsCompleted: 0 }),
    facts({ workoutsScheduled: 3, workoutsCompleted: 2 }),
    null,
  );
  // Zero scheduled last week is "no plan", not "completed zero" — comparing
  // them would manufacture a collapse that never happened.
  assert.ok(!/Sessions completed:/.test(block));
});
