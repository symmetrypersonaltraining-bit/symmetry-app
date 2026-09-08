import test from "node:test";
import assert from "node:assert/strict";
import { unitHeUses, knownFoods } from "../../src/lib/nutrition/foodUnitDefaults.ts";

/**
 * A UNIT HAS TO BE SOMETHING THAT APPEARS ON THE PICKER.
 *
 * Dustin's standing complaint about the food database is that items come back
 * with the wrong measurements and do not open on the serving a person would
 * actually use. This is one way the app was doing that to itself.
 *
 * `meal_items.unit` is free text, and some of what is in it is a PORTION
 * DESCRIPTION rather than a measure — `large (8" to 8-7/8" long)` copied out of
 * a USDA row, `each or 6 oz` on a day offering eggs or steak, `servings of 1
 * slice`, `serving (2 softgels)`, `to taste`. Generating the map straight from
 * that record put seven of them in as though they were units.
 *
 * None of them can be chosen. The picker looks for a named serving with that
 * label and finds none, and the AI resolver is left worse than if the map had
 * said nothing: it uses his unit as the thing to hunt for in a borrowed serving
 * set, so the description crowds out the food's own name and a borrow that
 * would have found "1 slice" comes back empty.
 *
 * The worst of the seven was a straight regression: "Jennie-O Extra Lean Turkey
 * Bacon" carries "servings of 1 slice" on its own row, which beat the general
 * "turkey bacon" — SLICES, written seven times and actually on the picker.
 */

/** Nothing a person can tap: brackets, a quote, a compound, or an instruction. */
const NOT_A_MEASURE = /[()"]| or | of |^to taste$/;

test("a unit he can pick — a portion description never wins over a real measure", () => {
  assert.equal(unitHeUses("Jennie-O Extra Lean Turkey Bacon"), "slices");
  assert.equal(unitHeUses("Turkey bacon"), "slices");
});

test("a unit he can pick — a food whose only unit is a description says nothing", () => {
  // Silence puts the food back where it was before this map existed: the
  // catalogue's own serving answers. That is the honest result, and it is
  // strictly better than handing the picker a label it cannot show.
  assert.equal(unitHeUses("Cinnamon + Stevia"), null);
  assert.equal(unitHeUses("Nature Made Fish Oil 1200mg"), null);
  assert.equal(unitHeUses("Boiled Eggs (whole) OR Steak (ribeye/sirloin)"), null);
});

test("a unit he can pick — saying nothing does not let a fragment answer instead", () => {
  // Dropping a key hands the question to the family matcher, and that must not
  // become a new wrong answer. "Coffee-Mate ... Coffee Creamer" contains the
  // word "coffee", which he programmes by the CUP. A cup of creamer would be
  // the same mistake in a new place.
  assert.equal(unitHeUses("Coffee-Mate Sugar Free French Vanilla Liquid Coffee Creamer"), null);
  assert.equal(unitHeUses("Chobani 0% Plain Greek Yogurt (8 oz)"), null);
});

test("a unit he can pick — no entry in the whole map is unpickable", () => {
  // The guard that holds after the next regeneration, whatever he types next.
  const bad = knownFoods()
    .map((f) => [f, unitHeUses(f)] as const)
    .filter(([, u]) => u !== null && NOT_A_MEASURE.test(u));
  assert.deepEqual(bad, [], "these units cannot appear on a picker");
});

test("a unit he can pick — the foods this was meant to protect are untouched", () => {
  assert.equal(unitHeUses("Butter"), "tbsp");
  assert.equal(unitHeUses("Kerrygold Salted Irish Butter"), "tbsp");
  assert.equal(unitHeUses("Sweet Potato (cooked)"), "g");
  assert.equal(unitHeUses("Animal Isolate Loaded Whey — shake with water"), "scoop");
  assert.equal(unitHeUses("Roasted carrots & green beans"), "serving");
  assert.ok(knownFoods().length >= 295, `only ${knownFoods().length} foods`);
});
