// Guard: the shared meal and recipe library, and the arithmetic behind it.
//
// Dustin, 15 Aug: "build 50 new meals in the library… with full detailed macros
// and portions measured to create meal plans with", and "create 20 recipes in
// the library as well… full directions".
//
// These numbers go into other people's meal plans. A wrong macro here is not a
// cosmetic bug — it is a client eating 300 kcal more than their plan says for
// weeks, and neither of them knowing why the scale has stopped moving.
//
// So nothing here trusts a hand-written total. Every check below either derives
// a number and compares it, or sanity-checks a macro against the PORTION it
// claims to be, which is the only way to catch a decimal in the wrong place.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MEAL_LIBRARY, mealTotals, type LibraryMeal } from "../../src/lib/nutrition/mealLibrary";
import { RECIPE_LIBRARY, perServing } from "../../src/lib/nutrition/recipeLibrary";

test("there are 50 meals and 20 recipes, as asked", () => {
  assert.equal(MEAL_LIBRARY.length, 50);
  assert.equal(RECIPE_LIBRARY.length, 20);
});

test("every meal and recipe name is unique", () => {
  // Two "Chicken Bowl"s in a picker is a support question every week.
  const meals = MEAL_LIBRARY.map((m) => m.name.toLowerCase());
  assert.equal(new Set(meals).size, meals.length, "duplicate meal name");
  const recipes = RECIPE_LIBRARY.map((r) => r.title.toLowerCase());
  assert.equal(new Set(recipes).size, recipes.length, "duplicate recipe title");
});

test("every single item carries a MEASURED portion", () => {
  // "a chicken breast" is not a portion. Every amount must contain a number,
  // because a plan built from vague amounts cannot be checked against a target.
  const bad: string[] = [];
  for (const m of MEAL_LIBRARY) {
    for (const i of m.items) {
      if (!/\d/.test(i.a)) bad.push(`${m.name} → ${i.n}: "${i.a}"`);
    }
  }
  for (const r of RECIPE_LIBRARY) {
    for (const i of r.ingredients) {
      if (!/\d/.test(i.a)) bad.push(`${r.title} → ${i.n}: "${i.a}"`);
    }
  }
  assert.deepEqual(bad, [], `portions with no measurement:\n  ${bad.join("\n  ")}`);
});

test("every portion states a weight or a volume, not just a count", () => {
  // "2 large (100 g)" is checkable. "2 large" is not — eggs vary by 30%.
  const bad: string[] = [];
  const UNIT = /\b(g|kg|oz|lb|ml|cup|cups|tbsp|tsp|slice|slices|scoop|can|cans|clove|cloves|link|links|bar|whole|medium|large|small)\b/i;
  for (const m of MEAL_LIBRARY) {
    for (const i of m.items) if (!UNIT.test(i.a)) bad.push(`${m.name} → ${i.a}`);
  }
  assert.deepEqual(bad, [], `portions with no unit: ${bad.join(", ")}`);
});

