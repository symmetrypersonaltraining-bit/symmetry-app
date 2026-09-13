/**
 * A DRAFT THE MODEL WROTE IS PRICED FROM ROWS BEFORE ANYBODY SEES IT.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 *
 * Dustin, 13 Sep 2026: *"This must be fixed anywhere in the app ai gets macros
 * n cal. Do not miss any paths in the app!"*
 *
 * The logging paths were fixed first — parse, the coach chat, the photo, the
 * Adjust sheet. A sweep of the rest found the same fault in the two places that
 * WRITE THE NUMBERS EVERYTHING ELSE IS MEASURED AGAINST:
 *
 *   /api/nutrition-ai/plan-build — the model returned p/c/f/kcal for every item
 *     of every meal, from recall. Accepting that plan writes those figures into
 *     `meal_items`, which is the plan's own definition of his targets, the
 *     basis of adherence, and the total behind "this plan does not reach the
 *     target". A wrong number here is not one wrong meal; it is a wrong
 *     yardstick for every day the plan is live.
 *
 *   /api/recipes/ai — the model returned protein/carbs/fats for every
 *     ingredient, from recall, marked `source: "ai"`. Those land in
 *     `recipe_ingredients`, and /api/recipes/log turns them into `est_kcal` on
 *     a real day.
 *
 * ── WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT ─────────────────────────────
 *
 * The model keeps the job it is good at and is the only thing that can do:
 * choosing WHICH FOODS and HOW MUCH of each. Every number it attaches to them
 * is discarded and re-read through the one pipeline the rest of the app already
 * uses — food_catalog, then USDA online, then a published page for a named
 * restaurant, and only then a marked estimate.
 *
 * A food nothing can price is NOT silently zeroed and NOT left at the model's
 * figure. It is returned by name in `unpriced` so the caller can say so.
 *
 * ── THE HONEST CONSEQUENCE ───────────────────────────────────────────────────
 *
 * A plan that "hit the targets" on the model's arithmetic may now show drift,
 * because the real numbers are not the numbers it made up. That is not a
 * regression — it is the first time the figure has been true. Both callers
 * already have drift handling built and on screen (`planTargetDrift`, and the
 * recipe fix loop), and both now run against real rows.
 */

import type { PlanDraft, PlanMeal, PlanMealItem } from "@/lib/ai/nutrition-json";
import { priceNamedFoods, type PricedItem, type ResolveDeps } from "@/lib/nutrition/resolveFoodOp";
import { readNutrients, scaleNutrients } from "@/lib/nutrition/nutrients";

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The pricer, injectable.
 *
 * Both functions default to the real `priceNamedFoods`, so no caller passes
 * one. It is a parameter purely so a test can price a known food known-wrongly
 * and prove the model's figure was thrown away — an assertion about behaviour
 * rather than one more grep over the source.
 */
export type Pricer = typeof priceNamedFoods;

/** Index the priced results by the name that was asked for. */
function byRequested(priced: PricedItem[]): Map<string, PricedItem> {
  const m = new Map<string, PricedItem>();
  for (const p of priced) {
    const k = p.requested.trim().toLowerCase();
    if (!m.has(k)) m.set(k, p);
  }
  return m;
}

/**
 * Re-price every item of a plan draft, then recompute the subtotals and totals
 * from what came back.
 *
 * Library meals are left exactly as they are: `fromLibrary` means the items were
 * already replaced with the library's own checked rows, and re-resolving those
 * by name would throw away the better numbers for a fresh guess at them.
 */
export async function repricePlanDraft(
  deps: ResolveDeps,
  plan: PlanDraft,
  pricer: Pricer = priceNamedFoods,
): Promise<{ plan: PlanDraft; unpriced: string[] }> {
  const unpriced: string[] = [];
  const meals: PlanMeal[] = [];

  for (const meal of plan.meals) {
    if (meal.fromLibrary || !meal.items?.length) {
      meals.push(meal);
      continue;
    }
    const { items: priced, unresolved } = await pricer(
      deps,
      meal.items.map((i) => ({ name: i.food, amount: i.amount, unit: i.unit, context: null })),
    );
    unpriced.push(...unresolved);
    const found = byRequested(priced);

    const items: PlanMealItem[] = [];
    for (const it of meal.items) {
      const hit = found.get(it.food.trim().toLowerCase());
      // NOT the model's figure as a fallback. A food nothing could price is
      // dropped from the plan and named in `unpriced`; keeping it would put an
      // unsourced number back into meal_items through the side door this whole
      // module exists to close.
      if (!hit) continue;
      items.push({
        food: hit.name,
        amount: hit.amount,
        unit: hit.unit,
        p: r1(hit.p),
        c: r1(hit.c),
        f: r1(hit.f),
        kcal: hit.kcal,
        ...(hit.micros ? { micros: readNutrients(hit.micros) } : {}),
      });
    }
    const subtotal = items.reduce(
      (a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }),
      { kcal: 0, p: 0, c: 0, f: 0 },
    );
    meals.push({
      ...meal,
      items,
      subtotal: { kcal: Math.round(subtotal.kcal), p: r1(subtotal.p), c: r1(subtotal.c), f: r1(subtotal.f) },
    });
  }

  const totals = meals.reduce(
    (a, m) => ({
      kcal: a.kcal + m.subtotal.kcal,
      p: a.p + m.subtotal.p,
      c: a.c + m.subtotal.c,
      f: a.f + m.subtotal.f,
    }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );

  return {
    plan: {
      ...plan,
      meals,
      totals: { kcal: Math.round(totals.kcal), p: r1(totals.p), c: r1(totals.c), f: r1(totals.f) },
    },
    unpriced,
  };
}

