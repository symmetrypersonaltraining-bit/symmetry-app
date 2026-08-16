// Guard: a meal TYPED into the composer keeps its nutrients.
//
// Dustin, 4 Aug: "Need to track full nutrients on everywhere in food logger."
// EVERYWHERE is the word doing the work, and this is the third layer of the
// same path found dropping them — always a mapping layer, never the model and
// never the database:
//
//   · 14 Aug — CoachActionItem had no `micros` field, so the coach path lost
//     them the instant a parsed item crossed into the UI (coachItemsCarryNutrients)
//   · 15 Aug — FoodSearchSheet never read `food_catalog.micros`, so a USDA
//     whole food became a four-nutrient food when logged (foodSearchNutrients)
//   · here — `parseClient.mapItem` returned no nutrient fields AT ALL, so a
//     meal typed into the composer reached the database with macros and
//     nothing else
//
// Each layer was individually defensible, which is how all three survived
// review. /api/nutrition-ai/parse asks the model for all 33 nutrients;
// validateParseResult sanitises and returns them per item; CustomItem has `mi`
// for exactly that bag; the day total reads it. The client mapper in the middle
// silently discarded them, and absent is indistinguishable from "this food
// contains no fibre" unless you go and count rows.
//
// Three separate faults are pinned below, because fixing only the mapper would
// have left the numbers still wrong on screen:
//
//   1. the mapper drops the bag                       → mapItem carries `mi`
//   2. customMealNutrients read the four short keys
//      only, ignoring `mi` — and NutritionV3Client
//      derives the stored est_* COLUMNS from it, so
//      the row disagreed with the meal it came from  → make it a projection
//   3. logConsumedNutrientMap let those four columns
//      SHADOW the 33 on the items, so a meal that
//      knew thirty-three logged as four              → merge, columns win per key

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CustomMeta,
  LogRow,
  customMealNutrients,
  customMealNutrientMap,
  logConsumedNutrientMap,
} from "../../src/lib/nutrition/dailyTotals";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"));

// ── 1. The mapper ──────────────────────────────────────────────────────────

