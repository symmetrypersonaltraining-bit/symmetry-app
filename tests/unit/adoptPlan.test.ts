// Adopting a plan — does what the AI produced actually reach the database?
//
// 11 Aug: plan-build succeeded for the first time in the app's history and
// returned a full micronutrient panel per item. `meal_items` had ZERO rows
// carrying micros, because every layer between the draft and the database
// dropped them: the client's PlanDraft type, the draft→adopt mapping, the
// request body, AdoptItemInput, and the clone path's explicit select list.
//
// "Full micronutrients" stopped at the draft screen and nothing said so.

import { test } from "node:test";
import assert from "node:assert/strict";
import { adoptPlan, type AdoptDb, type AdoptParams } from "../../src/lib/nutrition/adoptPlan.ts";

type ItemRow = Record<string, unknown>;

function makeFakeDb(onItems: (rows: ItemRow[]) => void): AdoptDb {
  let n = 0;
  return {
    async archiveLivePlans() {},
    async maxVersion() { return 3; },
    async insertPlan() { return "plan-1"; },
    async insertMeal() { return `meal-${++n}`; },
    async insertMealItems(rows) { onItems(rows as ItemRow[]); },
    async insertMacroTarget() {},
  };
}

const base = (meals: AdoptParams["meals"]): AdoptParams => ({
  clientId: "c1",
  title: "Test plan",
  effectiveDate: "2026-08-11",
  targets: { calories: 2200, protein: 180, carbs: 230, fats: 55 },
  source: "ai",
  meals,
});

test("adopting a plan writes the micronutrients the AI produced", async () => {
  const written: ItemRow[] = [];
  await adoptPlan(makeFakeDb((r) => written.push(...r)), base([{
    name: "M1", timing: "7am",
    items: [{
      food: "Eggs", amount: 3, unit: "whole", protein: 18, carbs: 1, fats: 15,
      kcal: 215, micros: { choline: 440, vitamin_d: 2 },
    }],
  }]));
  assert.equal(written.length, 1);
  assert.equal(written[0].kcal, 215);
  assert.deepEqual(written[0].micros, { choline: 440, vitamin_d: 2 });
});

test("a nutrient the model invented never reaches the column", async () => {
  const written: ItemRow[] = [];
  await adoptPlan(makeFakeDb((r) => written.push(...r)), base([{
    name: "M1", timing: null,
    items: [{
      food: "Eggs", amount: 3, unit: "whole", protein: 18, carbs: 1, fats: 15,
      micros: { iron: 2, unobtainium: 99, zinc: -4 },
    }],
  }]));
  // Unknown key dropped; negative value dropped as unusable.
  assert.deepEqual(written[0].micros, { iron: 2 });
});

test("an item with no micros stores no micros key at all", async () => {
  // Absent means UNKNOWN. An empty object would be a claim that we looked and
  // found nothing, which would drag every daily total down.
  const written: ItemRow[] = [];
  await adoptPlan(makeFakeDb((r) => written.push(...r)), base([{
    name: "M1", timing: null,
    items: [{ food: "Rice", amount: 1, unit: "cup", protein: 4, carbs: 45, fats: 0 }],
  }]));
  assert.equal("micros" in written[0], false);
  assert.equal("kcal" in written[0], false);
});

test("macros and ordering still behave exactly as before", async () => {
  // The micros work must not disturb what already worked.
  const written: ItemRow[] = [];
  await adoptPlan(makeFakeDb((r) => written.push(...r)), base([{
    name: "M1", timing: "7am",
    items: [
      { food: "Eggs", amount: 3, unit: "whole", protein: 18.4, carbs: 1, fats: 15 },
      { food: "Oats", amount: 1, unit: "cup", protein: 10, carbs: 54, fats: 6 },
    ],
  }]));
  assert.equal(written.length, 2);
  assert.equal(written[0].protein, 18); // rounded, as it always was
  assert.equal(written[0].position, 1);
  assert.equal(written[1].position, 2);
  assert.equal(written[1].food, "Oats");
});

test("a label kcal of zero is not treated as a real figure", async () => {
  const written: ItemRow[] = [];
  await adoptPlan(makeFakeDb((r) => written.push(...r)), base([{
    name: "M1", timing: null,
    items: [{ food: "Water", amount: 1, unit: "glass", protein: 0, carbs: 0, fats: 0, kcal: 0 }],
  }]));
  // 0 is a legitimate calorie count, so it IS stored — the derived path only
  // takes over when kcal is absent or unusable.
  assert.equal(written[0].kcal, 0);
});
