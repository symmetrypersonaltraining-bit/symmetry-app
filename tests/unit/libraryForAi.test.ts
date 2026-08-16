// Guard: the AI plan builder can see the library, and is not imprisoned by it.
//
// Dustin, 15 Aug: "these should be accessable to clients to custom build and
// the ai to use if they want to have ai build it… make this all part of the
// meal plan builder process ai or client run."
//
// The reason this matters is accuracy, not convenience. Left to itself the plan
// builder writes plausible foods with plausible macros — and "1 cup Greek
// yogurt, 17 g protein" is wrong by a third while looking exactly as reasonable
// as the line above it. Every macro in the library has been checked against its
// portion. Offering the library moves the plan from invented numbers to
// verified ones wherever it fits.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { libraryPromptBlock, mealLibraryForPrompt, recipeLibraryForPrompt } from "../../src/lib/nutrition/libraryForAi";
import { MEAL_LIBRARY, mealTotals } from "../../src/lib/nutrition/mealLibrary";
import { RECIPE_LIBRARY } from "../../src/lib/nutrition/recipeLibrary";

const ROUTE = readFileSync(
  join(process.cwd(), "src/app/api/nutrition-ai/plan-build/route.ts"),
  "utf8"
);

test("the plan builder's system prompt actually carries the library", () => {
  const src = ROUTE.replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /libraryPromptBlock\(\)/, "the block must be interpolated into SYSTEM_PROMPT");
  const promptStart = src.indexOf("const SYSTEM_PROMPT");
  const promptEnd = src.indexOf("`;", promptStart);
  const prompt = src.slice(promptStart, promptEnd);
  assert.ok(prompt.includes("libraryPromptBlock()"), "it must be INSIDE the system prompt, not elsewhere");
});

test("every meal appears, with its name exactly as stored", () => {
  // The model is told to use names verbatim. If a name here differed from the
  // database by one character, nothing would resolve and the plan would look
  // fine while linking to nothing.
  const block = mealLibraryForPrompt();
  for (const m of MEAL_LIBRARY) {
    assert.ok(block.includes(m.name), `missing from the prompt: ${m.name}`);
  }
});

test("every recipe appears, and says how many it serves", () => {
  const block = recipeLibraryForPrompt();
  for (const r of RECIPE_LIBRARY) {
    assert.ok(block.includes(r.title), `missing: ${r.title}`);
  }
  // A recipe without servings is a macro number with no denominator.
  assert.equal((block.match(/serves \d/g) || []).length, RECIPE_LIBRARY.length);
});

test("the macros in the prompt are the derived ones, not a second copy", () => {
  // If this rendered its own arithmetic, the model would be choosing meals by
  // numbers that the app does not agree with.
  const block = mealLibraryForPrompt();
  for (const m of MEAL_LIBRARY.slice(0, 8)) {
    const t = mealTotals(m.items);
    assert.ok(
      block.includes(`${m.name} — ${t.kcal} kcal, ${t.protein}P / ${t.carbs}C / ${t.fats}F`),
      `${m.name}: prompt macros do not match mealTotals`
    );
  }
});

test("the model is told it MAY invent when nothing fits", () => {
  // "Use ONLY these" is the version that breaks the plan: it forces a 400 kcal
  // breakfast into a 250 kcal slot and quietly misses the totals it was told to
  // hit. Allergies and preferences need the same escape hatch.
  const b = libraryPromptBlock();
  assert.match(b, /You may still\s+invent a meal when nothing fits/);
  assert.match(b, /allergies/i);
  assert.match(b, /PREFER them/);
});

test("names must be used verbatim, or the link back to the row is lost", () => {
  assert.match(libraryPromptBlock(), /name EXACTLY as written/);
});

test("the block stays small enough to not crowd out the client's own context", () => {
  // This rides on a call that already carries the client's metrics, goal and
  // consult answers. Rendering all 50 meals WITH ingredients was the obvious
  // version and would have been several times this.
  const chars = libraryPromptBlock().length;
  assert.ok(chars < 12000, `library prompt block is ${chars} chars — too much of the window`);
  assert.ok(chars > 2000, `only ${chars} chars — the library is probably not rendering`);
});

