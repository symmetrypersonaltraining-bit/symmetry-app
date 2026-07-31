import { test } from "node:test";
import assert from "node:assert/strict";
import { summariseLogRange, macroHitScore, dayHitScore } from "../../src/lib/nutrition/rangeAverages";
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

test("a date holding only structural rows is NOT a logged day", () => {
  // THE 2026-07-31 bug. Dustin's only row that day was a meal deleted for today
  // ({__removed: true}) — no food. Counting that date as a logged day put a
  // phantom 0 kcal day into the divisor: 5 real days of food divided by 6,
  // reporting 2261 kcal / 246g protein instead of 2713 / 295. That understated
  // protein by ~50g and flipped it from ABOVE target to BELOW, which is the
  // direction the AI would then have coached toward.
  const logs = [
    planLog("2026-07-20", 1, "m1", "Full"),
    planLog("2026-07-20", 2, "m2", "Full"),
    { ...planLog("2026-07-21", 1, "m1", "Skipped"), item_overrides: { __removed: true } },
  ];
  const s = summariseLogRange(logs, PLAN);
  assert.equal(s.loggedDays, 1, "the __removed-only date is structure, not food");
  assert.equal(s.avgDays, 1);
  assert.equal(Math.round(s.kcal), M1_KCAL + M2_KCAL, "the phantom day must not halve the average");
});

test("an unlogged placeholder day is also not a logged day", () => {
  const s = summariseLogRange(
    [
      planLog("2026-07-20", 1, "m1", "Full"),
      planLog("2026-07-20", 2, "m2", "Full"),
      { ...planLog("2026-07-21", 1, "m1", "Full"), item_overrides: { __unlogged: true } },
    ],
    PLAN,
  );
  assert.equal(s.loggedDays, 1);
  assert.equal(Math.round(s.kcal), M1_KCAL + M2_KCAL);
});

test("excludeDates keeps the in-progress day out of the averages but still counts it as logged", () => {
  // Half a day of food is not a data point about how someone is eating, and the
  // AI is told to state these averages as fact.
  const logs = [
    planLog("2026-07-20", 1, "m1", "Full"),
    planLog("2026-07-20", 2, "m2", "Full"),
    planLog("2026-07-21", 1, "m1", "Full"), // today, only breakfast in so far
  ];
  const s = summariseLogRange(logs, PLAN, { excludeDates: ["2026-07-21"] });
  assert.equal(s.loggedDays, 2, "they did log today — that stays true");
  assert.equal(s.avgDays, 1, "but today is not averaged as a finished day");
  assert.equal(Math.round(s.kcal), M1_KCAL + M2_KCAL);
});

test("excluding the only logged day falls back rather than reporting nothing", () => {
  // Sunday morning: the week's one logged day IS today. An empty average is
  // worse than a partial one.
  const s = summariseLogRange([planLog("2026-07-26", 1, "m1", "Full")], PLAN, {
    excludeDates: ["2026-07-26"],
  });
  assert.equal(s.loggedDays, 1);
  assert.equal(s.avgDays, 1);
  assert.equal(Math.round(s.kcal), M1_KCAL);
});

test("a plan meal at an EXTRA position logged Off-plan stays in the adherence average", () => {
  // Dustin's plan genuinely has 7 meals, and EXTRA_POSITIONS is [6, 7]. An
  // off-plan row carries no meal_id, so inferring plan positions from meal_id
  // alone reclassified his M5 as a quick-add snack and dropped it out of
  // adherence entirely on every day he ate off plan. The live plan's own
  // positions are what make it a plan slot.
  const PLAN6: PlanMeal[] = [
    ...PLAN,
    {
      id: "m6", name: "Evening", timing: null, position: 6,
      meal_items: [{ id: "i6", food: "Casein", amount: 1, unit: "scoop", is_unlimited: false, protein: 25, carbs: 5, fats: 2, position: 1 }],
    },
  ];
  const offPlanAtSix = {
    log_date: "2026-07-20", meal_id: null, meal_position: 6, adherence: "Off-plan",
    est_kcal: 300, est_protein: 20, est_carbs: 25, est_fats: 12,
  } as LogRow & { log_date: string };

  const s = summariseLogRange(
    [planLog("2026-07-20", 1, "m1", "Full"), planLog("2026-07-20", 2, "m2", "Full"), offPlanAtSix],
    PLAN6,
  );
  // Three plan slots logged: 100% + 100% + 75% = 91.67%.
  assert.equal(Math.round(s.adherence!), 92, "the off-plan slot is a plan meal, not a snack");

  // And with no plan meal at position 6 it really is a quick-add, unchanged.
  const asSnack = summariseLogRange(
    [planLog("2026-07-20", 1, "m1", "Full"), planLog("2026-07-20", 2, "m2", "Full"), offPlanAtSix],
    PLAN,
  );
  assert.equal(Math.round(asSnack.adherence!), 100);
});