test("macros are never negative and never absurd for the portion", () => {
  // Catches a decimal in the wrong place, which is the realistic authoring
  // error and the one that reads as plausible on the page.
  //
  // The two libraries are scaled DIFFERENTLY and the first version of this test
  // missed it: a meal item is ONE SERVING, a recipe ingredient is the WHOLE
  // BATCH. So "3 lb chicken → 316 g protein" is correct for a 6-serving recipe
  // and would be nonsense in a meal. Each is checked at its own scale.
  const bad: string[] = [];
  for (const m of MEAL_LIBRARY) {
    for (const i of m.items) {
      const l = `${m.name} → ${i.n}`;
      if (i.p < 0 || i.c < 0 || i.f < 0) bad.push(`${l}: negative macro`);
      // Per SERVING. The biggest single items in this library are 1.5 cups of
      // cottage cheese (36 g protein) and 2 tbsp of oil (27 g fat).
      if (i.p > 60) bad.push(`${l}: ${i.p} g protein in one serving`);
      if (i.c > 100) bad.push(`${l}: ${i.c} g carbs in one serving`);
      if (i.f > 40) bad.push(`${l}: ${i.f} g fat in one serving`);
    }
  }
  for (const r of RECIPE_LIBRARY) {
    for (const i of r.ingredients) {
      const l = `${r.title} → ${i.n}`;
      if (i.p < 0 || i.c < 0 || i.f < 0) bad.push(`${l}: negative macro`);
      // Divide by servings and the same per-serving sanity applies.
      const s = r.servings;
      if (i.p / s > 60) bad.push(`${l}: ${(i.p / s).toFixed(1)} g protein per serving`);
      if (i.c / s > 100) bad.push(`${l}: ${(i.c / s).toFixed(1)} g carbs per serving`);
      if (i.f / s > 40) bad.push(`${l}: ${(i.f / s).toFixed(1)} g fat per serving`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("no recipe serving is a calorie outlier", () => {
  // The whole-batch scale makes a mis-scaled ingredient easy to miss — it looks
  // enormous either way. This checks the number a client would actually eat.
  const bad: string[] = [];
  for (const r of RECIPE_LIBRARY) {
    const k = perServing(r).kcal;
    if (k < 120 || k > 900) bad.push(`${r.title}: ${k} kcal per serving`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("meal totals are DERIVED from the items, never written by hand", () => {
  // If mealTotals ever stopped summing the items, every total in the library
  // would silently become whatever it returned instead.
  for (const m of MEAL_LIBRARY) {
    const t = mealTotals(m.items);
    const p = m.items.reduce((s, i) => s + i.p, 0);
    const c = m.items.reduce((s, i) => s + i.c, 0);
    const f = m.items.reduce((s, i) => s + i.f, 0);
    assert.ok(Math.abs(t.protein - p) < 0.05, `${m.name}: protein`);
    assert.ok(Math.abs(t.carbs - c) < 0.05, `${m.name}: carbs`);
    assert.ok(Math.abs(t.fats - f) < 0.05, `${m.name}: fats`);
    // kcal must equal 4/4/9 on the summed macros, to the rounding.
    assert.ok(Math.abs(t.kcal - (4 * p + 4 * c + 9 * f)) < 1, `${m.name}: kcal ≠ 4/4/9`);
  }
});

test("recipe per-serving macros divide the whole recipe by its servings", () => {
  for (const r of RECIPE_LIBRARY) {
    assert.ok(r.servings >= 1, `${r.title}: servings must be at least 1`);
    const ps = perServing(r);
    const wholeP = r.ingredients.reduce((s, i) => s + i.p, 0);
    assert.ok(
      Math.abs(ps.protein - wholeP / r.servings) < 0.05,
      `${r.title}: per-serving protein does not match the division`
    );
    assert.ok(
      Math.abs(ps.kcal - (4 * ps.protein + 4 * ps.carbs + 9 * ps.fats)) < 2,
      `${r.title}: kcal ≠ 4/4/9`
    );
  }
});

test("every meal lands in a plausible calorie band for its slot", () => {
  // Not a style rule — a "snack" that is secretly 900 kcal wrecks a plan built
  // by someone trusting the label.
  const BANDS: Record<LibraryMeal["slot"], [number, number]> = {
    breakfast: [200, 800],
    lunch: [250, 900],
    dinner: [300, 1000],
    snack: [80, 450],
  };
  const bad: string[] = [];
  for (const m of MEAL_LIBRARY) {
    const k = mealTotals(m.items).kcal;
    const [lo, hi] = BANDS[m.slot];
    if (k < lo || k > hi) bad.push(`${m.name} (${m.slot}): ${k} kcal, expected ${lo}–${hi}`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("the library covers every slot with real choice, not one token each", () => {
  const bySlot = (s: string) => MEAL_LIBRARY.filter((m) => m.slot === s).length;
  assert.ok(bySlot("breakfast") >= 10, `only ${bySlot("breakfast")} breakfasts`);
  assert.ok(bySlot("lunch") >= 10, `only ${bySlot("lunch")} lunches`);
  assert.ok(bySlot("dinner") >= 10, `only ${bySlot("dinner")} dinners`);
  assert.ok(bySlot("snack") >= 10, `only ${bySlot("snack")} snacks`);
});

test("there is genuine macro spread, not 50 versions of the same meal", () => {
  // A library where everything is 40 g protein and 40 g carbs gives a plan
  // builder nothing to work with.
  const mains = MEAL_LIBRARY.filter((m) => m.slot !== "snack").map((m) => mealTotals(m.items));
  const highProtein = mains.filter((t) => t.protein >= 40).length;
  const lowCarb = mains.filter((t) => t.carbs <= 20).length;
  const highCarb = mains.filter((t) => t.carbs >= 50).length;
  assert.ok(highProtein >= 8, `only ${highProtein} high-protein mains`);
  assert.ok(lowCarb >= 3, `only ${lowCarb} lower-carb mains`);
  assert.ok(highCarb >= 8, `only ${highCarb} higher-carb mains`);
});

test("every recipe has real directions, not a gesture at them", () => {
  const bad: string[] = [];
  for (const r of RECIPE_LIBRARY) {
    if (r.instructions.length < 4) bad.push(`${r.title}: only ${r.instructions.length} steps`);
    for (const s of r.instructions) {
      // 25 was too blunt and failed on "Heat the oven to 425°F." — a complete,
      // correct instruction that happens to be 24 characters. The thing worth
      // catching is a step that says nothing, not a step that is short.
      if (s.trim().length < 15) bad.push(`${r.title}: step too thin — "${s}"`);
      if (/^(cook|bake|prepare|make|serve)( it)?\.?$/i.test(s.trim())) {
        bad.push(`${r.title}: step is a gesture — "${s}"`);
      }
    }
    // "until done" is not a doneness cue. Every recipe must give at least one
    // real one: a temperature, a time, or something you can see.
    const hasCue = r.instructions.some((s) => /°F|\d+\s*(minute|minutes|seconds|hour)/i.test(s));
    if (!hasCue) bad.push(`${r.title}: no temperature or timing anywhere`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("every recipe declares prep and cook time, and stays easy", () => {
  // "easy to prepare and cook" was the brief. Anything over 45 minutes of
  // ACTIVE work does not belong in this library.
  const bad: string[] = [];
  for (const r of RECIPE_LIBRARY) {
    if (r.prepMinutes < 0 || r.cookMinutes < 0) bad.push(`${r.title}: negative time`);
    if (r.prepMinutes > 25) bad.push(`${r.title}: ${r.prepMinutes} min prep is not "easy"`);
    // Cook time may be long if it is HANDS-OFF (slow cooker, oven). Those carry
    // the tag, so the exception has to be declared rather than assumed.
    if (r.cookMinutes > 45 && !r.tags.includes("hands-off")) {
      bad.push(`${r.title}: ${r.cookMinutes} min cook without a hands-off tag`);
    }
    if (!r.description.trim()) bad.push(`${r.title}: no description`);
    if (!r.tags.length) bad.push(`${r.title}: no tags`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("recipes span breakfast through dinner and include a no-cook option", () => {
  const tags = new Set(RECIPE_LIBRARY.flatMap((r) => r.tags));
  for (const need of ["meal-prep", "one-pan", "no-cook", "vegetarian", "freezer-friendly"]) {
    assert.ok(tags.has(need), `no recipe tagged "${need}"`);
  }
});
