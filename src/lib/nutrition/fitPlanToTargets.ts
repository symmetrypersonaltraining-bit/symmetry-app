/**
 * A PLAN HANDED OVER AGAINST A TARGET HAS TO BE ON IT.
 *
 * Dustin, 13 Sep 2026, opening a coach-consult draft that recommended 1,703
 * kcal and then handed him a plan coming to 5,689:
 *
 *   *"If I'm creating a meal plan with suggested numbers should the draft be
 *   set at the actual number? This is common sense shit again — why would I ask
 *   for a recommendation then have it spit out a 5k calorie meal plan at me?
 *   The idea is the AI creates the meal plan based on set numbers, then I can
 *   fine tune the numbers, not suggest 2k calories then give me a plan 2.5x
 *   that."*
 *
 * He is right, and the route was doing exactly that: `planTargetDrift` measured
 * the miss, stamped `targetsMet: false`, and returned the plan anyway. A red
 * badge on a plan nobody could use.
 *
 * ── WHY THE MISS GOT SO MUCH BIGGER ────────────────────────────────────────
 *
 * Look at what his draft actually said: protein 145 against a 144 target —
 * exact. Carbs 182 against 147. Fat **487 against 60**. A plan whose every
 * amount was inflated would be over on all three; being perfect on protein and
 * out by 712% on fat is one or two items carrying an absurd amount of a fat —
 * an oil or a nut butter the model wrote a wrong number next to.
 *
 * That kind of typo used to hide. Before repriceDraft (#72) the model supplied
 * the macros too, so it would state plausible ones for the plan it thought it
 * had written. Now every number is read from a real row, so a 400 g amount is
 * faithfully priced at 400 g and the error surfaces in full. Pricing honestly
 * is right; handing the result over without checking it is not.
 *
 * ── TWO STEPS, IN THIS ORDER ───────────────────────────────────────────────
 *
 * 1. DROP THE ABSURD ITEM. One food supplying more than 55% of the whole day is
 *    not a portion, it is a slipped decimal. Scaling first would keep it, just
 *    smaller, and quietly starve every other food to make room for it.
 * 2. THEN SCALE WHAT IS LEFT to land on the target calories.
 *
 * Scaling an amount and its macros by the same factor keeps every number
 * row-derived — 100 g of banana at 99 kcal is 50 g at 49.5 — so this does not
 * reopen the door #72 closed. It is also the rule he already approved for the
 * calorie box in macroSplit: same diet, less of it.
 *
 * The factor is clamped. A plan needing more than a 4x cut or a 4x lift is not
 * a plan with the wrong portions, it is the wrong plan, and it comes back
 * flagged rather than squeezed into shape.
 */

import type { PlanDraft, PlanMeal, PlanMealItem } from "@/lib/ai/nutrition-json";

/**
 * A single food may not be more than the WHOLE day's calorie target.
 *
 * The first version of this rule used a share of the target — 55% — and it was
 * wrong in a way the tests caught immediately: a 311 kcal chicken breast in a
 * 311 kcal one-meal plan is 100% of the target and perfectly legitimate, and a
 * banana is 99 kcal whatever the target says. A fraction cannot tell a large
 * portion from an impossible one.
 *
 * "More calories than the person eats all day" can. It has no false positives
 * in any real plan — five meals to 1,700 kcal contain nothing over 1,700 — and
 * it catches the case this exists for: 450 g of oil at 4,050 kcal in a 1,703
 * kcal day.
 */
const isAbsurd = (kcal: number, target: number) => kcal > target;
/** Past these the plan is wrong, not merely mis-portioned. */
export const MIN_FACTOR = 0.25;
export const MAX_FACTOR = 4;

const r1 = (n: number) => Math.round(n * 10) / 10;

function scaleItem(it: PlanMealItem, factor: number): PlanMealItem {
  return {
    ...it,
    // A countable amount stays countable: 3 rice cakes do not become 2.4.
    amount: it.amount == null ? null : roundAmount(it.amount * factor),
    p: r1(it.p * factor),
    c: r1(it.c * factor),
    f: r1(it.f * factor),
    kcal: Math.round(it.kcal * factor),
  };
}

/** Grams read fine at whole numbers; counts and spoons need a step they can hit. */
function roundAmount(n: number): number {
  if (n >= 20) return Math.round(n);
  if (n >= 3) return Math.round(n * 2) / 2;
  return Math.round(n * 4) / 4;
}

function subtotalOf(items: PlanMealItem[]) {
  const t = items.reduce(
    (a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  return { kcal: Math.round(t.kcal), p: r1(t.p), c: r1(t.c), f: r1(t.f) };
}

function totalsOf(meals: PlanMeal[]) {
  const t = meals.reduce(
    (a, m) => ({
      kcal: a.kcal + m.subtotal.kcal,
      p: a.p + m.subtotal.p,
      c: a.c + m.subtotal.c,
      f: a.f + m.subtotal.f,
    }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  return { kcal: Math.round(t.kcal), p: r1(t.p), c: r1(t.c), f: r1(t.f) };
}

export interface FitResult {
  plan: PlanDraft;
  /** Foods removed for carrying an impossible amount, by name. */
  dropped: string[];
  /** What everything left was scaled by. 1 means it was already on target. */
  factor: number;
  /** True when the plan could not be brought onto the target. */
  stillOff: boolean;
}

/**
 * Bring a re-priced plan onto its own targets, or say plainly that it cannot be.
 *
 * Library meals are scaled like everything else: their macros are checked, but
 * the PORTION is still a choice, and leaving them fixed while the rest of the
 * plan shrinks around them is how a target gets hit by starving four meals to
 * protect one.
 */
export function fitPlanToTargets(plan: PlanDraft): FitResult {
  const target = plan.targets?.kcal ?? 0;
  if (!target || !plan.meals?.length) {
    return { plan, dropped: [], factor: 1, stillOff: false };
  }

  // ── 1. the slipped decimal ────────────────────────────────────────────────
  //
  // Only ever when there is something left afterwards. Dropping the single item
  // of a one-item plan leaves nothing to scale and turns a bad plan into an
  // empty one, which is a worse answer than the bad plan.
  const itemCount = plan.meals.reduce((a, m) => a + (m.items?.length || 0), 0);
  const dropped: string[] = [];
  let meals: PlanMeal[] = itemCount < 2 ? plan.meals : plan.meals.map((m) => {
    const keep = (m.items || []).filter((it) => {
      if (isAbsurd(it.kcal, target)) {
        dropped.push(it.food);
        return false;
      }
      return true;
    });
    return keep.length === (m.items || []).length ? m : { ...m, items: keep, subtotal: subtotalOf(keep) };
  });

  // ── 2. the portions ───────────────────────────────────────────────────────
  const after = totalsOf(meals);
  let factor = 1;
  let stillOff = false;
  if (after.kcal > 0) {
    const wanted = target / after.kcal;
    factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, wanted));
    stillOff = Math.abs(wanted - factor) > 0.001;
    if (Math.abs(factor - 1) > 0.005) {
      meals = meals.map((m) => {
        const items = (m.items || []).map((it) => scaleItem(it, factor));
        return { ...m, items, subtotal: subtotalOf(items) };
      });
    }
  } else {
    stillOff = true;
  }

  return { plan: { ...plan, meals, totals: totalsOf(meals) }, dropped, factor, stillOff };
}
