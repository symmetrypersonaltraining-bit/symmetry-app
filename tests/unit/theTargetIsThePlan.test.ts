// THE NUMBER AT THE TOP OF THE FOOD LOGGER IS THE PLAN.
//
// Dustin, 23 Aug: "whatever I set for the meal plan, the macros on the day
// chart in the food logger read what the actual plan is for that day... If I
// change my meal plan each day, it needs to pick up what I'm actually at."
//
// It used to read `macro_targets` — a separate hand-kept row, resolved once on
// the server for TODAY and passed down as a prop. Two things fell out of that,
// and both are what he hit:
//
//   1. The bar and the food under it were independent numbers. Change a week's
//      plan and the bar still measured against the old row until somebody
//      remembered to write a new macro_targets row by hand.
//   2. Paging forward to next Monday showed TODAY's target over next Monday's
//      food, because the prop never re-resolved for the viewed date.
//
// The plan-summing code already existed. It was gated on the plan being a
// DAY-GROUP menu, so every ordinary client fell through to the old path. The
// gate is gone; the fallback survives only for a client with no plan at all.
//
// SEPARATELY, and deliberately NOT changed: the range AVERAGES. Dustin, same
// message: "if I'm looking at the eight week average, it needs to give me my
// actual averages that were logged. It does not need to worry about the
// changes." summariseLogRange computes those from the logged rows, and the last
// test here pins that a plan change cannot move them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planDayTarget, computeDayTotals, type PlanMeal, type LogRow } from "../../src/lib/nutrition/dailyTotals.ts";
import { pickPlanForDate } from "../../src/lib/nutrition/resolvePlan.ts";
import { summariseLogRange } from "../../src/lib/nutrition/rangeAverages.ts";

const ROOT = join(import.meta.dirname, "..", "..");

/** A meal at `position` whose items sum to the given macros. */
function meal(id: string, position: number, p: number, c: number, f: number): PlanMeal {
  return {
    id, name: `M${position}`, timing: null, position, swaps: null,
    meal_items: [{ id: `${id}-i`, food: "food", amount: 1, unit: "g", is_unlimited: false, protein: p, carbs: c, fats: f, position: 1 }],
  } as PlanMeal;
}

// Dustin's real ladder, verified against the database on 22 Aug: the plan's own
// items sum to exactly the macro_targets rows that were being shown.
const BULK_STANDING = [meal("a", 1, 154, 231, 106), meal("b", 2, 100, 150, 80)]; // 254P 381C 186F
const BULK_REV2     = [meal("c", 1, 144, 227, 105), meal("d", 2, 100, 150, 80)]; // 244P 377C 185F
const STANDING_KCAL = planDayTarget(BULK_STANDING)!.kcal;
const REV2_KCAL = planDayTarget(BULK_REV2)!.kcal;

test("the target is the plan's own total, to the gram", () => {
  const t = planDayTarget(BULK_STANDING)!;
  assert.equal(t.protein, 254);
  assert.equal(t.carbs, 381);
  assert.equal(t.fats, 186);
  assert.equal(t.kcal, 254 * 4 + 381 * 4 + 186 * 9);
});

test("changing one week moves that week's target and nothing else", () => {
  // The ladder as it actually stands: standing plan, one changed week, resume.
  const plans = [
    { id: "v6", effective_date: "2026-08-31", status: "live", day_group: null, meals: BULK_STANDING },
    { id: "v5", effective_date: "2026-08-24", status: "live", day_group: null, meals: BULK_REV2 },
    { id: "v4", effective_date: "2026-08-17", status: "live", day_group: null, meals: BULK_STANDING },
  ];
  const targetOn = (d: string) => {
    const p = pickPlanForDate(plans, d);
    return planDayTarget((p?.meals as PlanMeal[]) ?? null);
  };

  assert.ok(STANDING_KCAL !== REV2_KCAL, "the fixture weeks must actually differ");
  assert.equal(targetOn("2026-08-22")!.kcal, STANDING_KCAL, "this week is the standing plan");
  assert.equal(targetOn("2026-08-24")!.kcal, REV2_KCAL, "Monday picks up the changed week");
  assert.equal(targetOn("2026-08-30")!.kcal, REV2_KCAL, "Sunday is still the changed week");
  assert.equal(targetOn("2026-08-31")!.kcal, STANDING_KCAL, "the following Monday resumes on its own");
  assert.equal(targetOn("2026-09-14")!.kcal, STANDING_KCAL, "and stays resumed");
});

test("a day with no plan has no target, rather than a target of zero", () => {
  // Zero would paint a full red bar over the first bite of food.
  assert.equal(planDayTarget([]), null);
  assert.equal(planDayTarget(null), null);
  assert.equal(planDayTarget([meal("z", 1, 0, 0, 0)]), null);
});