test("recipes are labelled PER SERVING, because meals are not", () => {
  // The two are portioned differently and mixing them silently is how a plan
  // ends up counting a 4-serving tray as one meal.
  assert.match(libraryPromptBlock(), /macros are PER SERVING/);
});

// ── AND THE HALF THAT WAS MISSING ──────────────────────────────────────────
//
// Everything above proves the library reaches the MODEL. Reading what happened
// to the reply afterwards: nothing did. validatePlanDraft took the meal name as
// text and the macros as whatever the model wrote, so a plan naming a library
// meal was no more accurate than one inventing a meal — it merely looked more
// trustworthy, which is worse than looking invented.
//
// The prompt's own promise ("a client can then log it in one tap, and the
// numbers are known to be right") had no implementation. These are the tests
// for the half that makes it true.

import { validatePlanDraft } from "../../src/lib/ai/nutrition-json";

const draftWith = (name: string, items: { food: string; p: number; c: number; f: number }[]) => ({
  targets: { kcal: 2000, p: 150, c: 200, f: 60 },
  meals: [{ name, items }],
});

test("a meal named exactly from the library gets the LIBRARY's items", () => {
  const lib = MEAL_LIBRARY[0];
  // The model returns the right name and badly wrong macros — the realistic
  // failure, because a wrong number looks exactly as reasonable as a right one.
  const d = validatePlanDraft(draftWith(lib.name, [{ food: "whatever it remembered", p: 1, c: 1, f: 1 }]));
  assert.ok(d, "draft must validate");
  const m = d!.meals[0];
  assert.equal(m.fromLibrary, true, "the substitution must be recorded, not silent");
  assert.equal(m.items.length, lib.items.length);
  const t = mealTotals(lib.items);
  assert.deepEqual(m.subtotal, { kcal: t.kcal, p: t.protein, c: t.carbs, f: t.fats });
});

test("the substituted items carry the library's measured portions", () => {
  // A portion is half the fact. "Chicken breast, 52 g protein" means nothing
  // without "6 oz cooked" beside it.
  const lib = MEAL_LIBRARY[0];
  const d = validatePlanDraft(draftWith(lib.name, [{ food: "x", p: 1, c: 1, f: 1 }]));
  for (const [i, it] of d!.meals[0].items.entries()) {
    assert.equal(it.food, lib.items[i].n);
    assert.equal(it.unit, lib.items[i].a, "the measured portion must survive");
  }
});

test("matching is EXACT — a near miss keeps what the model wrote", () => {
  // A fuzzy match would silently serve a client a different meal that happened
  // to share a word. Leaving the model's version alone is much the lesser evil,
  // so anything short of an exact name is left alone.
  const near = MEAL_LIBRARY[0].name + " with extra chicken";
  const d = validatePlanDraft(draftWith(near, [{ food: "chicken", p: 40, c: 0, f: 5 }]));
  assert.equal(d!.meals[0].fromLibrary, undefined, "a near miss must NOT be substituted");
  assert.equal(d!.meals[0].items[0].food, "chicken");
});

test("case and surrounding whitespace do not defeat the match", () => {
  const d = validatePlanDraft(draftWith("  " + MEAL_LIBRARY[0].name.toUpperCase() + "  ", [{ food: "x", p: 1, c: 1, f: 1 }]));
  assert.equal(d!.meals[0].fromLibrary, true);
});

test("an invented meal is left completely alone", () => {
  // The prompt explicitly allows inventing when nothing fits — allergies, an
  // empty fridge, macros no library item gives. That path must be untouched.
  const d = validatePlanDraft(draftWith("Something Nobody Wrote Down", [{ food: "eggs", p: 12, c: 1, f: 10 }]));
  const m = d!.meals[0];
  assert.equal(m.fromLibrary, undefined);
  assert.equal(m.items[0].p, 12);
  assert.equal(m.subtotal.p, 12);
});

test("the day totals are recomputed from whatever ended up in the meals", () => {
  // If substitution moved the numbers, the total has to move with them. A total
  // that still reflects the model's invented macros would be the worst of both.
  const lib = MEAL_LIBRARY[0];
  const d = validatePlanDraft(draftWith(lib.name, [{ food: "x", p: 999, c: 999, f: 999 }]));
  assert.equal(d!.totals.p, d!.meals[0].subtotal.p);
  assert.notEqual(d!.totals.p, 999);
});
