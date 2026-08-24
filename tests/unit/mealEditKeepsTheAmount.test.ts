import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addedScale, planMealMacros, type PlanMeal } from "../../src/lib/nutrition/dailyTotals";

/**
 * "SWAP CHICKEN THIGH W 6 OZ OF CHICKEN BREAST" — AND IT SAID 1 SERVING.
 *
 * Dustin, 24 Aug 2026, from the Adjust / edit sheet. He named the food, the
 * amount and the unit. What came back was:
 *
 *   Chicken Thigh ......... 0 g
 *   Chicken Breast ADDED .. 1 serving · P46 C0 F4      (no way to change it)
 *   "Replaced chicken thigh with chicken breast, keeping same weight."
 *
 * Three faults in one reply, and the third is the one worth a test:
 *
 *   1. `AddedFood` had NO FIELD for an amount or a unit. "6 oz" could not be
 *      represented, so it was discarded on the way through and the row fell
 *      back to a serving count.
 *   2. The added row had a name, a serving count and an ✕. No stepper — a food
 *      the AI put on the plate could be accepted or deleted, not corrected.
 *   3. THE NOTE WAS THE MODEL'S OWN PROSE, unchecked. It claimed "keeping same
 *      weight" about a change that had just dropped 170 g for one serving.
 *      Prose from the thing being checked is not a check.
 */

const CLIENT = readFileSync(
  join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"),
  "utf8",
);
const ROUTE = readFileSync(
  join(process.cwd(), "src/app/api/nutrition-ai/meal-edit/route.ts"),
  "utf8",
);

/** Comments out — this file's own prose names the things it forbids. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── the scale ────────────────────────────────────────────────────────────────

test("a measured food scales by its amount, not by a serving count", () => {
  // 6 oz quoted, 12 oz on the plate = twice the macros.
  assert.equal(addedScale({ servings: 1, amount: 6, base_amount: 6 }), 1);
  assert.equal(addedScale({ servings: 1, amount: 12, base_amount: 6 }), 2);
  assert.equal(addedScale({ servings: 1, amount: 3, base_amount: 6 }), 0.5);
});

test("a food saved before today still totals to exactly what it did", () => {
  // The whole reason base_amount exists rather than reinterpreting `amount`:
  // MealPlanClient has always written an `amount` whose macros are already
  // folded into `servings`. Scaling by it would double-count every one.
  assert.equal(addedScale({ servings: 2 }), 2);
  assert.equal(addedScale({ servings: 2, amount: 6 }), 2, "amount alone must not scale");
  assert.equal(addedScale({ servings: 3, amount: 6, base_amount: 0 }), 3, "a zero base is not a divisor");
  assert.equal(addedScale({ servings: 0 }), 1, "no information at all means one serving");
});

test("the meal total moves when the added amount does", () => {
  const meal: PlanMeal = { id: "m1", name: "M3", timing: null, position: 3, meal_items: [] };
  const one = planMealMacros(meal, {
    __added: [{ name: "Chicken Breast", servings: 1, p: 46, c: 0, f: 4, amount: 6, unit: "oz", base_amount: 6 }],
  });
  const two = planMealMacros(meal, {
    __added: [{ name: "Chicken Breast", servings: 1, p: 46, c: 0, f: 4, amount: 12, unit: "oz", base_amount: 6 }],
  });
  assert.equal(one.protein, 46);
  assert.equal(two.protein, 92);
  assert.ok(two.kcal > one.kcal);
});

// ── the swap ─────────────────────────────────────────────────────────────────

test("the route accepts a swap, and refuses one that names nothing to replace", () => {
  assert.match(code(ROUTE), /op === "add" \|\| op === "swap"/, "swap is not handled");
  assert.match(
    code(ROUTE),
    /op === "swap" && typeof x\.id !== "string"\) continue/,
    "a swap with no id is an add wearing the wrong name — the old food would stay on the plate",
  );
});

test("an amount with no unit is refused, because a bare number is not a measure", () => {
  assert.match(code(ROUTE), /amount != null && unit \? \{ amount, unit \}/);
});

test("a measure and a serving count can never both count", () => {
  // p/c/f are quoted for the measure when there is one. Leaving `servings` at
  // whatever the model felt like would multiply the plate by it.
  assert.match(code(ROUTE), /servings: amount != null \? 1 :/);
});

test("the model is told to carry the weight across rather than invent a serving", () => {
  assert.match(ROUTE, /IF THEY DO NOT, OMIT amount AND unit/);
  assert.match(ROUTE, /Never round a stated measure to a serving/);
});

// ── the client ───────────────────────────────────────────────────────────────

test("a swap with no stated amount takes the weight off the item it replaces", () => {
  // This is the "keeping same weight" claim, made true. 170 g of thigh out,
  // 170 g of breast in — not one serving.
  assert.match(
    code(CLIENT),
    /const fromPlan = out \? \(amounts\[out\.id\] \?\? \(out\.amount != null \? Number\(out\.amount\) : null\)\) : null/,
    "the replaced item's own amount is no longer carried across",
  );
});

test("the summary is built from what was applied, not from the model's prose", () => {
  // The specific lie: "keeping same weight" on a swap that had not.
  assert.match(code(CLIENT), /setAiNote\(done\.length \? done\.join/);
  assert.doesNotMatch(
    code(CLIENT),
    /setAiNote\(String\(json\?\.note/,
    "the model's own note is back on screen — it is unverified and it has lied before",
  );
});

test("an added row can be corrected, not just deleted", () => {
  // It had a name, a serving count and an ✕. He asked for 6 oz, got 1 serving,
  // and had no control to fix it.
  const addedBlock = code(CLIENT).split("{adds.map(")[1]?.split("Just say what changed")[0] || "";
  assert.ok(addedBlock, "the added-rows block moved — this test needs re-anchoring");
  assert.match(addedBlock, /bump\(-step\)/, "the added row lost its decrement control");
  assert.match(addedBlock, /bump\(step\)/, "the added row lost its increment control");
  assert.match(addedBlock, /stepFor\(ad\.unit/, "a measured row must step in its own unit");
});
