// ============================================================================
// NO MODEL MACRO REACHES A PLAN OR A RECIPE.
//
// Dustin, 13 Sep 2026: *"This must be fixed anywhere in the app ai gets macros
// n cal. Do not miss any paths in the app!"*
//
// The logging paths were fixed first. A sweep of the rest found the same fault
// in the two places that write the numbers everything else is measured against:
//
//   /api/nutrition-ai/plan-build — the model returned p/c/f/kcal for every item
//     of every meal, from recall. Accepting the plan writes those into
//     `meal_items`, which IS the definition of his targets, the basis of
//     adherence, and the total behind "this plan does not reach the target".
//     One bad number there is a wrong yardstick for every day the plan is live.
//
//   /api/recipes/ai — protein/carbs/fats per ingredient, from recall, landing in
//     `recipe_ingredients` and then on a real day through /api/recipes/log.
//
// The re-pricer runs against a fake resolver here, so these assertions are
// about BEHAVIOUR — the model's numbers are gone, the row's numbers are in,
// and a food nothing can price is dropped rather than passed through.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repricePlanDraft, repriceIngredients } from "@/lib/nutrition/repriceDraft";
import type { PlanDraft } from "@/lib/ai/nutrition-json";
import type { ResolveDeps } from "@/lib/nutrition/resolveFoodOp";

const SRC = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * A resolver that prices chicken honestly and has never heard of unicorn steak.
 * Patched over the module the re-pricer calls, which is the only way to assert
 * the arithmetic without a network.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deps = { db: {} as any, apiKey: "k", clientId: null } as ResolveDeps;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakePricer = async (_d: unknown, named: any[]) => {
  const items = named
    .filter((n) => /chicken|rice/i.test(n.name))
    .map((n) => ({
      requested: n.name,
      name: /chicken/i.test(n.name) ? "Chicken breast, cooked" : "White rice, cooked",
      amount: n.amount,
      unit: n.unit,
      // The real numbers, deliberately different from the draft's below.
      p: /chicken/i.test(n.name) ? 52.2 : 5.4,
      c: /chicken/i.test(n.name) ? 0 : 56.3,
      f: /chicken/i.test(n.name) ? 6 : 0.5,
      kcal: /chicken/i.test(n.name) ? 263 : 251,
      micros: null,
      food_id: "row-1",
      verified: true,
      estimated: false,
    }));
  const unresolved = named.filter((n) => !/chicken|rice/i.test(n.name)).map((n) => n.name);
  return { items, unresolved };
};

const draft = (): PlanDraft => ({
  targets: { kcal: 500, p: 60, c: 60, f: 10 },
  reasoning: null,
  meals: [
    {
      name: "Lunch",
      timing: "12:00",
      items: [
        // What the model claimed. Every one of these is wrong on purpose.
        { food: "chicken breast, cooked", amount: 170, unit: "g", p: 40, c: 0, f: 2, kcal: 178 },
        { food: "white rice, cooked", amount: 200, unit: "g", p: 4, c: 45, f: 0, kcal: 201 },
        { food: "unicorn steak", amount: 1, unit: "each", p: 99, c: 0, f: 0, kcal: 396 },
      ],
      subtotal: { kcal: 775, p: 143, c: 45, f: 2 },
    },
  ],
  totals: { kcal: 775, p: 143, c: 45, f: 2 },
});

describe("no model macro reaches a plan or a recipe", () => {
  it("every plan item is re-priced from the row, and the model's numbers are gone", async () => {
    const { plan } = await repricePlanDraft(deps, draft(), fakePricer as never);
    const items = plan.meals[0].items;
    const chicken = items.find((i) => /chicken/i.test(i.food));
    assert.ok(chicken, "the chicken survived");
    assert.equal(chicken!.p, 52.2, "the row's protein, not the model's 40");
    assert.equal(chicken!.kcal, 263, "the row's calories, not the model's 178");
    assert.equal(chicken!.food, "Chicken breast, cooked", "the row's name, so a wrong pick is visible");
  });

  it("a food nothing can price is dropped and named, never passed through", async () => {
    const { plan, unpriced } = await repricePlanDraft(deps, draft(), fakePricer as never);
    assert.deepEqual(unpriced, ["unicorn steak"]);
    assert.ok(!plan.meals[0].items.some((i) => /unicorn/i.test(i.food)),
      "keeping it would put an unsourced number into meal_items through the side door");
  });

  it("subtotals and totals are recomputed from the real rows", async () => {
    const { plan } = await repricePlanDraft(deps, draft(), fakePricer as never);
    // 263 + 251, not the model's 775.
    assert.equal(plan.meals[0].subtotal.kcal, 514);
    assert.equal(plan.totals.kcal, 514);
    assert.equal(plan.totals.p, 57.6);
  });

  it("a library meal is left alone — its numbers are already checked", async () => {
    const d = draft();
    d.meals[0].fromLibrary = true;
    const { plan } = await repricePlanDraft(deps, d, fakePricer as never);
    assert.equal(plan.meals[0].items.length, 3, "re-resolving a library meal trades known numbers for a guess");
  });

  it("recipe ingredients are priced from rows, and source says which", async () => {
    const { ingredients, unpriced } = await repriceIngredients(deps, [
      { food: "chicken breast, cooked", amount: 170, unit: "g", protein: 40, carbs: 0, fats: 2 },
      { food: "unicorn steak", amount: 1, unit: "each", protein: 99, carbs: 0, fats: 0 },
    ], fakePricer as never);
    assert.equal(ingredients.length, 1);
    assert.equal(ingredients[0].protein, 52.2, "the row's protein, not the model's 40");
    assert.equal(ingredients[0].source, "catalog");
    assert.equal(ingredients[0].kcal, 263);
    assert.deepEqual(unpriced, ["unicorn steak"]);
  });

  it("both routes actually call the re-pricer", () => {
    assert.match(SRC("src/app/api/nutrition-ai/plan-build/route.ts"), /repricePlanDraft/);
    assert.match(SRC("src/app/api/recipes/ai/route.ts"), /repriceIngredients/);
  });

  it("the priced item echoes what was asked for, so a draft can be matched back", () => {
    assert.match(SRC("src/lib/nutrition/resolveFoodOp.ts"), /requested: n\.name/);
  });
});
