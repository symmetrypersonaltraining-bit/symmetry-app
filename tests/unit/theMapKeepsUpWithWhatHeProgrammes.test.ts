import test from "node:test";
import assert from "node:assert/strict";
import { unitHeUses, knownFoods } from "../../src/lib/nutrition/foodUnitDefaults.ts";

/**
 * THE MAP WAS GENERATED ONCE AND THEN HE KEPT PROGRAMMING.
 *
 * `foodUnitDefaults.ts` held 251 foods. `meal_items` held 305. Fifty-four
 * foods he had written a unit for since it was generated were not in it, and a
 * food the map has never heard of does not fail quietly — the family matcher
 * goes looking for any known food inside the name and answers with what it
 * finds. That is how these two got their units:
 *
 *   "Animal Isolate Loaded Whey — shake with water"  ->  oz, from WATER
 *   "Infinis Cream of Rice — mixed with water"       ->  oz, from WATER
 *
 * Both are scoops, both said so in his own meal plans, and both opened in
 * ounces because the word "water" was in the name. The same shape of mistake
 * put grams on "Roasted carrots & green beans" (it borrowed "green beans",
 * which he weighs) where he has written "serving" six times.
 *
 * These are the answers that CHANGED when the map was regenerated, not merely
 * the ones that appeared — a food that had no answer before and has one now
 * cannot regress anything. A stale generated file is not a tidiness problem:
 * every food missing from it is a fragment of its own name answering for it.
 */

test("the map keeps up — a shake made with water is not measured in water", () => {
  assert.equal(unitHeUses("Animal Isolate Loaded Whey — shake with water"), "scoop");
  assert.equal(unitHeUses("Infinis Cream of Rice — mixed with water"), "scoop");
});

test("the map keeps up — his side dishes are servings, not the weight of one ingredient", () => {
  // Each of these borrowed a unit from a food inside its own name: green beans
  // and sweet potato are weighed, asparagus is ounces. He programmes the dish
  // itself as a serving, repeatedly.
  assert.equal(unitHeUses("Roasted carrots & green beans"), "serving");
  assert.equal(unitHeUses("Roasted carrots & zucchini"), "serving");
  assert.equal(unitHeUses("Roasted asparagus/zucchini"), "serving");
  assert.equal(unitHeUses("Steamed broccoli/asparagus"), "serving");
  assert.equal(unitHeUses("Steamed asparagus/broccoli"), "serving");
});

test("the map keeps up — the specific spelling he used beats the general food", () => {
  // "Sweet potato" is ounces; the one he puts in a hash he weighs in grams.
  // "Homemade Sourdough" is grams; the 50 g slice is a slice.
  assert.equal(unitHeUses("Sweet potato (in hash)"), "g");
  assert.equal(unitHeUses("Homemade Sourdough (~50g slice)"), "slice");
});

test("the map keeps up — foods he added after the file was generated are in it", () => {
  assert.equal(unitHeUses("Lean ground beef 93/7 in tomato sauce"), "oz");
  assert.equal(unitHeUses("Hashbrowns / shredded potato (baked or air-fried, light oil)"), "cup");
  assert.equal(unitHeUses("Matcha latte w/ ultra-filtered milk"), "cup");
  assert.equal(unitHeUses("Quaker Rice Cakes - Apple Cinnamon"), "serving");
  assert.equal(unitHeUses("ProGym S'mores protein"), "scoop");
  assert.equal(unitHeUses("Dave's Killer Bread Thin-Sliced Organic 21 Whole Grains & Seeds"), "slice");
});

test("the map keeps up — it carries the whole record, not the part that was true in August", () => {
  // 305 foods as of 8 Sep. The floor is deliberately just under it: this is a
  // guard against the file falling behind again, not a number to edit whenever
  // he programmes a meal.
  assert.ok(knownFoods().length >= 300, `only ${knownFoods().length} foods — regenerate the map`);
});

test("the map keeps up — the foods that already worked still work", () => {
  // Adding entries can change an existing answer: a new key is a new thing the
  // family matcher can find inside a longer name. Nothing above may cost these.
  assert.equal(unitHeUses("Butter"), "tbsp");
  assert.equal(unitHeUses("Kerrygold Salted Irish Butter"), "tbsp");
  assert.equal(unitHeUses("Sweet Potato (cooked)"), "g");
  assert.equal(unitHeUses("Salmon (cooked)"), "oz");
  assert.equal(unitHeUses("Extra Virgin Olive Oil"), "tsp");
  assert.equal(unitHeUses("Butter Pecan Ice Cream"), null);
  assert.equal(unitHeUses("Tiff's Treats Chocolate Chip Cookies"), null);
});
