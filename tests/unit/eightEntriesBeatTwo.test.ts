// TWO ENTRIES MUST NOT OUTVOTE EIGHT.
//
// Dustin, 7 Sep, opening Kerrygold in the food sheet and finding grams, no
// tablespoon anywhere in the picker, and 750 cal per 100 g:
// *"I still can log my fucking butter!!!! no tbsp, multiple wrong numbers."*
//
// "Kerrygold Irish butter — 6 g" appears twice, in Claudine's plan. "butter —
// 1 tbsp" appears EIGHT times, in his. The matcher preferred the longer name on
// principle, so two entries beat eight; and because the answer was a WEIGHT it
// also set heWeighsIt in the sheet, which skips the unit borrow — so the
// tablespoon was not merely unselected, it was absent.
//
// The rule is now his own count, with the more specific name winning ties. That
// keeps every case where he really does weigh a variant: sweet potato (cooked)
// is grams 38 times against sweet potato ounces 4 times, and does not move.

import test from "node:test";
import assert from "node:assert/strict";
import { unitHeUses } from "../../src/lib/nutrition/foodUnitDefaults.ts";

test("the butter he programmes in tablespoons measures in tablespoons", () => {
  // Fails against the old rule, which returned "g" for all three.
  assert.equal(unitHeUses("Kerrygold Irish butter"), "tbsp");
  assert.equal(unitHeUses("Kerrygold Irish Butter"), "tbsp");
  assert.equal(unitHeUses("Kerrygold, Naturally Softer Pure Irish Butter"), "tbsp");
});

test("a brand written before the comma still finds the food after it", () => {
  // USDA generic is "<food>, <qualifier>"; branded is "<brand>, <food>". Reading
  // only the head found "kerrygold" and stopped, so a row that plainly says
  // butter came back with no unit at all.
  assert.equal(unitHeUses("Kerrygold, Reduced Fat Irish Butter"), "tbsp");
  assert.equal(unitHeUses("Butter, salted"), "tbsp");
});

test("where he really does weigh the variant, nothing moves", () => {
  // 38 entries in grams against 4 in ounces: the specific name is better
  // attested and keeps its answer.
  assert.equal(unitHeUses("Sweet potato (cooked)"), "g");
  assert.equal(unitHeUses("Sweet potato"), "oz");
  assert.equal(unitHeUses("White potato (roasted)"), "g");
  assert.equal(unitHeUses("Jasmine Rice (cooked)"), "g");
  assert.equal(unitHeUses("Egg whites"), "g");
});

test("a household answer never overrides a better-attested one", () => {
  assert.equal(unitHeUses("Chicken breast (cooked)"), "oz");
  assert.equal(unitHeUses("Salmon (cooked)"), "oz");
  assert.equal(unitHeUses("Olive oil"), "tsp");
});

test("a different food that merely starts with a known one is still not that food", () => {
  // "Butter Pecan Ice Cream" is not eaten by the tablespoon.
  assert.equal(unitHeUses("Butter Pecan Ice Cream"), null);
});

test("a food he has never programmed still answers null", () => {
  assert.equal(unitHeUses("Xanthan gum thickener"), null);
  assert.equal(unitHeUses(""), null);
});
