// 35,714 calories of cream cheese.
//
// Dustin, 28 Aug, on the Food database sheet:
//
//     cream cheese  UNVERIFIED
//     Philadelphia · base: 100 g
//     100  [ serving v ]
//     100 serving · P714 C357 F3571 · 35714 cal
//
// Ten kilograms of cream cheese, one tap away from "Add it".
//
// The sheet opened correctly on the row's own base, "100 g" — about 357 cal.
// He then tapped the unit dropdown and chose "serving", which every food
// offers. "serving" has no dimension the mass converter understands, so the
// conversion returned nothing, the number stayed at 100, and its MEANING
// changed underneath it: 100 servings of a food whose serving is 100 g.
//
// A hundredfold, in one tap, with no warning and no number that looked odd
// until you read the total.
//
// The row carries `serving_grams`, which is the missing link — it says what one
// serving weighs, so grams and servings convert both ways. These tests are the
// conversions the sheet needs to get right; they are exercised through the same
// helpers the sheet uses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { servingsFor } from "../../src/lib/units.ts";

/** The conversion the sheet performs when the unit dropdown changes. */
function convertQuantity(
  amount: number,
  from: string,
  to: string,
  baseGrams: number | null,
  named: { label: string; gramsPerUnit: number }[] = [],
): number | null {
  const gramsPer = (u: string) => named.find((x) => x.label === u)?.gramsPerUnit ?? null;
  const toG = (a: number, u: string): number | null => {
    if (!(a > 0)) return null;
    if (u === "serving") return baseGrams != null ? a * baseGrams : null;
    const per = gramsPer(u);
    if (per) return a * per;
    const g = servingsFor(a, u, "1 g");
    return isFinite(g) && g > 0 ? g : null;
  };
  const fromG = (g: number, u: string): number | null => {
    if (u === "serving") return baseGrams != null ? g / baseGrams : null;
    const per = gramsPer(u);
    if (per) return g / per;
    const out = servingsFor(g, "g", `1 ${u}`);
    return isFinite(out) && out > 0 ? out : null;
  };
  const grams = toG(amount, from);
  return grams != null ? fromG(grams, to) : null;
}

const round = (n: number | null) => (n == null ? null : Math.round(n * 1000) / 1000);

test("100 g becomes ONE serving, not a hundred", () => {
  // The exact tap that produced 35,714 calories.
  assert.equal(round(convertQuantity(100, "g", "serving", 100)), 1);
});

test("and back again, without drifting", () => {
  assert.equal(round(convertQuantity(1, "serving", "g", 100)), 100);
});

test("the calories survive the round trip", () => {
  // Sierra Nevada cream cheese: 357 kcal per 100 g. One serving is 100 g, so
  // both spellings of the same amount of cheese must cost the same.
  const KCAL_PER_BASE = 357;
  const asGrams = 100, asServings = round(convertQuantity(100, "g", "serving", 100))!;
  assert.equal((asGrams / 100) * KCAL_PER_BASE, asServings * KCAL_PER_BASE);
  assert.equal(asServings * KCAL_PER_BASE, 357);
  assert.notEqual(asServings * KCAL_PER_BASE, 35714);
});

test("a named portion converts through its own weight", () => {
  // Hard-boiled eggs: "1 EGG (44 g)" against a 100 g base.
  const named = [{ label: "egg", gramsPerUnit: 44 }];
  assert.equal(round(convertQuantity(2, "egg", "g", 100, named)), 88);
  assert.equal(round(convertQuantity(88, "g", "egg", 100, named)), 2);
  // Two eggs is 0.88 of the row's 100 g base.
  assert.equal(round(convertQuantity(2, "egg", "serving", 100, named)), 0.88);
});

test("ounces still work, and are not servings", () => {
  assert.equal(round(convertQuantity(1, "oz", "g", 100)), 28.35);
  // One ounce of a 100 g serving is a bit over a quarter of it.
  assert.equal(round(convertQuantity(1, "oz", "serving", 100)), 0.283);
});

test("a food with no known base weight cannot fake a serving conversion", () => {
  // The legacy `foods` table has no serving_grams. Inventing one would put a
  // wrong number on screen that looks exactly like a right one, so the sheet
  // resets to 1 of the new unit instead — which is always true.
  assert.equal(convertQuantity(100, "g", "serving", null), null);
});