export interface DraftIngredient {
  food: string;
  amount: number | null;
  unit: string | null;
  protein: number;
  carbs: number;
  fats: number;
  note?: string | null;
}

export interface RepricedIngredient extends DraftIngredient {
  kcal: number;
  /** "catalog" when a row priced it, "ai" when the marked estimate did. */
  source: "catalog" | "ai";
  food_id: string | null;
  /** The published page, when a restaurant or brand lookup found one. */
  source_url?: string | null;
  base_amount: number | null;
  micros?: unknown;
}

/**
 * Re-price a list of recipe ingredients the model wrote.
 *
 * `source` keeps its meaning for the builder UI — "ai" still marks a line whose
 * numbers nothing could check — but it now means the last-resort estimate
 * rather than "every line", which is what it meant before 13 Sep.
 */
export async function repriceIngredients(
  deps: ResolveDeps,
  ingredients: DraftIngredient[],
  pricer: Pricer = priceNamedFoods,
): Promise<{ ingredients: RepricedIngredient[]; unpriced: string[] }> {
  if (!ingredients.length) return { ingredients: [], unpriced: [] };

  const { items: priced, unresolved } = await pricer(
    deps,
    ingredients.map((i) => ({ name: i.food, amount: i.amount, unit: i.unit, context: null })),
  );
  const found = byRequested(priced);

  const out: RepricedIngredient[] = [];
  for (const i of ingredients) {
    const hit = found.get(i.food.trim().toLowerCase());
    if (!hit) continue;
    out.push({
      ...i,
      food: hit.name,
      amount: hit.amount,
      unit: hit.unit,
      protein: r1(hit.p),
      carbs: r1(hit.c),
      fats: r1(hit.f),
      kcal: hit.kcal,
      source: hit.estimated ? "ai" : "catalog",
      food_id: hit.food_id,
      ...(hit.source_url ? { source_url: hit.source_url } : {}),
      base_amount: hit.amount,
      ...(hit.micros ? { micros: scaleNutrients(readNutrients(hit.micros), 1) } : {}),
    });
  }
  return { ingredients: out, unpriced: unresolved };
}

/**
 * Price a coach suggestion chip from a row, and drop the ones nothing can price.
 *
 * `delta` used to be whatever the model remembered, and tapping the chip wrote
 * it straight to `meal_adherence_logs.est_*` — the last path where recall
 * reached the log in one tap, and the one with the fewest people watching,
 * because a chip looks like a button rather than like a number.
 *
 * A chip with no priceable food is REMOVED rather than shown with a guess: its
 * whole purpose is the one tap that writes those numbers down.
 */
export async function priceCoachSuggestions<T extends { label: string; food?: string; amount?: number | null; unit?: string | null; delta: { p: number; c: number; f: number; kcal: number } }>(
  deps: ResolveDeps,
  suggestions: T[] | undefined,
  pricer: Pricer = priceNamedFoods,
): Promise<T[] | undefined> {
  if (!suggestions?.length) return suggestions;
  const named = suggestions.filter((s) => s.food);
  if (!named.length) return undefined;

  const { items } = await pricer(
    deps,
    named.map((s) => ({ name: s.food as string, amount: s.amount ?? null, unit: s.unit ?? null, context: null })),
  );
  const found = byRequested(items);

  const out: T[] = [];
  for (const s of named) {
    const hit = found.get((s.food as string).trim().toLowerCase());
    if (!hit) continue;
    out.push({ ...s, delta: { p: r1(hit.p), c: r1(hit.c), f: r1(hit.f), kcal: hit.kcal } });
  }
  return out.length ? out : undefined;
}
