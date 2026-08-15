/**
 * The shared library, rendered for a model to build a plan out of.
 *
 * Dustin, 15 Aug: "these should be accessable to clients to custom build and
 * the ai to use if they want to have ai build it… make this all part of the
 * meal plan builder process ai or client run."
 *
 * ── Why the model gets the library rather than inventing every item ───────
 *
 * Left to itself the plan builder writes plausible food and plausible macros.
 * Plausible is the problem: "6 oz chicken, 52 g protein" is right, and
 * "1 cup Greek yogurt, 17 g protein" is wrong by a third, and nothing on the
 * page tells a client which is which. Every line in this library has been
 * checked against its portion by mealLibrary.test.ts.
 *
 * So the library is offered as a MENU, not a mandate. A plan that uses three
 * library meals and invents two is better than one that invents five, and a
 * client with an allergy or an empty fridge still needs the model free to
 * improvise. The prompt says exactly that.
 *
 * ── Kept deliberately small ───────────────────────────────────────────────
 *
 * 50 meals with every ingredient listed is a few thousand tokens on a call that
 * already carries the client's context. Meals are rendered as one line each —
 * name, slot, macros — which is what the model needs to CHOOSE. If it picks
 * one, the items are already in the database under that exact name, so nothing
 * downstream has to trust the model's arithmetic.
 */

import { MEAL_LIBRARY, mealTotals } from "./mealLibrary";
import { RECIPE_LIBRARY, perServing } from "./recipeLibrary";

/** One line per meal: enough to choose from, not enough to drown the prompt. */
export function mealLibraryForPrompt(): string {
  const bySlot = new Map<string, string[]>();
  for (const m of MEAL_LIBRARY) {
    const t = mealTotals(m.items);
    const line = `- ${m.name} — ${t.kcal} kcal, ${t.protein}P / ${t.carbs}C / ${t.fats}F`;
    const arr = bySlot.get(m.slot) || [];
    arr.push(line);
    bySlot.set(m.slot, arr);
  }
  const order = ["breakfast", "lunch", "dinner", "snack"];
  return order
    .filter((s) => bySlot.has(s))
    .map((s) => `${s.toUpperCase()}\n${(bySlot.get(s) || []).join("\n")}`)
    .join("\n\n");
}

/** Recipes, with servings, because a recipe is portioned differently. */
export function recipeLibraryForPrompt(): string {
  return RECIPE_LIBRARY.map((r) => {
    const ps = perServing(r);
    const mins = r.prepMinutes + r.cookMinutes;
    return `- ${r.title} (serves ${r.servings}, ${mins} min) — per serving: ${ps.kcal} kcal, ${ps.protein}P / ${ps.carbs}C / ${ps.fats}F`;
  }).join("\n");
}

/**
 * The block appended to the plan-builder system prompt.
 *
 * The instruction to prefer library items but not be trapped by them is the
 * whole design. A model told "use ONLY these" will force a 400 kcal breakfast
 * into a 250 kcal slot and quietly break the totals it was asked to hit.
 */
export function libraryPromptBlock(): string {
  return `
── SYMMETRY MEAL LIBRARY ──────────────────────────────────────────────────

These meals and recipes already exist, with portions weighed and macros
verified. PREFER them when one fits the target — a client can then log it in
one tap, and the numbers are known to be right.

Use a library item by giving its name EXACTLY as written here. You may still
invent a meal when nothing fits, when the client's preferences or allergies
rule the library out, or when the macros need shaping that no library item
gives you. A plan that uses three library meals and builds two is better than
one that forces five.

${mealLibraryForPrompt()}

RECIPES (cook-from-scratch; macros are PER SERVING)
${recipeLibraryForPrompt()}

── END LIBRARY ────────────────────────────────────────────────────────────
`.trim();
}
