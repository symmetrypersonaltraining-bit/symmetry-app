// THE APP DOES NOT CHANGE THE NUMBERS DUSTIN SET.
//
// Dustin, 23 Aug, after I did exactly that: "if i set the numbers they stay. if
// i build the mealplan its based on the numbers I set, they stay the app
// doesn't change numbers."
//
// The direction of authority runs one way. He sets the macro targets. He then
// builds the meal plan TO HIT those targets. So the plan is downstream of the
// numbers, and a plan whose items sum to something else is a plan that needs
// fixing — never a reason for the app to quietly show a different target.
//
// I got this backwards and shipped it. `dailyTarget` was changed to sum the
// plan's items for every client, which moved eleven people's targets, three of
// them by 600-960 kcal. Reverted. This test is here so the next person who
// notices that "the bar and the food underneath it are two separate numbers"
// finds out why before changing it.
//
// THE ONE EXCEPTION IS NOT AN EXCEPTION TO THAT RULE. A day-group plan carries
// a `day_group` array — different menus for different weekdays — and its target
// is the menu's own total. Only Tyler Dorsett and Hassan Kareem have those, and
// they are precisely the two clients Dustin does NOT write plans for: "someone
// else does their meal plan and I imported it into there so their macro numbers
// need to match what that plan says each day even if it changes." Their menus
// are Week 23 / Week 16, tagged Days 1,4,6 · 2,5 · 3,7, and they genuinely
// differ by day:
//
//   Tyler   Mon/Thu/Sat 2,100 · Tue/Fri 2,197 · Wed/Sun 2,135
//   Hassan  Mon/Thu/Sat 2,417 · Tue/Fri 2,501
//
// So the pre-existing behaviour already satisfies both halves of what he asked
// for, and the correct change was no change at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dayGroupMenuTarget, type PlanMeal } from "../../src/lib/nutrition/dailyTotals.ts";
import { summariseLogRange } from "../../src/lib/nutrition/rangeAverages.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const NUTRITION = readFileSync(join(ROOT, "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
const HOME_CARD = readFileSync(join(ROOT, "src/components/HomeMacrosCard.tsx"), "utf8");

test("the daily target falls back to macro_targets, not to a plan sum", () => {
  assert.match(
    NUTRITION,
    /const dailyTarget = dayGroupTarget \?\? macroTarget;/,
    "dailyTarget no longer ends at macroTarget — the app is computing a target Dustin did not set",
  );
});

test("the only plan-sum helper refuses a plan that is not day-grouped", () => {
  // The gate lives INSIDE dayGroupMenuTarget rather than at each call site, so
  // a caller cannot point it at an ordinary client's plan and start overwriting
  // numbers Dustin set. Every plan he writes is untagged.
  const oneMeal = [{ id: "m", name: "M1", timing: null, position: 1, swaps: null,
    meal_items: [{ id: "i", food: "chicken", amount: 1, unit: "g", is_unlimited: false,
      protein: 40, carbs: 10, fats: 5, position: 1 }] }] as PlanMeal[];

  assert.equal(dayGroupMenuTarget({ day_group: null, meals: oneMeal }), null, "untagged plan");
  assert.equal(dayGroupMenuTarget({ day_group: [], meals: oneMeal }), null, "empty day_group");
  assert.equal(dayGroupMenuTarget(null), null, "no plan");

  const tagged = dayGroupMenuTarget({ day_group: [1, 4, 6], meals: oneMeal });
  assert.ok(tagged, "a day-grouped menu IS the target for that weekday");
  assert.equal(tagged!.protein, 40);
});

