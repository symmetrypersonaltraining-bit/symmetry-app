// Full nutrients had to actually reach storage.
//
// Dustin, 20 Aug: "Full nutrients in the logger should already be done. If not,
// let's get that done."
//
// It was 95% done. The registry (37 nutrients), the ALL NUTRIENTS panel, the
// `micros` columns on every table, and the food picker carrying micros onto the
// item — all built. What was missing was the last step: the aggregate was
// computed and then projected down to four values before being written.
//
// Measured against the live database before this change:
//   574,632 foods in the catalog · 177,584 with micronutrients · 543,178 with sodium
//   937 meal logs in 30 days · 26 with micronutrients ON THEIR ITEMS · 0 stored
//
// The data reached the row and was discarded one step before it was saved.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  splitNutrientsForStorage, readNutrients, LEGACY_NUTRIENT_KEYS, NUTRIENT_KEYS,
} from "../../src/lib/nutrition/nutrients.ts";

test("the four legacy keys go to their own columns", () => {
  const { legacy, micros } = splitNutrientsForStorage({
    fiber: 8, sugar: 12, sodium: 640, sat_fat: 3,
  });
  assert.deepEqual(legacy, { fiber: 8, sugar: 12, sodium: 640, sat_fat: 3 });
  assert.equal(micros, null, "a legacy-only map must not also write a micros bag");
});

test("everything else goes to micros", () => {
  const { legacy, micros } = splitNutrientsForStorage({
    fiber: 8, potassium: 900, calcium: 200, vitamin_c: 40,
  });
  assert.deepEqual(legacy, { fiber: 8 });
  assert.deepEqual(micros, { potassium: 900, calcium: 200, vitamin_c: 40 });
});

test("NO DUAL WRITE — a legacy key never appears in micros", () => {
  // Writing fibre to both is how the same fact starts disagreeing with itself,
  // which is this codebase's most-repeated failure.
  const all: Record<string, number> = {};
  for (const k of NUTRIENT_KEYS) all[k] = 1;
  const { micros } = splitNutrientsForStorage(all);
  for (const k of LEGACY_NUTRIENT_KEYS) {
    assert.ok(!(micros && k in micros), k + " was written to both places");
  }
});

test("nothing known stores null, not an empty object", () => {
  // {} and null both mean "nothing", and storing {} makes "we looked and found
  // nothing" indistinguishable from "we never looked".
  assert.equal(splitNutrientsForStorage({}).micros, null);
  assert.deepEqual(splitNutrientsForStorage({}).legacy, {});
});

test("nulls and unknown keys are dropped, not stored as zero", () => {
  const { legacy, micros } = splitNutrientsForStorage({
    fiber: null as unknown as number, potassium: null as unknown as number,
    not_a_nutrient: 5, calcium: 200,
  });
  assert.deepEqual(legacy, {}, "a null must not become a zero in a column");
  assert.deepEqual(micros, { calcium: 200 });
});

test("zero is a real value and survives", () => {
  // Zero grams of sugar is a fact. Only null means unknown.
  const { legacy, micros } = splitNutrientsForStorage({ sugar: 0, calcium: 0 });
  assert.deepEqual(legacy, { sugar: 0 });
  assert.deepEqual(micros, { calcium: 0 });
});

test("split then read is a round trip", () => {
  // readNutrients is the only reader; this is its counterpart, so the two have
  // to agree or the panel shows something different from what was stored.
  const original = { fiber: 8, sodium: 640, potassium: 900, vitamin_c: 40, iron: 3 };
  const { legacy, micros } = splitNutrientsForStorage(original);
  const back = readNutrients(micros, {
    fiber: legacy.fiber ?? null, sugar: legacy.sugar ?? null,
    sodium: legacy.sodium ?? null, sat_fat: legacy.sat_fat ?? null,
  });
  for (const [k, v] of Object.entries(original)) assert.equal(back[k], v, k + " did not survive");
});

// ─── wired into the write path ──────────────────────────────────────────────

test("the logger stores the full panel, not four of it", () => {
  const C = readFileSync(
    join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
  assert.match(C, /const full = customMealNutrientMap\(custom\);/,
    "it reads the four-value projection again — the other 29 go on the floor");
  assert.match(C, /const \{ legacy, micros \} = splitNutrientsForStorage\(full\);/);
  assert.match(C, /payload\.est_micros = micros;/,
    "est_micros is never written, which is why 0 of 937 logs had it");
});

test("the projection is not used for storage anywhere", () => {
  const C = readFileSync(
    join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
  const code = C.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.doesNotMatch(code, /customMealNutrients\(custom\)/,
    "customMealNutrients is a deliberate projection to four keys — never a storage source");
});