test("the AI parse mapper carries the nutrient bag onto the item", () => {
  const code = read("src/lib/nutrition/parseClient.ts");
  assert.match(code, /sanitizeNutrients\(raw\.micros/, "mapItem must read the item's micros");
  assert.match(code, /\bmi:\s/, "mapItem must put them on CustomItem.mi, which is what the day total reads");
});

test("an empty bag is stored as null, never as an object claiming zeroes", () => {
  // `{}` on a food would read as "we looked and it has none". It has not been
  // looked at. That distinction is the one rule this whole path is built on.
  const code = read("src/lib/nutrition/parseClient.ts");
  assert.match(code, /Object\.keys\(mi\)\.length \? mi : null/);
});

test("unknown keys from the model are dropped rather than stored", () => {
  // A hallucinated "vitamin_q" that reaches a log row silently never renders,
  // so it looks like data while being nothing.
  const code = read("src/lib/nutrition/parseClient.ts");
  assert.doesNotMatch(code, /mi:\s*raw\.micros/, "the bag must go through sanitizeNutrients, not straight through");
});

// ── 2. The four legacy nutrients are a PROJECTION ──────────────────────────

function metaWithBagOnly(): CustomMeta {
  // Exactly the shape the AI parse path produces: everything in `mi`, none of
  // the short keys. Before the fix this meal reported no fibre and no sodium.
  return {
    name: "Typed meal",
    items: [
      { n: "Chicken", a: "8 oz", p: 50, c: 0, f: 6, k: 260, mi: { fiber: 0, sodium: 120, potassium: 500 } },
      { n: "Rice", a: "1 cup", p: 4, c: 45, f: 0.5, k: 205, mi: { fiber: 2, sodium: 5, magnesium: 19 } },
    ],
  };
}

test("customMealNutrients sees nutrients that arrived in the full bag", () => {
  const n = customMealNutrients(metaWithBagOnly());
  assert.equal(n.fiber, 2, "fibre came from `mi` and used to be reported as unknown");
  assert.equal(n.sodium, 125);
});

test("it agrees with the full map exactly — it is a projection, not a sum of its own", () => {
  const meta = metaWithBagOnly();
  const map = customMealNutrientMap(meta);
  const four = customMealNutrients(meta);
  assert.equal(four.fiber, map.fiber);
  assert.equal(four.sodium, map.sodium);
  assert.equal(four.sugar, map.sugar ?? null);
  assert.equal(four.satFat, map.sat_fat ?? null);
});

test("the short keys still win over the bag, as the food database expects", () => {
  const meta: CustomMeta = {
    name: "x",
    items: [{ n: "f", p: 0, c: 0, f: 0, fi: 9, mi: { fiber: 1, sodium: 30 } }],
  };
  const n = customMealNutrients(meta);
  assert.equal(n.fiber, 9, "fi is written by the food catalog and is the more trustworthy of the two");
  assert.equal(n.sodium, 30, "the rest of the bag still contributes");
});

test("a per-item multiplier scales nutrients from the bag too", () => {
  const meta: CustomMeta = {
    name: "x",
    items: [{ n: "f", p: 0, c: 0, f: 0, fac: 2, mi: { fiber: 3 } }],
  };
  assert.equal(customMealNutrients(meta).fiber, 6);
});

test("a nutrient nobody reported stays unknown rather than becoming zero", () => {
  const n = customMealNutrients({ name: "x", items: [{ n: "f", p: 1, c: 1, f: 1 }] });
  assert.equal(n.fiber, null);
  assert.equal(n.sodium, null);
});

// ── 3. Four stored columns must not shadow 33 on the items ─────────────────

function customLog(over: Partial<LogRow> = {}): LogRow {
  return {
    id: "l1",
    meal_position: 1,
    meal_id: null,
    adherence: "Off-plan",
    macros_pending: false,
    est_kcal: 465, est_protein: 54, est_carbs: 45, est_fats: 6.5,
    item_overrides: { __custom: metaWithBagOnly() },
    ...over,
  } as LogRow;
}

test("the full panel survives being logged, columns and all", () => {
  // est_* is DERIVED from these same items, so letting it win outright turned
  // a 33-nutrient meal into a 4-nutrient meal at the moment of logging — and
  // did it silently, because four real numbers look like a working panel.
  const m = logConsumedNutrientMap(
    customLog({ est_fiber: 2, est_sugar: null, est_sodium: 125, est_sat_fat: null }),
  );
  assert.equal(m.potassium, 500, "potassium is on the items and has no column to be stored in");
  assert.equal(m.magnesium, 19);
  assert.equal(m.fiber, 2);
});

test("a stored column still wins over the item it came from", () => {
  // Same precedence readNutrients uses for flat-vs-jsonb: a hand-corrected
  // column is authoritative.
  const m = logConsumedNutrientMap(customLog({ est_sodium: 999 }));
  assert.equal(m.sodium, 999);
  assert.equal(m.potassium, 500, "and the rest of the bag is still there");
});

test("partial adherence prorates the whole panel, not just the four", () => {
  const m = logConsumedNutrientMap(customLog({ adherence: "1/2", est_fiber: 2, est_sodium: 125 }));
  assert.equal(m.potassium, 250);
  assert.equal(m.fiber, 1);
});

test("an unlogged custom meal contributes nothing", () => {
  const meta = { ...metaWithBagOnly(), unlogged: true };
  const m = logConsumedNutrientMap(customLog({ item_overrides: { __custom: meta }, est_sodium: 125 }));
  assert.deepEqual(m, {});
});

test("a custom meal that knows nothing does not borrow the plan meal's panel", () => {
  // It must not fall through to the plan-meal lookup: the meal in that slot is
  // not what was eaten, and crediting its nutrients would invent a panel.
  const plan = new Map([[1, {
    id: "m1", name: "Breakfast", position: 1,
    meal_items: [{ id: "i1", food: "Oats", amount: 1, unit: "cup", protein: 5, carbs: 27, fats: 3, position: 1, micros: { fiber: 4, potassium: 160 } }],
  } as never]]);
  const m = logConsumedNutrientMap(
    customLog({ item_overrides: { __custom: { name: "n", items: [{ n: "f", p: 1, c: 1, f: 1 }] } } }),
    undefined,
    plan,
  );
  assert.deepEqual(m, {});
});

// ── The screen ─────────────────────────────────────────────────────────────

test("the composer shows the panel it is about to log", () => {
  const code = read("src/app/(app)/nutrition/v3/ComposerSheet.tsx");
  assert.match(code, /customMealNutrientMap\(\{ name, items \}\)/, "the sheet must show what the day total will count");
  assert.match(code, /groupedNutrients\(/);
  assert.match(code, /formatNutrient\(/);
});

test("no local formatter in the composer — the registry is the only source", () => {
  // A second copy of this logic is exactly what produced the duplicate
  // nutrient panel that had to be reverted on 15 Aug.
  const code = read("src/app/(app)/nutrition/v3/ComposerSheet.tsx");
  assert.doesNotMatch(code, /const NUTRIENT|NUTRIENT_LABELS|function fmtNutrient/);
});

test("no detail is said out loud, not shown as a row of dashes", () => {
  const code = read("src/app/(app)/nutrition/v3/ComposerSheet.tsx");
  assert.match(code, /knownNutrients === 0/);
  assert.match(code, /No nutrient detail/);
});

for (const file of [
  "src/app/(app)/nutrition/v3/ComposerSheet.tsx",
  "src/app/(app)/nutrition/v3/FoodSearchSheet.tsx",
]) {
  test(`${file.split("/").pop()} rounds the daily-reference percentage`, () => {
    // pctOfDaily returns full precision on purpose, so every render site has to
    // round. FoodSearchSheet printed it raw: 0.9 mg of thiamin rendered as
    // "75.83333333333334%" on a client's phone.
    const code = read(file);
    assert.doesNotMatch(code, /\{pct\}%/, "raw percentage reaches the screen");
    assert.match(code, /Math\.round\(pct\)/);
  });
}
