import { test } from "node:test";
import assert from "node:assert/strict";
import { summariseLogRange } from "../../src/lib/nutrition/rangeAverages";
import { LogRow, PlanMeal } from "../../src/lib/nutrition/dailyTotals";

/**
 * summariseLogRange is the ONE implementation behind every "how did they eat
 * over this window" number in the app — the averages strip, the week card and
 * the weekly AI context all call it. Before it existed each surface had its own
 * loop and they drifted, which is what Dustin was seeing: "the numbers have
 * been off here and there and not accurate."
 *
 * So this pins the two things that actually went wrong: averaging over the
 * wrong denominator, and quick-add snacks poisoning the plan adherence average.
 */

// A 2-meal plan, 500 kcal-ish each, so hand arithmetic below is checkable.
const PLAN: PlanMeal[] = [
  {
    id: "m1", name: "Breakfast", timing: null, position: 1,
    meal_items: [{ id: "i1", food: "Egg whites + oats", amount: 1, unit: "serving", is_unlimited: false, protein: 40, carbs: 60, fats: 10, position: 1 }],
  },
  {
    id: "m2", name: "Lunch", timing: null, position: 2,
    meal_items: [{ id: "i2", food: "Chicken + rice", amount: 1, unit: "serving", is_unlimited: false, protein: 50, carbs: 70, fats: 12, position: 1 }],
  },
];

// 4/4/9 → m1 = 160+240+90 = 490 kcal; m2 = 200+280+108 = 588 kcal.
const M1_KCAL = 490;
const M2_KCAL = 588;

function planLog(date: string, position: number, mealId: string, adherence: string): LogRow & { log_date: string } {
  return { log_date: date, meal_id: mealId, meal_position: position, adherence };
}

function quickAdd(date: string, position: number, kcal: number, p: number, c: number, f: number): LogRow & { log_date: string } {
  // v3 quick-add: EXTRA_POSITIONS 6/7, no meal_id, adherence "Off-plan".
  return {
    log_date: date, meal_id: null, meal_position: position, adherence: "Off-plan",
    est_kcal: kcal, est_protein: p, est_carbs: c, est_fats: f,
  };
}

test("an empty range reports nothing rather than a zero average", () => {
  const s = summariseLogRange([], PLAN);
  assert.equal(s.loggedDays, 0);
  assert.equal(s.kcal, 0);
  assert.equal(s.adherence, null, "no plan logs must be null, not 0% adherence");
});

test("averages divide by LOGGED days, not calendar days", () => {
  // Two logged days inside a seven-day window. The average must be the average
  // of those two — counting the five silent days as 0 kcal would report a
  // starving client who simply didn't open the app.
  const logs = [
    planLog("2026-07-20", 1, "m1", "Full"),
    planLog("2026-07-20", 2, "m2", "Full"),
    planLog("2026-07-24", 1, "m1", "Full"),
    planLog("2026-07-24", 2, "m2", "Full"),
  ];
  const s = summariseLogRange(logs, PLAN);
  assert.equal(s.loggedDays, 2);
  assert.equal(Math.round(s.kcal), M1_KCAL + M2_KCAL);
  assert.equal(Math.round(s.p), 90);
  assert.equal(Math.round(s.adherence!), 100);
});

test("partial adherence prorates both the macros and the percentage", () => {
  // One day: m1 Full, m2 half.
  const s = summariseLogRange(
    [planLog("2026-07-20", 1, "m1", "Full"), planLog("2026-07-20", 2, "m2", "1/2")],
    PLAN,
  );
  assert.equal(s.loggedDays, 1);
  assert.equal(Math.round(s.kcal), M1_KCAL + Math.round(M2_KCAL / 2));
  assert.equal(Math.round(s.adherence!), 75); // (100% + 50%) / 2
});

test("a quick-add snack does NOT drag down plan adherence", () => {
  // THE regression. v3 moved quick-adds into positions 6/7 with adherence
  // "Off-plan" (0.75). Counting them inside the plan average turned a perfect
  // day into 96% — confirmed on Dustin's own 2026-07-20 log.
  const withSnack = summariseLogRange(
    [
      planLog("2026-07-20", 1, "m1", "Full"),
      planLog("2026-07-20", 2, "m2", "Full"),
      quickAdd("2026-07-20", 6, 200, 20, 10, 8),
    ],
    PLAN,
  );
  assert.equal(Math.round(withSnack.adherence!), 100, "every plan meal was logged Full — that is a 100% day");
  // ...but the snack's calories still count toward what they actually ate.
  assert.equal(Math.round(withSnack.kcal), M1_KCAL + M2_KCAL + 200);
});

test("a plan meal logged Off-plan still scores as a partial, not a zero", () => {
  // An off-plan swap on a real plan slot (meal_id present) is a 0.75 — the
  // client ate at that slot, just not what was written.
  const s = summariseLogRange(
    [
      { ...planLog("2026-07-20", 1, "m1", "Off-plan"), est_kcal: 400, est_protein: 30, est_carbs: 40, est_fats: 12 },
      planLog("2026-07-20", 2, "m2", "Full"),
    ],
    PLAN,
  );
  assert.equal(Math.round(s.adherence!), 88); // (75% + 100%) / 2 = 87.5
});

test("removed / unlogged placeholder rows are excluded from adherence", () => {
  const s = summariseLogRange(
    [
      planLog("2026-07-20", 1, "m1", "Full"),
      { ...planLog("2026-07-20", 2, "m2", "Skipped"), item_overrides: { __removed: true } },
    ],
    PLAN,
  );
  // A meal deleted for the day was never on the plan for that day, so scoring
  // it Skipped would punish the client for the trainer's own edit.
  assert.equal(Math.round(s.adherence!), 100);
});

test("a skipped plan meal DOES count as a zero", () => {
  const s = summariseLogRange(
    [planLog("2026-07-20", 1, "m1", "Full"), planLog("2026-07-20", 2, "m2", "Skipped")],
    PLAN,
  );
  assert.equal(Math.round(s.adherence!), 50);
});

test("days with only quick-adds count as logged days but carry no plan adherence", () => {
  const s = summariseLogRange(
    [quickAdd("2026-07-20", 6, 300, 25, 20, 12), quickAdd("2026-07-21", 6, 500, 35, 40, 18)],
    PLAN,
  );
  assert.equal(s.loggedDays, 2);
  assert.equal(Math.round(s.kcal), 400); // (300 + 500) / 2
  assert.equal(s.adherence, null, "no plan meals were logged, so there is no adherence figure to state");
});

test("adherence averages across days, not across meals", () => {
  // Day A: 1 plan meal, Skipped (0%). Day B: 2 plan meals, both Full (100%).
  // Per-day averaging gives 50%. Pooling all meals would give 67% and quietly
  // over-report a client whose one bad day was a total miss.
  const s = summariseLogRange(
    [
      planLog("2026-07-20", 1, "m1", "Skipped"),
      planLog("2026-07-21", 1, "m1", "Full"),
      planLog("2026-07-21", 2, "m2", "Full"),
    ],
    PLAN,
  );
  assert.equal(s.loggedDays, 2);
  assert.equal(Math.round(s.adherence!), 50);
});
