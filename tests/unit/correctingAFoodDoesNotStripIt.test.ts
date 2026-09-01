// Correcting a scanned food left it worse than it was.
//
// The custom-food form collects a name, a serving and three macros, and the
// insert wrote exactly those. But "Fix these macros" on a scanned product goes
// through that same form — so correcting a Quest bar's protein also stripped
// its gram weight, its serving options and every nutrient the Open Food Facts
// import had given it.
//
// The gram weight is the load-bearing one. mapRow reads serving_grams into
// baseGrams; without it multiplierForNamed returns null, the unit list
// collapses to the single typed serving, and the serving-to-gram bridge has no
// base. A food entered as "1 slice" becomes a food you can only ever log in
// slices, permanently.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(import.meta.dirname, "..", "..", "src/app/(app)/nutrition/v3/FoodSearchSheet.tsx"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const insert = src.slice(src.indexOf('.from("food_catalog")'), src.indexOf(".select()"));

test("the insert writes a gram weight when the serving names one", () => {
  assert.match(src, /serving\.match\(/, "the typed serving is never parsed for a mass");
  assert.match(insert, /serving_grams: baseGrams/, "serving_grams is still dropped");
});

test("the insert writes serving options", () => {
  assert.match(insert, /serving_options: servingOptions/,
    "a food with no options can only be logged in the one unit it was typed as");
});

test("a correction carries the original's nutrients through", () => {
  for (const k of ["fiber", "sugar", "sodium", "sat_fat", "micros"]) {
    assert.ok(insert.includes("carry?." + k), k + " is blanked by a correction");
  }
});

test("editPicked captures what the row already knew", () => {
  const fn = src.slice(src.indexOf("function editPicked"), src.indexOf("async function saveCustomFood"));
  assert.match(fn, /setCarry\(\{/, "the correction form starts from nothing");
  assert.match(fn, /baseGrams: picked\.baseGrams/);
  assert.match(fn, /micros: picked\.micros/);
});

test("a mass is parsed out of the shapes servings actually take", () => {
  const re = /([\d.]+)\s*g\b/i;
  assert.equal("30 g".match(re)?.[1], "30");
  assert.equal("2 Tbsp (30 g)".match(re)?.[1], "30");
  assert.equal("1 slice (28g)".match(re)?.[1], "28");
  // And nothing invented where there is no mass named.
  assert.equal("1 serving".match(re), null);
  assert.equal("1 slice".match(re), null);
});