test("a day-group menu counts one option per slot", () => {
  const withOptions = [
    { id: "a", name: "M1 A", timing: null, position: 1, swaps: null,
      meal_items: [{ id: "1", food: "x", amount: 1, unit: "g", is_unlimited: false, protein: 10, carbs: 0, fats: 0, position: 1 }] },
    { id: "b", name: "M1 B", timing: null, position: 1, swaps: null,
      meal_items: [{ id: "2", food: "y", amount: 1, unit: "g", is_unlimited: false, protein: 99, carbs: 0, fats: 0, position: 1 }] },
  ] as PlanMeal[];
  assert.equal(dayGroupMenuTarget({ day_group: [3, 7], meals: withOptions })!.protein, 10);
});

test("the home ring takes its target from macro_targets alone", () => {
  assert.match(
    HOME_CARD,
    /if \(mt\) setTarget\(\{ calories: mt\.calories/,
    "the home ring is computing a target instead of reading the one on file",
  );
  assert.ok(
    !/planDayTarget/.test(HOME_CARD),
    "the home ring is summing the plan — that number is not Dustin's to overwrite",
  );
});

test("no ungated plan-sum helper exists", () => {
  // planDayTarget() was added, used, and removed on 23 Aug. It summed ANY
  // plan, which is the thing that must not be easy to reach for.
  const daily = readFileSync(join(ROOT, "src/lib/nutrition/dailyTotals.ts"), "utf8");
  assert.ok(
    !/export function planDayTarget/.test(daily),
    "planDayTarget is back; the target is macro_targets unless the plan is day-grouped",
  );
});

test("adherence scores each day against THAT day's target", () => {
  // Dustin, 23 Aug: "adherance needs to be % of each day averaged over the
  // week." Tyler's menu is 2,100 on Mon and 2,197 on Tue; scoring both against
  // one number marks a day he hit exactly as a day he missed.
  const meals = [{ id: "m", name: "M1", timing: null, position: 1, swaps: null,
    meal_items: [{ id: "i", food: "f", amount: 1, unit: "g", is_unlimited: false,
      protein: 100, carbs: 100, fats: 20, position: 1 }] }] as PlanMeal[];
  const logs = [
    { log_date: "2026-08-24", meal_position: 1, meal_id: "m", adherence: "Full" },
    { log_date: "2026-08-25", meal_position: 1, meal_id: "m", adherence: "Full" },
  ] as unknown as Parameters<typeof summariseLogRange>[0];

  // Both days ate exactly the same food. Give each day a target equal to it and
  // adherence is perfect; give both days a target twice the size and it is not.
  const exact = { calories: 980, protein: 100, carbs: 100, fats: 20 };
  const onTarget = summariseLogRange(logs, meals, {
    windowDays: 2, target: null, targetForDate: () => exact,
  });
  const wrongTarget = summariseLogRange(logs, meals, {
    windowDays: 2, target: null,
    targetForDate: () => ({ calories: 1960, protein: 200, carbs: 200, fats: 40 }),
  });

  assert.ok(onTarget.accuracy != null && wrongTarget.accuracy != null);
  assert.ok(
    onTarget.accuracy! > wrongTarget.accuracy!,
    "the per-day target is not reaching the score",
  );
});

test("targetForDate wins over the single range target", () => {
  const meals = [{ id: "m", name: "M1", timing: null, position: 1, swaps: null,
    meal_items: [{ id: "i", food: "f", amount: 1, unit: "g", is_unlimited: false,
      protein: 50, carbs: 50, fats: 10, position: 1 }] }] as PlanMeal[];
  const logs = [{ log_date: "2026-08-24", meal_position: 1, meal_id: "m", adherence: "Full" }
  ] as unknown as Parameters<typeof summariseLogRange>[0];
  const perfectForThatDay = { calories: 490, protein: 50, carbs: 50, fats: 10 };
  const wildlyWrongRangeTarget = { calories: 9999, protein: 999, carbs: 999, fats: 999 };

  const r = summariseLogRange(logs, meals, {
    windowDays: 1, target: wildlyWrongRangeTarget, targetForDate: () => perfectForThatDay,
  });
  assert.ok(r.accuracy != null && r.accuracy > 95, `expected a near-perfect day, got ${r.accuracy}`);
});
