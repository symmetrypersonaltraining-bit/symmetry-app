// Adding a food to a planned meal threw away everything but three macros.
//
// The search sheet has scaled and returned all 33 nutrients for a long time,
// plus the amount label the client picked. Both add paths wrote
// { food_id, name, servings, p, c, f } and dropped the rest, and the nutrient
// totaller had a comment saying added foods "carry macros only" — true of the
// write, not of the sheet. So a food with a full lab panel in the catalogue
// became a three-macro food the moment it was added to a meal, and the day's
// fibre, sugar, sodium and saturated fat quietly understated themselves.

import test from "node:test";
import assert from "node:assert/strict";
import { planMealNutrientMap, type PlanMeal, type ItemOverrides } from "../../src/lib/nutrition/dailyTotals";

const EMPTY_MEAL: PlanMeal = { id: "m1", name: "Lunch", position: 1, meal_items: [] } as unknown as PlanMeal;

test("an added food contributes its nutrients to the day", () => {
  const ov = {
    __added: [{ name: "Black beans", servings: 1, p: 15, c: 40, f: 1,
                fi: 15, su: 0.6, so: 400, sf: 0.1 }],
  } as unknown as ItemOverrides;
  const m = planMealNutrientMap(EMPTY_MEAL, ov);
  assert.equal(Number(m.fiber), 15, "fibre was dropped");
  assert.equal(Number(m.sodium), 400, "sodium was dropped");
  assert.equal(Number(m.sat_fat), 0.1);
});

test("the other 29 nutrients survive too", () => {
  const ov = {
    __added: [{ name: "Spinach", servings: 1, p: 3, c: 4, f: 0,
                mi: { iron: 2.7, calcium: 99, vitamin_c: 28 } }],
  } as unknown as ItemOverrides;
  const m = planMealNutrientMap(EMPTY_MEAL, ov);
  assert.equal(Number(m.iron), 2.7);
  assert.equal(Number(m.calcium), 99);
  assert.equal(Number(m.vitamin_c), 28);
});

test("a food with no nutrient data contributes nothing, not a false zero", () => {
  // An unknown is not a zero. Writing 0 mg of sodium here would make the day
  // total look complete when it is not.
  const ov = { __added: [{ name: "Something", servings: 1, p: 1, c: 1, f: 1 }] } as unknown as ItemOverrides;
  const m = planMealNutrientMap(EMPTY_MEAL, ov);
  assert.deepEqual(Object.keys(m), [], "an unknown must stay unknown");
});

test("two added foods add up", () => {
  const ov = {
    __added: [
      { name: "A", servings: 1, p: 0, c: 0, f: 0, fi: 5, so: 100 },
      { name: "B", servings: 1, p: 0, c: 0, f: 0, fi: 3, so: 250 },
    ],
  } as unknown as ItemOverrides;
  const m = planMealNutrientMap(EMPTY_MEAL, ov);
  assert.equal(Number(m.fiber), 8);
  assert.equal(Number(m.sodium), 350);
});