test("the target ignores what was actually eaten", () => {
  // The bar has two sides. This is the prescription; computeDayTotals is the
  // other half. If overrides leaked into the target they would move together
  // and the bar could never show a miss.
  const logs: LogRow[] = [
    { meal_position: 1, meal_id: "a", adherence: "Full", item_overrides: { "a-i": { amount: 0 } } } as unknown as LogRow,
  ];
  const eaten = computeDayTotals(logs, BULK_STANDING);
  const target = planDayTarget(BULK_STANDING)!;
  assert.equal(target.protein, 254, "the target is untouched by an override");
  assert.ok(eaten.protein < target.protein, "and the eaten side moved");
});

test("range averages are what was logged, and a plan change cannot move them", () => {
  const logs = [
    { log_date: "2026-08-20", meal_position: 1, meal_id: "a", adherence: "Full" },
    { log_date: "2026-08-21", meal_position: 1, meal_id: "a", adherence: "Full" },
  ] as unknown as (LogRow & { log_date: string })[];

  const underOldPlan = summariseLogRange(logs, BULK_STANDING, { windowDays: 14, target: null });
  // Same logs, same meals — a different TARGET is the only thing that changed.
  const underNewPlan = summariseLogRange(logs, BULK_STANDING, {
    windowDays: 14,
    target: { calories: 4148, protein: 244, carbs: 377, fats: 185 },
  });

  assert.equal(underOldPlan.kcal, underNewPlan.kcal, "the average is the food, not the target");
  assert.equal(underOldPlan.p, underNewPlan.p);
  assert.equal(underOldPlan.c, underNewPlan.c);
  assert.equal(underOldPlan.f, underNewPlan.f);
  assert.ok(underOldPlan.loggedDays === 2, "both days counted");
});

test("a plan with an empty core slot is not a target", () => {
  // Madeleine Coker's M2, M4 and M5 hold no food, so her plan sums to 973
  // against the 1,550 Dustin set her. That is a half-entered plan, not a wrong
  // target, and showing her 973 would be the app inventing a cut.
  const halfEntered = [
    meal("m1", 1, 39, 21, 17),
    { id: "m2", name: "M2", timing: null, position: 2, swaps: null, meal_items: [] },
    meal("m3", 3, 39, 34, 32),
    { id: "m4", name: "M4", timing: null, position: 4, swaps: null, meal_items: [] },
    { id: "m5", name: "M5", timing: null, position: 5, swaps: null, meal_items: [] },
  ] as PlanMeal[];
  assert.equal(planDayTarget(halfEntered), null);
});

test("an empty EXTRAS slot does not disqualify a finished plan", () => {
  // Slots 1-5 are the spine. An extras slot with nothing in it is normal.
  const withEmptyExtra = [
    ...[1, 2, 3, 4, 5].map((i) => meal(`m${i}`, i, 20, 20, 5)),
    { id: "x", name: "Extra", timing: null, position: 6, swaps: null, meal_items: [] },
  ] as PlanMeal[];
  const t = planDayTarget(withEmptyExtra);
  assert.ok(t, "a plan with all five core slots filled is still a target");
  assert.equal(t!.protein, 100);
});

test("options at a slot mean the day has no single total", () => {
  // Claudine Ocon has three options at each of five slots and they are NOT
  // interchangeable — her M1 runs 328-463 kcal, her M5 185-396. Summing
  // "whichever option sorts first" invents a number she never agreed to.
  const options = [
    meal("a", 1, 20, 30, 8),
    meal("b", 1, 35, 45, 12), // same slot, different option
    meal("c", 2, 20, 20, 5),
    meal("d", 3, 20, 20, 5),
    meal("e", 4, 20, 20, 5),
    meal("f", 5, 20, 20, 5),
  ];
  assert.equal(planDayTarget(options), null, "an options plan falls back to the dialled target");
});

test("both surfaces read the target from the one helper", () => {
  // The home ring and the Nutrition screen must not compute this twice. They
  // did once, and the two answers were allowed to differ.
  for (const f of [
    "src/app/(app)/nutrition/v3/NutritionV3Client.tsx",
    "src/components/HomeMacrosCard.tsx",
  ]) {
    const src = readFileSync(join(ROOT, f), "utf8");
    assert.match(src, /planDayTarget\(/, `${f} no longer reads the target from the plan`);
  }
});

test("no client-level gate stands between a plan and its target", () => {
  // Both the day_group gate and the later plan_locked gate were wrong for the
  // same reason: they decided WHOSE plan counts, when the only real question is
  // whether THIS plan can be read as one day. That question is answered once,
  // inside planDayTarget.
  const src = readFileSync(join(ROOT, "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
  assert.ok(!/const\s+isDayGroup\s*=/.test(src), "gated on day_group again");
  assert.ok(!/planLocked\s*\?/.test(src), "gated on plan_locked again");
});
