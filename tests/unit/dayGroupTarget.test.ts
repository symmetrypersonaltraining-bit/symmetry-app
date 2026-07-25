// ============================================================================
// Unit test — day-group daily TARGET = the active menu's own totals.
// Run: npm run test:unit   (node --import tsx --test)
//
// The v3 logger derives a day-group day's macro target by summing the active
// plan's meals via planMealMacros (the SAME per-meal summation that produces the
// "515 kcal" per-meal figures), one meal per position. This test reuses that
// exact source to prove: a menu whose items sum to 2,100 kcal / 180P yields a
// 2,100 / 180 target, and a different day-group menu yields its own total.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planMealMacros, kcalOf, PlanMeal } from "../../src/lib/nutrition/dailyTotals";

// Mirror of NutritionV3Client's dayGroupTarget summation (first meal per
// position, planMealMacros per meal, 4/4/9 kcal).
function menuTarget(meals: PlanMeal[]) {
  const byPos = new Map<number, PlanMeal>();
  for (const m of meals) if (!byPos.has(m.position)) byPos.set(m.position, m);
  let calories = 0, protein = 0, carbs = 0, fats = 0;
  for (const m of byPos.values()) {
    const mm = planMealMacros(m);
    calories += mm.kcal; protein += mm.protein; carbs += mm.carbs; fats += mm.fats;
  }
  return { calories, protein, carbs, fats };
}

function item(id: string, protein: number, carbs: number, fats: number): PlanMeal["meal_items"][number] {
  return { id, food: id, amount: 1, unit: "serving", is_unlimited: false, protein, carbs, fats, position: 1 };
}
function meal(id: string, position: number, items: PlanMeal["meal_items"]): PlanMeal {
  return { id, name: id, timing: null, position, meal_items: items };
}

describe("day-group daily target = menu totals", () => {
  it("a training-day menu summing to 2,100 kcal / 180P shows 2,100 / 180", () => {
    // 180P + 195C (=1500 kcal from 4/4) leaves 600 kcal → 66.67F. Use round numbers:
    // 180P/195C/66.6667F. Build across 3 meals/positions.
    const meals: PlanMeal[] = [
      meal("m1", 1, [item("a", 60, 65, 22.2222)]),
      meal("m2", 2, [item("b", 60, 65, 22.2222)]),
      meal("m3", 3, [item("c", 60, 65, 22.2223)]),
    ];
    const t = menuTarget(meals);
    assert.equal(Math.round(t.protein), 180);
    assert.equal(Math.round(t.carbs), 195);
    assert.equal(Math.round(t.calories), 2100);
    // The kcal must equal 4/4/9 of the summed macros (the app's rule).
    assert.equal(Math.round(t.calories), Math.round(kcalOf(t.protein, t.carbs, t.fats)));
  });

  it("a rest-day menu has its OWN (lower) total — switching dates changes target", () => {
    const rest: PlanMeal[] = [
      meal("r1", 1, [item("a", 50, 40, 15)]),
      meal("r2", 2, [item("b", 50, 40, 15)]),
    ];
    const t = menuTarget(rest);
    assert.equal(Math.round(t.protein), 100);
    assert.equal(Math.round(t.carbs), 80);
    assert.equal(Math.round(t.calories), Math.round(100 * 4 + 80 * 4 + 30 * 9)); // 990
  });

  it("uses the FIRST meal per position for option slots (matches the day render)", () => {
    const withOptions: PlanMeal[] = [
      meal("opt-a", 1, [item("a", 40, 40, 10)]), // chosen (first at pos 1)
      meal("opt-b", 1, [item("b", 99, 99, 99)]), // alternate at pos 1 — excluded
      meal("m2", 2, [item("c", 30, 30, 10)]),
    ];
    const t = menuTarget(withOptions);
    assert.equal(Math.round(t.protein), 70); // 40 + 30, not opt-b
    assert.equal(Math.round(t.carbs), 70);
  });
});
