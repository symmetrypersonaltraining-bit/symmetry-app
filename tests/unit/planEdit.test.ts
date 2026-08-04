import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveEditedItems } from "../../src/lib/nutrition/planEdit";

/**
 * AN EDIT THAT LASTS LONGER THAN A DAY.
 *
 * Dustin, 2026-08-04: "can clients edit current meal plans to be saved? if not
 * lets make that happen so he can edit and save what he wants."
 *
 * "Adjust / edit this meal" wrote item_overrides onto that DAY's log and
 * nowhere else, so anyone whose real meal differs from the prescription retyped
 * it every morning. Jerry did exactly that for a fortnight before asking for
 * egg whites to be added to his plan.
 *
 * This is the arithmetic that turns a day's adjustment into plan rows, and it
 * has to be right the first time: it rewrites what someone eats, and the
 * mistake would be invisible — plausible numbers, silently wrong, in a plan the
 * client then follows.
 */

test("an adjusted amount scales the macros with it", () => {
  const items = [{ id: "a", food: "White rice (cooked)", amount: 0.5, unit: "cup", protein: 2, carbs: 22, fats: 0 }];
  const [rice] = resolveEditedItems(items, { a: { amount: 1 } });
  assert.equal(rice.amount, 1);
  assert.equal(rice.carbs, 44, "double the rice, double the carbs");
  assert.equal(rice.protein, 4);
});

test("an amount of zero removes the item rather than storing a 0 g row", () => {
  const items = [
    { id: "a", food: "Rice", amount: 0.5, unit: "cup", protein: 2, carbs: 22, fats: 0 },
    { id: "b", food: "Almonds", amount: 10, unit: "each", protein: 3, carbs: 2, fats: 6 },
  ];
  const out = resolveEditedItems(items, { b: { amount: 0 } });
  assert.deepEqual(out.map((i) => i.food), ["Rice"]);
});

test("untouched items come through unchanged", () => {
  const items = [{ id: "a", food: "Steak", amount: 6, unit: "oz", protein: 52, carbs: 0, fats: 16, basis: "cooked" }];
  const [steak] = resolveEditedItems(items, null);
  assert.deepEqual(
    { food: steak.food, amount: steak.amount, protein: steak.protein, fats: steak.fats, basis: steak.basis },
    { food: "Steak", amount: 6, protein: 52, fats: 16, basis: "cooked" },
  );
});

test("an unlimited item is never scaled", () => {
  // "Bell peppers/onion (unlimited)" has an amount of 1 serving that means
  // nothing. Scaling it would invent macros out of a placeholder.
  const items = [{ id: "v", food: "Peppers (unlimited)", amount: 1, unit: "serving", protein: 0, carbs: 5, fats: 0, is_unlimited: true }];
  const [veg] = resolveEditedItems(items, { v: { amount: 3 } });
  assert.equal(veg.carbs, 5, "still 5 — an unlimited side does not triple");
  assert.equal(veg.is_unlimited, true);
});

test("an item with no original amount cannot be scaled", () => {
  // A ratio needs a denominator. Without one the honest move is to leave the
  // macros alone rather than divide by zero into Infinity.
  const items = [{ id: "x", food: "Mystery", amount: null, unit: null, protein: 10, carbs: 10, fats: 10 }];
  const [x] = resolveEditedItems(items, { x: { amount: 4 } });
  assert.equal(x.protein, 10);
  assert.equal(x.amount, 4);
});

test("added foods become real items, priced by servings", () => {
  const items = [{ id: "a", food: "Rice", amount: 0.5, unit: "cup", protein: 2, carbs: 22, fats: 0 }];
  const out = resolveEditedItems(items, { __added: [{ name: "Liquid egg whites", servings: 2, p: 13, c: 2, f: 0 }] });
  assert.equal(out.length, 2);
  const eggs = out[1];
  assert.equal(eggs.food, "Liquid egg whites");
  assert.equal(eggs.protein, 26, "two servings of 13g");
  assert.equal(eggs.amount, 2);
});

test("string numbers out of Postgres numeric columns still add up", () => {
  // supabase-js hands back numeric as a string; treating "22" as NaN would zero
  // a client's carbs without anything failing.
  const items = [{ id: "a", food: "Rice", amount: "0.5", unit: "cup", protein: "2", carbs: "22", fats: "0" }];
  const [rice] = resolveEditedItems(items, { a: { amount: 1.5 } });
  assert.equal(rice.carbs, 66);
});

/**
 * The route half: the trainer's plan is copied, never overwritten, and a
 * rotation plan survives the copy.
 */
const ROUTE = readFileSync(join(process.cwd(), "src/app/api/nutrition/plan-edit/route.ts"), "utf8");

test("the trainer's plan is cloned, not mutated", () => {
  assert.match(ROUTE, /if \(!meal\.meal_plan\.created_by_client\)/);
  assert.match(ROUTE, /created_by_client: true/);
  assert.match(ROUTE, /status: "archived"/, "the original is archived, and archiving is reversible");
  assert.doesNotMatch(ROUTE, /\.delete\(\)\.eq\("meal_plan_id"/, "nothing about the trainer's plan is deleted");
});

test("the archive happens only after the copy is complete", () => {
  // Archiving first and then failing would leave the client with no live plan.
  assert.ok(
    ROUTE.indexOf("for (const m of src)") < ROUTE.indexOf('.update({ status: "archived" })'),
    "copy every meal before archiving anything",
  );
});

test("rotation options keep their positions through the clone", () => {
  // Jerry has five options at each of five slots — 24 meals across 5 positions.
  // adoptPlan() renumbers meals 1..N, which would turn that into 24 meals of
  // the day, so the clone copies position across verbatim.
  assert.match(ROUTE, /position: m\.position/);
  assert.doesNotMatch(ROUTE, /position: i \+ 1,\s*\n\s*swaps/);
});

test("the caller can only ever edit their own plan", () => {
  assert.match(ROUTE, /meal\.meal_plan\.client_id !== clientId/);
  assert.match(ROUTE, /Never taken from the body/);
});

test("an edit is never allowed to empty a meal", () => {
  assert.match(ROUTE, /That would leave the meal empty/);
});
