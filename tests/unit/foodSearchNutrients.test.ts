// Guard: logging a food through search does not throw away 29 of its nutrients.
//
// Dustin's feedback, 4 Aug: micronutrients everywhere in the food logger.
//
// The day total already had them — the nutrition screen's "ALL NUTRIENTS"
// panel, full registry, grouped, hiding unknowns rather than printing dashes.
// Below the day level there was nothing, and the interesting part is WHY.
//
// FoodSearchSheet was already carrying fiber/sugar/sodium/satFat on its type,
// already scaling them by the serving multiplier, and already taking real care
// that "0.4 of an unknown sodium is still unknown". It just never read
// `food_catalog.micros` — the jsonb holding the other 29. And CustomItem
// already had `mi` for exactly that bag, written by the AI path and read by the
// registry; only this sheet never filled it.
//
// So a food with a complete lab-measured panel in the catalog — every USDA
// whole food, which is what every meal plan is built from — became a
// four-nutrient food the instant a client logged it, and the day total
// understated itself with nothing on screen to say so. No error, no warning,
// numbers that look entirely reasonable.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SHEET = readFileSync(
  join(process.cwd(), "src/app/(app)/nutrition/v3/FoodSearchSheet.tsx"),
  "utf8"
);
/** This file's own comments name the bug, so they must not satisfy the test. */
const code = SHEET.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the catalog row's micros are read, not just the four legacy columns", () => {
  assert.match(
    code,
    /micros:\s*readNutrients\(raw\.micros/,
    "mapRow must read food_catalog.micros through the shared reader"
  );
});

test("readNutrients is given the flat row too, so legacy-only foods still work", () => {
  // A row with no jsonb but with fiber/sugar/sodium/sat_fat columns — which is
  // most of the catalog — must still produce a four-entry map rather than an
  // empty one. That is what the second argument is for.
  const i = code.indexOf("readNutrients(raw.micros");
  assert.ok(i > 0);
  const call = code.slice(i, code.indexOf(")", i) + 1);
  assert.match(call, /raw\.micros\s*,/, "the flat row must be passed as well");
});

test("picking a food passes the full nutrient map through, scaled", () => {
  const i = code.indexOf("function pickItem");
  assert.ok(i > 0, "pickItem must exist");
  const body = code.slice(i, code.indexOf("\n  }", i));
  assert.match(body, /\bmi:/, "CustomItem.mi must be populated — it is why the field exists");
  assert.match(
    body,
    /scaleNutrients\(f\.micros,\s*m\)/,
    "and scaled by the SAME multiplier as the macros, or the numbers disagree"
  );
});

test("no local formatter — the registry is the only source", () => {
  // A second copy of this logic is exactly what produced a duplicate nutrient
  // panel on 15 Aug that had to be reverted the same night. The registry
  // already exports groupedNutrients, formatNutrient and pctOfDaily.
  assert.match(code, /from "@\/lib\/nutrition\/nutrients"/);
  assert.match(code, /groupedNutrients\(/);
  assert.match(code, /formatNutrient\(/);
  assert.match(code, /pctOfDaily\(/);
  assert.doesNotMatch(
    code,
    /function\s+(formatNutrient|pctOfDaily|groupedNutrients)\b/,
    "these must be imported, never redefined here"
  );
});

test("unknown is shown as unknown, never as a dash or a zero", () => {
  // "We don't know" and "it contains none" are different facts, and a client
  // choosing between two foods deserves to be told which one this is. A grid of
  // dashes reads as the food being empty of everything.
  assert.match(code, /No nutrient detail published for this food/);
  // Rows with a null value are filtered out rather than rendered blank.
  assert.match(code, /rows:\s*g\.rows\.filter\(\(r\) => r\.value != null\)/);
});

test("the percentages say what they are a percentage OF", () => {
  // pctOfDaily is against a general reference, not this client's targets. Shown
  // beside their own macro numbers, that is a genuinely easy thing to misread.
  assert.match(SHEET, /general daily reference, not your targets/);
});

test("the panel starts collapsed and resets between foods", () => {
  // Otherwise the second food you open inherits the first one's expanded state,
  // which reads as the panel being stuck.
  assert.match(code, /useState\(false\)/);
  const i = code.indexOf("function openPicked");
  const body = code.slice(i, code.indexOf("\n  }", i));
  assert.match(body, /setShowNutrients\(false\)/, "opening a food must collapse the panel");
});
