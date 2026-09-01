// Turning one day's adjustment into a permanent plan change.
//
// Dustin, 2026-08-04: "can clients edit current meal plans to be saved? if not
// lets make that happen so he can edit and save what he wants."
//
// They could not. "Adjust / edit this meal" writes item_overrides onto that
// DAY's meal_adherence_logs row, so a client who eats 3/4 cup of rice instead of
// the prescribed 1/2 had to make the same edit again tomorrow, and the day
// after. Jerry has been re-typing egg whites into an off-plan box every morning
// for a fortnight.
//
// The pieces to fix it already existed: meal_plans is versioned, RLS already
// distinguishes trainer-authored plans from created_by_client ones, and
// adoptPlan() installs a client-built plan while archiving the old one
// non-destructively. What was missing is the step between — take the plan you
// are ALREADY on, apply this one edit, and keep it.
//
// This module is the arithmetic half: what the meal's items become once the
// day's overrides are folded in. Kept pure so the scaling can be tested without
// a database, because getting it wrong silently rewrites someone's plan.

import { addedScale } from "./dailyTotals";

export interface PlanItemLike {
  id: string;
  food: string;
  amount: number | string | null;
  unit: string | null;
  basis?: string | null;
  protein: number | string | null;
  carbs: number | string | null;
  fats: number | string | null;
  is_unlimited?: boolean | null;
  position?: number | null;
}

export interface AddedLike {
  name: string;
  servings?: number;
  p?: number;
  c?: number;
  f?: number;
  /**
   * A REAL MEASURE, when there is one.
   *
   * These three were missing, so saving a meal to the plan threw away every
   * measured added food's actual size. `dailyTotals.addedScale()` already knew
   * that p/c/f describe `base_amount` of `unit` and the food contributes
   * amount / base_amount of them; this module scaled by `servings` alone.
   *
   * 170 g of chicken quoted per 100 g therefore counted as 1.7x on the day it
   * was eaten and 1x the moment it was saved into the plan, and 50 g counted as
   * 0.5x then 1x. The plan silently disagreed with the day it came from, in
   * whichever direction the client had adjusted -- and the size and unit they
   * had typed were replaced by the words "1 serving".
   */
  amount?: number | null;
  unit?: string | null;
  base_amount?: number | null;
}

export interface ResolvedItem {
  food: string;
  amount: number | null;
  unit: string | null;
  basis: string | null;
  protein: number;
  carbs: number;
  fats: number;
  is_unlimited: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The meal as edited: plan items at their adjusted amounts, removed items gone,
 * added foods folded in as real items.
 *
 * Macros scale with the amount exactly the way planMealMacros scales them for
 * the day total, so what the client saw on the card is what the plan becomes.
 * An amount of 0 means "I took this out" — that item is dropped rather than
 * stored as a zero, because a plan full of 0 g rows is unreadable.
 *
 * An item with no original amount (or an unlimited one) cannot be scaled — a
 * ratio needs a denominator — so it is carried through untouched.
 */
export function resolveEditedItems(
  items: PlanItemLike[],
  overrides: Record<string, unknown> | null | undefined,
): ResolvedItem[] {
  const ov = overrides || {};
  const out: ResolvedItem[] = [];

  for (const it of items || []) {
    const o = ov[it.id] as { amount?: number } | undefined;
    const oAmt = o && typeof o.amount === "number" ? o.amount : undefined;
    if (oAmt === 0) continue; // removed for good

    const orig = it.amount == null ? null : num(it.amount);
    const amount = oAmt != null ? oAmt : orig;
    const canScale = oAmt != null && orig != null && orig > 0 && !it.is_unlimited;
    const scale = canScale ? oAmt / orig : 1;

    out.push({
      food: it.food,
      amount: amount == null ? null : round1(amount),
      unit: it.unit ?? null,
      basis: it.basis === "cooked" || it.basis === "raw" ? it.basis : null,
      protein: Math.round(num(it.protein) * scale),
      carbs: Math.round(num(it.carbs) * scale),
      fats: Math.round(num(it.fats) * scale),
      is_unlimited: !!it.is_unlimited,
    });
  }

  // Foods added to the meal become items of it, scaled the SAME way the day
  // total scales them -- addedScale() is the single definition, shared rather
  // than reimplemented, because two definitions of "how much is on the plate"
  // is exactly how a plan comes to disagree with the day it was saved from.
  const added = (ov.__added as AddedLike[] | undefined) || [];
  for (const ad of added) {
    if (!ad || !ad.name) continue;
    const sv = addedScale({ servings: num(ad.servings) || 1, amount: ad.amount ?? null, base_amount: ad.base_amount ?? null });
    // Display and arithmetic are separate questions. A food picked as "170 g"
    // arrives with its macros ALREADY scaled, so there is nothing left to
    // multiply -- but the plan row should still say 170 g. Only a base_amount
    // means "these macros describe a different size from the one on the plate".
    const measured = ad.amount != null && num(ad.amount) > 0;
    out.push({
      food: ad.name,
      amount: round1(measured ? num(ad.amount) : sv),
      unit: measured ? (ad.unit ?? null) : "serving",
      basis: null,
      protein: Math.round(num(ad.p) * sv),
      carbs: Math.round(num(ad.c) * sv),
      fats: Math.round(num(ad.f) * sv),
      is_unlimited: false,
    });
  }

  return out;
}
