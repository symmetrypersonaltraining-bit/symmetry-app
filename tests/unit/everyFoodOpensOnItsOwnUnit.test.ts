import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { householdServing, storedDefaultServing, type CatalogRow } from "../../src/lib/nutrition/foodResolve";

/**
 * EVERY FOOD OPENS ON A UNIT A PERSON WOULD SAY.
 *
 * Dustin, 8 Sep, after two weeks of it: *"i want it to open to the correct
 * grams for 1 serving, not '1 serving' so butter should open to 1 tbsp and you
 * can edit it if you had more than that. every single food in that database
 * needs to be set up like that."*
 *
 * The decision now lives in Postgres — food_default_serving() — and every row
 * carries its answer. This file pins the app half: the stored answer is USED,
 * it beats the guessing that came before it, and a stored "100 g" is not
 * mistaken for a portion.
 *
 * Why the old path stays underneath: the legacy `foods` table has no such
 * column, and neither does a row written before the fill. Deleting the fallback
 * would trade one silent wrong answer for another.
 */

const base: CatalogRow = {
  id: "f1", name: "Butter", brand: null,
  kcal: 717, protein: 0.9, carbs: 0.1, fats: 81,
  serving_desc: "100 g", serving_grams: 100, verified: true, source: "usda_branded",
};

test("the stored default is what the food opens on", () => {
  const row: CatalogRow = {
    ...base,
    serving_options: [{ desc: "100 g", grams: 100 }, { desc: "1 oz", grams: 28.35 }],
    default_serving_desc: "1 tbsp",
    default_serving_grams: 14,
  };
  const s = householdServing(row);
  assert.equal(s?.label, "tbsp");
  assert.equal(s?.gramsEach, 14);
});

test("a counted default divides: 2 tbsp of 32 g is a 16 g tablespoon", () => {
  const s = storedDefaultServing({ ...base, default_serving_desc: "2 tbsp", default_serving_grams: 32 });
  assert.equal(s?.label, "tbsp");
  assert.equal(s?.gramsEach, 16);
});

test("it beats the alphabetical cup that has twice doubled people's calories", () => {
  // The real "Bananas, raw" row: its own options lead with a volume, and the
  // 26 Aug bug was taking it. The stored default knows it is a banana.
  const row: CatalogRow = {
    ...base, name: "Bananas, raw", kcal: 89,
    serving_options: [{ desc: "1 cup, mashed", grams: 225 }, { desc: "1 cup, sliced", grams: 150 }],
    default_serving_desc: "1 medium",
    default_serving_grams: 118,
  };
  const s = householdServing(row);
  assert.equal(s?.label, "medium");
  assert.equal(s?.gramsEach, 118);
});

test("a stored '100 g' is the quoting basis, not a portion", () => {
  // 10 rows in the catalogue have nothing better to offer. They must fall
  // through to the old path rather than opening on "1 100 g", which is the
  // screen Dustin got on 28 Aug for a bagel.
  const row: CatalogRow = {
    ...base,
    serving_options: [{ desc: "1 bagel", grams: 95 }],
    default_serving_desc: "100 g",
    default_serving_grams: 100,
  };
  assert.equal(storedDefaultServing(row), null);
  assert.equal(householdServing(row)?.label, "bagel");
});

test("no stored default: the old path still answers", () => {
  const row: CatalogRow = { ...base, serving_options: [{ desc: "1 tbsp", grams: 14.2 }] };
  assert.equal(householdServing(row)?.label, "tbsp");
});

// ── the sheet, and the order it decides in ─────────────────────────────────

const SHEET = readFileSync(join(process.cwd(), "src/app/(app)/nutrition/v3/FoodSearchSheet.tsx"), "utf8");

test("the search sheet reads the stored default", () => {
  assert.match(SHEET, /default_serving_desc/);
  assert.match(SHEET, /defaultServing/);
});

test("HIS unit still wins over the stored default", () => {
  // Dustin, 8 Sep, answering which wins for the 299 foods he programmes: "A" —
  // his always. unitHeUses runs first and the stored default is guarded on it.
  const his = SHEET.indexOf("const his = unitHeUses(f.name)");
  const stored = SHEET.indexOf("if (!hisNamed && f.defaultServing)");
  assert.ok(his > 0 && stored > his, "the stored default must be checked after his unit map, and guarded on it");
});

test("the borrow only runs when nothing else answered", () => {
  assert.match(SHEET, /if \(!hisNamed && !f\.defaultServing && !heWeighsIt && !f\.named\.length && f\.baseGrams\)/);
});
