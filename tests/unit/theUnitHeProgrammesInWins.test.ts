import test from "node:test";
import assert from "node:assert/strict";
import { unitHeUses, unitKey, knownFoods } from "../../src/lib/nutrition/foodUnitDefaults.ts";

/**
 * Butter measures in tablespoons.
 *
 * Reported three times. Each fix tried to DERIVE the answer from the food
 * catalogue — read the row's own servings, borrow a measure from a row with a
 * similar name, rank the candidates by how much of the name they explain. The
 * catalogue is a 574,000-row import that is mostly junk, so each derivation
 * failed in a new way, the last one loudly: six cookies became six protein
 * BARS, 1815 calories.
 *
 * The answer was never in the catalogue. It is in meal_items.unit, where
 * Dustin has written it down once per food, every time he programmed a meal.
 * These tests hold that record to what he actually wrote.
 */
test("the unit he programmes wins — butter is tablespoons, which is the whole complaint", () => {
  assert.equal(unitHeUses("Butter"), "tbsp");
});

test("the unit he programmes wins — finds his unit through the catalogue's own naming", () => {
  // The catalogue never calls it just "Butter" — it calls it "Butter, salted".
  // A fix that only matched exact names would have missed every real row.
  assert.equal(unitHeUses("Butter, salted"), "tbsp");
  assert.equal(unitHeUses("Butter (unsalted)"), "tbsp");
  assert.equal(unitHeUses("Olive Oil, extra virgin"), "tsp");
  assert.equal(unitHeUses("White Rice (cooked), long grain"), "cup");
});

test("the unit he programmes wins — does not let one food answer for a different food that starts the same way", () => {
  // "Butter Pecan Ice Cream" is not butter and is not eaten by the tablespoon.
  assert.equal(unitHeUses("Butter Pecan Ice Cream"), null);
  // And almond butter is its own entry, not an inheritance from butter.
  assert.equal(unitHeUses("Almond Butter"), "tbsp");
  assert.equal(unitHeUses("Peanut Butter"), "tbsp");
});

test("the unit he programmes wins — stays silent about foods he has never programmed", () => {
  // The honest answer for an unknown food is nothing, not a guess. This is
  // the exact failure that put a "bar" on a cookie.
  assert.equal(unitHeUses("Tiff's Treats Chocolate Chip Cookies"), null);
  assert.equal(unitHeUses("Some Food Nobody Has Ever Eaten"), null);
});

test("the unit he programmes wins — keeps weight for the foods he actually weighs", () => {
  // Not every food should get a household unit. He weighs these, and the map
  // saying so is what stops a borrow from putting a cup on them.
  assert.equal(unitHeUses("Sweet Potato (cooked)"), "g");
  assert.equal(unitHeUses("Homemade Sourdough"), "g");
  assert.equal(unitHeUses("Salmon (cooked)"), "oz");
});

test("the unit he programmes wins — normalises the same food written differently", () => {
  assert.equal(unitKey("Thomas' Cinnamon Swirl Bagel"), unitKey("Thomas Cinnamon Swirl Bagel"));
});

test("the unit he programmes wins — carries his whole roster of foods, not a hand-picked few", () => {
  // A map with butter in it and nothing else would pass the first test and
  // fix nothing. This is the check that it is the real record.
  assert.ok(knownFoods().length > 200);
});

test("the unit he programmes wins — finds his unit inside a brand's own name", () => {
  // The complaint that proved the first version useless: he searched his real
  // butter and every result was a brand name. The catalogue almost never says
  // just "Butter" — it says "Pure Irish Butter", "Salted Irish Butter".
  assert.equal(unitHeUses("Pure Irish Butter"), "tbsp");
  assert.equal(unitHeUses("Kerrygold Salted Irish Butter"), "tbsp");
  assert.equal(unitHeUses("Extra Virgin Olive Oil"), "tsp");
  assert.equal(unitHeUses("Organic Jasmine White Rice"), "cup");
});

test("the unit he programmes wins — head-final still refuses the wrong food", () => {
  // Reading the END of the name is what makes brands work; it must not undo
  // the guard. These end in a food he has never programmed, so: nothing.
  assert.equal(unitHeUses("Butter Pecan Ice Cream"), null);
  assert.equal(unitHeUses("Kerrygold Irish Cheddar"), null);
  assert.equal(unitHeUses("Chocolate Chip Cookies"), null);
});
