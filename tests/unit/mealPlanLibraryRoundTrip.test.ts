// ============================================================================
// The plan builder actually uses the library — verified, not assumed.
//
// The design is a three-step chain and every step was written separately:
//
//   1. libraryPromptBlock() renders the library into the system prompt
//   2. the model picks an item and returns its name "EXACTLY as written"
//   3. validatePlanDraft() matches that name and replaces the model's items
//      with the library's verified ones
//
// Each step is fine on its own and the chain was still broken. Step 1 renders
// recipes; step 3 only ever searched the MEALS. So a model doing precisely what
// it was told with a recipe had its own invented per-serving macros carried
// straight through to the plan a client reads — which is the exact failure the
// library exists to prevent, sitting in the half nobody had measured. Before
// the fix: 50 of 50 meals substituted, 1 of 20 recipes, and that one only
// because "Turkey Chili" is also the name of a meal, so picking the recipe
// silently returned a meal 127 kcal heavier.
//
// This test walks the chain end to end for all 70 items. It cannot call the
// real model — there is no API key in a sandbox — so it plays the model's part
// exactly: hand back the rendered name with deliberately wrong macros attached,
// and assert the wrong macros do not survive.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MEAL_LIBRARY, mealTotals } from "../../src/lib/nutrition/mealLibrary.ts";
import { RECIPE_LIBRARY, perServing } from "../../src/lib/nutrition/recipeLibrary.ts";
import { libraryPromptBlock, promptNameForRecipe } from "../../src/lib/nutrition/libraryForAi.ts";
import { validatePlanDraft } from "../../src/lib/ai/nutrition-json.ts";

/** What the model would send back if it picked `name`, with junk macros. */
function replyPicking(name: string) {
  return {
    targets: { kcal: 2000, p: 150, c: 200, f: 60 },
    reasoning: null,
    meals: [
      {
        name,
        timing: "7:00 AM",
        // Deliberately absurd. If substitution fires, none of this survives.
        items: [{ food: "whatever the model remembered", amount: 1, unit: "serving", p: 1, c: 1, f: 1, kcal: 999 }],
      },
    ],
    totals: { kcal: 2000, p: 150, c: 200, f: 60 },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pick = (name: string) => validatePlanDraft(replyPicking(name)) as any;

describe("plan builder — the prompt offers the whole library", () => {
  const block = libraryPromptBlock();

  it("every meal name appears in the prompt verbatim", () => {
    const missing = MEAL_LIBRARY.filter((m) => !block.includes(m.name)).map((m) => m.name);
    assert.deepEqual(missing, [], `meals the model is never shown:\n  ${missing.join("\n  ")}`);
  });

  it("every recipe appears in the prompt under the name the matcher accepts", () => {
    const missing = RECIPE_LIBRARY.filter((r) => !block.includes(promptNameForRecipe(r.title))).map((r) => r.title);
    assert.deepEqual(missing, [], `recipes the model is never shown:\n  ${missing.join("\n  ")}`);
  });

  it("the prompt still tells the model to copy the name exactly", () => {
    // The whole substitution turns on an exact match. If this instruction is
    // ever softened, the matcher stops firing and nothing visibly breaks — the
    // plans just quietly go back to invented macros.
    assert.match(block, /EXACTLY as written/, "the prompt no longer asks for the name verbatim");
  });

  it("the prompt says the library is a menu, not a mandate", () => {
    // Forcing library-only makes the model jam a 400 kcal breakfast into a 250
    // kcal slot and break the totals it was told to hit.
    assert.match(block, /You may still\s+invent a meal|may still invent/, "the prompt no longer permits inventing a meal when nothing fits");
  });
});

describe("plan builder — a picked library item comes back verified", () => {
  it("all 50 meals substitute, with the library's own totals", () => {
    const bad: string[] = [];
    for (const m of MEAL_LIBRARY) {
      const draft = pick(m.name);
      const want = mealTotals(m.items);
      const got = draft?.meals?.[0];
      if (!got?.fromLibrary) { bad.push(`${m.name}: not substituted`); continue; }
      if (got.subtotal.kcal !== want.kcal) bad.push(`${m.name}: ${got.subtotal.kcal} kcal, library says ${want.kcal}`);
    }
    assert.deepEqual(bad, [], `meals whose macros the model would have decided:\n  ${bad.join("\n  ")}`);
  });

  it("all 20 recipes substitute, at the library's per-serving macros", () => {
    const bad: string[] = [];
    for (const r of RECIPE_LIBRARY) {
      const draft = pick(promptNameForRecipe(r.title));
      const want = perServing(r);
      const got = draft?.meals?.[0];
      if (!got?.fromLibrary) { bad.push(`${r.title}: not substituted`); continue; }
      if (got.subtotal.kcal !== want.kcal) bad.push(`${r.title}: ${got.subtotal.kcal} kcal, library says ${want.kcal}`);
    }
    assert.deepEqual(bad, [], `recipes whose macros the model would have decided:\n  ${bad.join("\n  ")}`);
  });

  it("the model's invented numbers never survive a match", () => {
    const draft = pick(MEAL_LIBRARY[0].name);
    const items = draft.meals[0].items as { kcal: number }[];
    assert.ok(!items.some((i) => i.kcal === 999), "the 999 kcal placeholder came through — the items were not replaced");
  });
});

describe("plan builder — a name in both lists is not ambiguous", () => {
  it("the meal name returns the meal, and the recipe label returns the recipe", () => {
    const collisions = RECIPE_LIBRARY.filter((r) =>
      MEAL_LIBRARY.some((m) => m.name.trim().toLowerCase() === r.title.trim().toLowerCase()),
    );
    // If there are none, nothing to prove — but the mechanism must still be
    // there for the next one somebody adds, which the round-trip tests cover.
    for (const r of collisions) {
      const meal = MEAL_LIBRARY.find((m) => m.name.trim().toLowerCase() === r.title.trim().toLowerCase())!;
      const asMeal = pick(meal.name);
      const asRecipe = pick(promptNameForRecipe(r.title));
      assert.equal(asMeal.meals[0].subtotal.kcal, mealTotals(meal.items).kcal, `"${meal.name}" as a meal did not return the meal`);
      assert.equal(asRecipe.meals[0].subtotal.kcal, perServing(r).kcal, `"${promptNameForRecipe(r.title)}" did not return the recipe`);
      assert.notEqual(
        promptNameForRecipe(r.title),
        r.title,
        `"${r.title}" exists as both a meal and a recipe but is offered to the model under one name — one of them is unreachable`,
      );
    }
  });
});

describe("plan builder — a name that is NOT in the library is left alone", () => {
  it("an invented meal keeps the model's own items", () => {
    // Matching must stay exact. A fuzzy match would swap a client's meal for a
    // different one that happened to share a word, which is worse than leaving
    // an invented meal as the model wrote it.
    const draft = pick("Grilled Something With A Sauce");
    assert.equal(draft.meals[0].fromLibrary, undefined, "a non-library name was treated as a library item");
    assert.equal(draft.meals[0].items[0].food, "whatever the model remembered");
  });

  it("a near-miss on a library name does not match", () => {
    const draft = pick(MEAL_LIBRARY[0].name + " with extra rice");
    assert.notEqual(draft.meals[0].fromLibrary, true, "a partial name match substituted a different meal's items");
  });
});
