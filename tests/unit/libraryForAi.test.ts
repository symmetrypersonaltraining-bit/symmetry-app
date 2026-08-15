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
