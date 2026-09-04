// THE AMOUNT BOX IN THE RECIPE BUILDER DID NOTHING.
//
// Found 4 Sep sweeping every path that turns a food into a number, after
// Dustin: *"I dont want to find this accuracy problem again anywhere. find it
// from every path n get it fixed."*
//
// Three faults on one screen, and they compounded:
//
//   1. The database search read `serving_desc` and added the row's macros under
//      that label. `serving_desc` is the literal string "100 g" on 574,372 of
//      the catalogue's 574,650 rows — so "almonds" went into a recipe as 579
//      cal and 50 g of fat, labelled "1 100 g", and "butter" as 717.
//   2. `serving_options` was never read at all, so the row's real countable
//      servings were unreachable from this screen and the chooser that every
//      other food surface uses was never called.
//   3. `recipeTotals` summed protein/carbs/fats and never multiplied by
//      `amount`. Typing 8 and "oz" over a chicken breast re-rendered the line
//      as "8 oz chicken breast" and left the totals counting 100 g.
//
// And directly above it, inside the green "Lands on your target" panel, the
// screen said: "Worked out from the ingredients below, not guessed. Edit any
// amount and the totals follow."
//
// End to end: the recipe saved, /api/recipes/log wrote those per-serving macros
// into the client's day, and the card said it had been worked out.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  recipeTotals, perServing, ingredientScale, type RecipeIngredient,
} from "../../src/lib/recipes.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const CLIENT = read("src/app/(app)/recipes/RecipesClient.tsx");

const ing = (o: Partial<RecipeIngredient>): RecipeIngredient => ({
  food: "Chicken, breast", amount: 1, unit: "g", protein: 31, carbs: 0, fats: 3.6, ...o,
});

// ── the arithmetic ───────────────────────────────────────────────────────────

test("eight ounces of chicken is eight ounces of chicken", () => {
  // Picked from the catalogue at one 100 g serving, then edited to 8 oz.
  const row = ing({ amount: 8, unit: "oz", base_amount: 1, protein: 31, carbs: 0, fats: 3.6 });
  assert.equal(ingredientScale(row), 8);
  const t = recipeTotals([row]);
  assert.equal(t.protein, 248, "the totals counted one serving however much was typed");
});

test("a row typed by hand is its own total, and does not double", () => {
  // No basis: the person entered the macros for the whole line. Scaling these
  // would silently double the macros of every recipe already saved.
  const row = ing({ amount: 8, unit: "oz", base_amount: null, protein: 52 });
  assert.equal(ingredientScale(row), 1);
  assert.equal(recipeTotals([row]).protein, 52);
});

test("every recipe already in the database is untouched", () => {
  // base_amount is NULL on every existing row, and null means scale 1.
  const saved = [
    ing({ amount: 1, unit: "100 g", protein: 31, carbs: 0, fats: 3.6 }),
    ing({ food: "Rice", amount: 200, unit: "g", protein: 5.2, carbs: 56, fats: 0.6 }),
  ];
  const t = recipeTotals(saved);
  assert.equal(t.protein, 36.2);
  assert.equal(t.carbs, 56);
});

test("a nonsense amount never becomes a nonsense total", () => {
  assert.equal(ingredientScale(ing({ amount: 0, base_amount: 1 })), 1);
  assert.equal(ingredientScale(ing({ amount: null, base_amount: 1 })), 1);
  assert.equal(ingredientScale(ing({ amount: 5, base_amount: 0 })), 1);
  assert.equal(ingredientScale(ing({ amount: -3, base_amount: 1 })), 1);
  assert.ok(Number.isFinite(recipeTotals([ing({ amount: 5, base_amount: 0 })]).kcal));
});

test("per-serving follows the scaled totals", () => {
  const rows = [ing({ amount: 4, unit: "oz", base_amount: 1, protein: 31, carbs: 0, fats: 3.6 })];
  const per = perServing(rows, 2);
  assert.equal(per.protein, 62, "124 g of protein across two servings");
});

// ── the portion it gets added at ─────────────────────────────────────────────

test("the builder reads the columns that hold the real portions", () => {
  assert.match(code(CLIENT), /serving_grams, serving_options/, "the search still cannot see a real serving");
  assert.ok(
    !/unit: h\.serving_desc \|\| "serving"/.test(code(CLIENT)),
    'an ingredient is still added as "1 100 g"',
  );
  assert.match(code(CLIENT), /const q = catalogPortion\(h\);/);
  assert.match(code(CLIENT), /base_amount: q\.amount/, "the basis does not travel with the pick");
});

test("it uses the SAME chooser as every other food surface", () => {
  // Three screens disagreeing about what one banana is would be the same fault
  // in a third shape.
  assert.match(code(CLIENT), /preferredServing/);
  assert.match(code(CLIENT), /parseServingOption/);
});

test("a verified row outranks a crowd-submitted one", () => {
  // The raw ilike order is what puts a 242 kcal / 14 g-fat "banana" on top.
  assert.match(code(CLIENT), /\.order\("verified", \{ ascending: false \}\)/);
});

// ── and the basis survives a save ────────────────────────────────────────────

test("base_amount is read back with the recipe", () => {
  // Otherwise a saved recipe re-opens with no basis, every line reverts to
  // scale 1, and the card stops matching what was saved.
  const selects = code(CLIENT).match(/\.select\("food, amount, unit[^"]*"\)/g) || [];
  assert.equal(selects.length, 2, "the ingredient read-backs moved — re-anchor this test");
  for (const s of selects) assert.match(s, /base_amount/);
});

test("the estimator's numbers carry the amount they were for", () => {
  const AI = code(read("src/app/api/recipes/ai/route.ts"));
  const sites = AI.match(/source: "ai" as const/g) || [];
  assert.equal(sites.length, 2, "an AI ingredient build site moved — re-anchor this test");
  assert.equal((AI.match(/base_amount: i\.amount \?\? null/g) || []).length, 2);
});

test("the screen no longer promises something it does not do", () => {
  assert.ok(
    !/Edit any amount and the totals follow\./.test(CLIENT),
    "the false sentence is still shown inside the green on-target panel",
  );
  assert.match(CLIENT, /the\s+P\/C\/F you entered IS the line/);
});
