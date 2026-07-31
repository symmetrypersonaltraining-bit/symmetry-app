import test from "node:test";
import assert from "node:assert/strict";
import { planItemsToCustom } from "../../src/lib/nutrition/mealToCustom.ts";
import { planMealMacros, customMealMacros, type PlanMeal } from "../../src/lib/nutrition/dailyTotals.ts";

const item = (id: string, food: string, amount: number | null, unit: string | null, p: number, c: number, f: number, position: number, is_unlimited = false) =>
  ({ id, food, amount, unit, is_unlimited, protein: p, carbs: c, fats: f, position });

const MEAL: PlanMeal = {
  id: "m1",
  name: "Breakfast",
  timing: "7:00 AM",
  position: 1,
  meal_items: [
    item("i1", "Egg whites", 8, "oz", 26, 2, 0, 1),
    item("i2", "Oats", 1, "cup", 10, 54, 6, 2),
    item("i3", "Spinach", null, null, 0, 0, 0, 3, true),
  ],
};

test("no overrides — every item carries through at full amount", () => {
  const out = planItemsToCustom(MEAL, null);
  assert.equal(out.length, 3);
  assert.equal(out[0].n, "Egg whites");
  assert.equal(out[0].a, "8 oz");
  assert.equal(out[1].a, "1 cup");
  assert.equal(out[2].a, null);
  assert.equal(out[2].free, true);
});

test("a stepped-down item is carried at the ADJUSTED amount, not the plan's", () => {
  // The bug this file exists for: halve the oats, copy the meal, and the copy
  // used to come back with a full cup.
  const out = planItemsToCustom(MEAL, { i2: { amount: 0.5 } });
  const oats = out.find((x) => x.n === "Oats")!;
  assert.equal(oats.a, "0.5 cup");
  assert.equal(oats.p, 5);
  assert.equal(oats.c, 27);
  assert.equal(oats.f, 3);
});

test("an item removed today (amount 0) is dropped from the copy", () => {
  const out = planItemsToCustom(MEAL, { i2: { amount: 0 } });
  assert.equal(out.length, 2);
  assert.ok(!out.some((x) => x.n === "Oats"));
});

test("foods added today ride along, servings become the item factor", () => {
  const out = planItemsToCustom(MEAL, { __added: [{ name: "Almonds", servings: 2, p: 6, c: 6, f: 14 }] });
  const nuts = out.at(-1)!;
  assert.equal(nuts.n, "Almonds");
  assert.equal(nuts.fac, 2);
  assert.equal(nuts.a, "2 servings");
});

test("__meta-only overrides are not mistaken for item edits", () => {
  // A log carrying just display ordering must not scale anything.
  const out = planItemsToCustom(MEAL, { __ord: 3, __unlogged: true });
  assert.equal(out.length, 3);
  assert.equal(out[0].a, "8 oz");
});

test("a copied meal totals exactly what the meal it came from totals", () => {
  // The invariant that matters to a client: the card said 612 cal, so the copy
  // says 612 cal. Checked across plain, scaled, removed and added cases.
  for (const ov of [
    null,
    { i2: { amount: 0.5 } },
    { i1: { amount: 4 }, i2: { amount: 0 } },
    { __added: [{ name: "Almonds", servings: 2, p: 6, c: 6, f: 14 }] },
    { i2: { amount: 0.5 }, __added: [{ name: "Berries", servings: 1, p: 1, c: 12, f: 0 }] },
  ]) {
    const expected = planMealMacros(MEAL, ov);
    const actual = customMealMacros({ name: "copy", items: planItemsToCustom(MEAL, ov) });
    assert.equal(Math.round(actual.kcal), Math.round(expected.kcal), `kcal for ${JSON.stringify(ov)}`);
    assert.equal(Math.round(actual.protein), Math.round(expected.protein));
    assert.equal(Math.round(actual.carbs), Math.round(expected.carbs));
    assert.equal(Math.round(actual.fats), Math.round(expected.fats));
  }
});

test("a missing meal yields an empty list rather than throwing", () => {
  assert.deepEqual(planItemsToCustom(null, { i2: { amount: 1 } }), []);
  assert.deepEqual(planItemsToCustom(undefined, null), []);
});