test("plan positions are decided once for the range, not rediscovered per day", () => {
  // Monday the client logs M6 on plan (meal_id present); Tuesday they eat it
  // off plan (no meal_id). Per-day inference made Tuesday's slot a snack and
  // reported a perfect Tuesday, hiding the swap.
  const PLAN6: PlanMeal[] = [
    ...PLAN,
    {
      id: "m6", name: "Evening", timing: null, position: 6,
      meal_items: [{ id: "i6", food: "Casein", amount: 1, unit: "scoop", is_unlimited: false, protein: 25, carbs: 5, fats: 2, position: 1 }],
    },
  ];
  const s = summariseLogRange(
    [
      planLog("2026-07-20", 6, "m6", "Full"),
      { log_date: "2026-07-21", meal_id: null, meal_position: 6, adherence: "Off-plan", est_kcal: 300, est_protein: 20, est_carbs: 25, est_fats: 12 } as LogRow & { log_date: string },
    ],
    PLAN6,
  );
  // Day 1 = 100%, day 2 = 75% → 87.5%.
  assert.equal(Math.round(s.adherence!), 88);
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

// ── Adherence redefined, 2026-07-31 ─────────────────────────────────────────
//
// Dustin: "adherence should be based on consistently logging and hitting macros
// n calories." adherence = consistency × accuracy. Every test above passes no
// target, so they still exercise the meal-status fallback — these pin the new
// behaviour.

const DAY_KCAL = M1_KCAL + M2_KCAL; // 1078
const ON_TARGET = { calories: DAY_KCAL, protein: 90, carbs: 130, fats: 22 };

test("macroHitScore: full credit inside 10%, straight-line falloff, zero at 50% off", () => {
  assert.equal(macroHitScore(2000, 2000), 1, "dead on target");
  assert.equal(macroHitScore(2200, 2000), 1, "+10% is still a full hit");
  assert.equal(macroHitScore(1800, 2000), 1, "-10% is still a full hit");
  assert.equal(macroHitScore(2600, 2000), 0.5, "30% off sits halfway down the ramp");
  assert.equal(macroHitScore(3000, 2000), 0, "50% off scores nothing");
  assert.equal(macroHitScore(9000, 2000), 0, "and it never goes negative");
  assert.equal(macroHitScore(2000, 0), null, "no target = nothing to be accurate against");
  assert.equal(macroHitScore(2000, null), null);
});

test("dayHitScore scores ALL FOUR macros, not just calories and protein", () => {
  // Dustin's call when asked which macros count: "All four — cals, P, C, F."
  const perfect = dayHitScore({ kcal: 2000, protein: 180, carbs: 200, fats: 60 }, {
    calories: 2000, protein: 180, carbs: 200, fats: 60,
  });
  assert.equal(perfect, 1);

  // Calories on the nose but the split is wildly off: fat 50% over (0), carbs
  // 30% under (0.5). A calories-only score would call this a perfect day.
  const wrongSplit = dayHitScore({ kcal: 2000, protein: 180, carbs: 140, fats: 90 }, {
    calories: 2000, protein: 180, carbs: 200, fats: 60,
  });
  assert.equal(wrongSplit, (1 + 1 + 0.5 + 0) / 4);

  assert.equal(dayHitScore({ kcal: 2000, protein: 1, carbs: 1, fats: 1 }, null), null);
});

test("adherence is consistency MULTIPLIED by accuracy — an unlogged day is a miss", () => {
  // Two perfect days inside a seven-day window. Nailing what you log does not
  // erase the five days you didn't: 2/7 × 100% = 29%, not 100%.
  const logs = [
    planLog("2026-07-20", 1, "m1", "Full"),
    planLog("2026-07-20", 2, "m2", "Full"),
    planLog("2026-07-22", 1, "m1", "Full"),
    planLog("2026-07-22", 2, "m2", "Full"),
  ];
  const s = summariseLogRange(logs, PLAN, { target: ON_TARGET, windowDays: 7 });
  assert.equal(s.adherenceBasis, "logging+macros");
  assert.equal(Math.round(s.accuracy!), 100, "both logged days landed on target");
  assert.equal(Math.round(s.consistency!), 29, "2 of 7 days");
  assert.equal(Math.round(s.adherence!), 29);
});

test("logging every day but eating well off target does not read as adherence", () => {
  // The mirror image: perfect consistency, poor accuracy. Under the old
  // meal-status average both of these clients scored 100%.
  const logs = [
    planLog("2026-07-20", 1, "m1", "Full"),
    planLog("2026-07-20", 2, "m2", "Full"),
  ];
  // Target set 30% below what they actually ate → every macro scores 0.5.
  const low = { calories: Math.round(DAY_KCAL / 1.3), protein: Math.round(90 / 1.3), carbs: Math.round(130 / 1.3), fats: Math.round(22 / 1.3) };
  const s = summariseLogRange(logs, PLAN, { target: low, windowDays: 1 });
  assert.equal(Math.round(s.consistency!), 100);
  assert.ok(s.accuracy! > 45 && s.accuracy! < 55, `accuracy ~50%, got ${s.accuracy}`);
  assert.ok(s.adherence! > 45 && s.adherence! < 55, `adherence ~50%, got ${s.adherence}`);
});

test("the Claudine case: logging everything Off-plan no longer freezes adherence at 75%", () => {
  // Claudine tags every meal "Off-plan", which the status weights score 0.75 —
  // so her adherence read exactly 75% every day of every week no matter what she
  // ate. A number that cannot move cannot coach anyone. Scored on what she
  // actually ate against her target, a day on target is a day on target.
  const offPlanDay = (date: string) => [
    { ...planLog(date, 1, "m1", "Off-plan"), est_kcal: 540, est_protein: 45, est_carbs: 65, est_fats: 11 },
    { ...planLog(date, 2, "m2", "Off-plan"), est_kcal: 538, est_protein: 45, est_carbs: 65, est_fats: 11 },
  ];
  const logs = [...offPlanDay("2026-07-20"), ...offPlanDay("2026-07-21")];

  const old = summariseLogRange(logs, PLAN);
  assert.equal(Math.round(old.adherence!), 75, "the frozen number, for the record");
  assert.equal(old.adherenceBasis, "meal-status");

  const now = summariseLogRange(logs, PLAN, { target: ON_TARGET, windowDays: 2 });
  assert.equal(now.adherenceBasis, "logging+macros");
  assert.equal(Math.round(now.adherence!), 100, "logged both days, both on target");
});

test("the in-progress day comes out of BOTH sides of consistency", () => {
  // Today being half eaten is not the same as today being skipped. Charging
  // someone for a day that hasn't finished is exactly the wrong number this
  // module exists to stop.
  const logs = [
    planLog("2026-07-20", 1, "m1", "Full"),
    planLog("2026-07-20", 2, "m2", "Full"),
    planLog("2026-07-21", 1, "m1", "Full"),
    planLog("2026-07-21", 2, "m2", "Full"),
    planLog("2026-07-22", 1, "m1", "Full"), // today, breakfast only
  ];
  const s = summariseLogRange(logs, PLAN, {
    target: ON_TARGET,
    windowDays: 3,
    excludeDates: ["2026-07-22"],
  });
  assert.equal(s.loggedDays, 3, "they did log today");
  assert.equal(s.avgDays, 2);
  assert.equal(Math.round(s.consistency!), 100, "2 finished days out of 2 finished days");
  assert.equal(Math.round(s.adherence!), 100);
});

test("consistency never exceeds 100% even if the window length is understated", () => {
  const s = summariseLogRange(
    [planLog("2026-07-20", 1, "m1", "Full"), planLog("2026-07-21", 1, "m1", "Full")],
    PLAN,
    { target: ON_TARGET, windowDays: 1 },
  );
  assert.equal(Math.round(s.consistency!), 100);
});

test("with no target on file the old meal-status average still runs", () => {
  // Nothing to be accurate against, so the legacy number is better than none —
  // and adherenceBasis says so, so the copy can describe it honestly.
  const s = summariseLogRange(
    [planLog("2026-07-20", 1, "m1", "Full"), planLog("2026-07-20", 2, "m2", "Skipped")],
    PLAN,
    { windowDays: 7 },
  );
  assert.equal(s.adherenceBasis, "meal-status");
  assert.equal(Math.round(s.adherence!), 50);
  assert.equal(s.accuracy, null);
  assert.equal(Math.round(s.consistency!), 14, "consistency is still reported on its own");
});
