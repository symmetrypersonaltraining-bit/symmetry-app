import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recipeTotals, perServing, validateRecipe, cleanRecipe, kcalOf } from "../../src/lib/recipes";

/**
 * RECIPES — the arithmetic, and who is allowed to publish.
 *
 * Dustin: "build a recipe builder for everyone… they can save to their library
 * and submit to me to be approved for a public library fid use by everyone."
 *
 * Two things here can hurt someone and neither one announces itself:
 *   1. Per-serving macros. People log this number and eat to it. A recipe that
 *      divides wrong, or divides by zero, is wrong in a way that looks fine.
 *   2. Publishing. "Everyone can see it" must never depend on which code path
 *      did the write, so it is enforced by a database trigger and asserted here.
 */

const ing = (p: number, c: number, f: number, food = "x") => ({ food, amount: 1, unit: "cup", protein: p, carbs: c, fats: f });

test("calories come from the macros, never from a typed number", () => {
  assert.equal(kcalOf(30, 40, 10), 30 * 4 + 40 * 4 + 10 * 9);
});

test("totals add the whole pot up", () => {
  const t = recipeTotals([ing(30, 0, 10), ing(6, 44, 1), ing(0, 0, 14)]);
  assert.deepEqual({ p: t.protein, c: t.carbs, f: t.fats }, { p: 36, c: 44, f: 25 });
  assert.equal(t.kcal, kcalOf(36, 44, 25));
});

test("per serving divides, and the calories follow the divided macros", () => {
  const per = perServing([ing(40, 40, 20)], 4);
  assert.deepEqual({ p: per.protein, c: per.carbs, f: per.fats }, { p: 10, c: 10, f: 5 });
  assert.equal(per.kcal, kcalOf(10, 10, 5), "not the total's kcal divided separately");
});

test("zero servings never prints Infinity calories at somebody", () => {
  for (const s of [0, -2, NaN, undefined as unknown as number]) {
    const per = perServing([ing(40, 40, 20)], s);
    assert.ok(Number.isFinite(per.kcal), `servings=${s} must not blow up`);
    assert.equal(per.protein, 40, "an unusable serving count falls back to the whole recipe");
  }
});

test("validation says what to fix, in the order you would fix it", () => {
  assert.deepEqual(validateRecipe({ title: "", servings: 4, ingredients: [ing(1, 1, 1)] }), ["Give it a name."]);
  assert.deepEqual(validateRecipe({ title: "Chili", servings: 4, ingredients: [] }), ["Add at least one ingredient."]);
  assert.deepEqual(validateRecipe({ title: "Chili", servings: 0, ingredients: [ing(1, 1, 1)] }), ["Servings has to be more than zero."]);
  assert.deepEqual(validateRecipe({ title: "Chili", servings: 4, ingredients: [ing(1, 1, 1)] }), []);
});

test("a half-typed row is not a recipe", () => {
  // The builder always has a blank row on the end. Saving it would leave an
  // ingredient called "" with 0/0/0 in someone's library forever.
  const cleaned = cleanRecipe({
    title: "  Turkey chili  ", servings: 4, instructions: ["Brown the meat", "  ", ""],
    ingredients: [ing(30, 0, 10, "Ground turkey"), ing(0, 0, 0, "   "), ing(0, 0, 0, "")],
  });
  assert.equal(cleaned.title, "Turkey chili");
  assert.deepEqual(cleaned.instructions, ["Brown the meat"]);
  assert.equal(cleaned.ingredients.length, 1);
});

test("an AI row keeps its label all the way to the database", () => {
  // A model's estimate and a catalog lookup are not the same kind of fact.
  const cleaned = cleanRecipe({
    title: "X", servings: 1, instructions: [],
    ingredients: [{ ...ing(20, 0, 5, "Ground beef"), source: "ai" as const, note: "assumed raw weight" }],
  });
  assert.equal(cleaned.ingredients[0].source, "ai");
  assert.equal(cleaned.ingredients[0].note, "assumed raw weight");
});

// ── The rules that live in the route and the schema ─────────────────────────
const ROUTE = readFileSync(join(process.cwd(), "src/app/api/recipes/route.ts"), "utf8");
const AI = readFileSync(join(process.cwd(), "src/app/api/recipes/ai/route.ts"), "utf8");

test("stored macros are derived from the saved ingredients, not sent by the browser", () => {
  assert.match(ROUTE, /const totals = recipeTotals\(clean\.ingredients\)/);
  assert.match(ROUTE, /total_kcal: totals\.kcal/);
});

test("only the trainer can publish", () => {
  assert.match(ROUTE, /if \(!me\.isTrainer\) return NextResponse\.json\(\{ error: "Trainer only" \}/);
});

test("a client cannot delete a recipe other people are cooking from", () => {
  assert.match(ROUTE, /r\.visibility === "public" && !me\.isTrainer/);
});

test("re-submitting after a decline clears the old verdict", () => {
  // Otherwise Dustin sees last month's "not yet" note sitting next to a fresh
  // request, and the client sees a rejection they already acted on.
  assert.match(ROUTE, /reviewed_at: null,\s*\n\s*review_note: null,/);
});

test("the AI never gets to state the calories", () => {
  assert.match(AI, /Do NOT return calories/);
  assert.match(AI, /kcal: kcalOf\(i\.protein, i\.carbs, i\.fats\)/);
  assert.match(AI, /source: "ai" as const/);
});

test("free foods are not given invented macros", () => {
  assert.match(AI, /Water, salt, pepper, herbs, spices[^\n]*are 0\/0\/0/);
});
