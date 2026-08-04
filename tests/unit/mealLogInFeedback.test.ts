import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeAMealLog } from "../../src/components/HeaderAssist";

/**
 * FOOD TYPED INTO THE BUG BOX.
 *
 * Gerard, 1 August: logged M1 at 4:10pm, then at 4:14 and 4:20 typed
 *
 *   "Had 1 cup cream of wheat, fruit, and 2 eggs for breakfast."
 *   "Had 4 protein pancakes with pecans, blueberries, butter, milk and 1 egg
 *    with coconut water for lunch"
 *
 * into the FEEDBACK box. Both landed in Dustin's bug list; neither landed in
 * Gerard's day. He had already done the hard part — writing the food out — and
 * the app filed it where nothing would ever count it.
 *
 * The nudge has to be narrow in one specific direction: a false positive nags
 * somebody writing a real bug report about breakfast, which teaches them the
 * app argues with them. Missing a few is the cheaper error, so every genuine
 * report below must pass through untouched.
 */

test("the two that actually happened are caught", () => {
  assert.equal(looksLikeAMealLog("Had 1 cup cream of wheat, fruit, and 2 eggs for breakfast."), true);
  assert.equal(looksLikeAMealLog("Had 4 protein pancakes with pecans, blueberries, butter, milk and 1 egg with coconut water for lunch"), true);
});

test("other ways people write a meal", () => {
  assert.equal(looksLikeAMealLog("ate chicken and rice for dinner"), true);
  assert.equal(looksLikeAMealLog("just finished a protein shake"), true);
  assert.equal(looksLikeAMealLog("had a banana and coffee for breakfast"), true);
});

test("a real bug report about food is never nagged", () => {
  // Every one of these is a genuine report from this app's own feedback table,
  // or the shape of one.
  for (const t of [
    "App automatically doubling the value of the meal I logged for breakfast",
    "When u add a custom food and change the serving size the macros dont change",
    "When im typing in meals to log the app covers where im typing so I can't see what im doing",
    "The chili crisp oil we use is in the database but if I try to add it to a meal it wont let me add a small amount",
    "Add liquid egg whites into my meal plan and add steak one night a week",
    "I can't swap food options in meal plan",
    "my breakfast is wrong",
  ]) {
    assert.equal(looksLikeAMealLog(t), false, `must NOT nag: ${t}`);
  }
});

test("short or empty input is left alone", () => {
  // Nobody should see a warning after four characters.
  for (const t of ["", "   ", "had eggs", "lunch"]) {
    assert.equal(looksLikeAMealLog(t), false, `too short to judge: "${t}"`);
  }
});
