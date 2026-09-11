/**
 * THE DRAFT'S ARITHMETIC, AND THE ONE RULE IT HAS TO KEEP.
 *
 * Every edit to an AI plan draft — an amount typed, a food added, an item or a
 * meal removed, a rename — goes through `recomputeDraft`, so what the banner
 * says the plan comes to is always the sum of the items printed underneath it.
 *
 * Dustin, 11 Sep 2026: *"Where it does show what the plan actually comes to on
 * that banner, that banner needs to pick up on any changes. So if I add
 * something, it needs to add it… when I remove it or if I revert the entire
 * plan, that banner needs to readjust and show what's on the actual plan."*
 *
 * It lives here rather than inside the screen because it is the thing that has
 * to be PROVEN. The add / remove / revert sequence he ran is a test in
 * tests/unit/draftEdit.test.ts, and a total that fails to come back down fails
 * the build. Inside a 4,500-line component it was arithmetic nobody could run.
 */

import { kcalOf } from "./dailyTotals";
import { planTargetDrift } from "../ai/nutrition-json";

export interface DraftItem {
  food: string;
  amount: number | null;
  unit: string | null;
  p: number;
  c: number;
  f: number;
  kcal: number;
  /** The AI returns them (da30c87) and they must survive as far as meal_items. */
  micros?: Record<string, number | null> | null;
  /**
   * A stable per-item key stamped when the draft loads. It is what lets an
   * amount scale from the item's ORIGINAL macros every time rather than
   * compounding — type 170 → 1 → 17 → 170 and you get back what you started
   * with. Removing an item cannot shift it, which an index would. The accept
   * mapping picks fields explicitly, so it never reaches the database.
   */
  _k?: string;
}

export interface DraftMeal {
  name: string;
  timing: string | null;
  items: DraftItem[];
}

export interface PlanDraft {
  targets: { kcal: number; p: number; c: number; f: number };
  reasoning: string | null;
  meals: DraftMeal[];
  totals: { kcal: number; p: number; c: number; f: number };
  /** Set when the meals do not add up to the targets above them. */
  targetsMet?: false;
  drift?: { kcal: number; p: number; c: number; f: number };
}

/**
 * Macros scale with the amount; everything else about the item is left alone.
 *
 * ── AN ITEM WITH NO AMOUNT CONTRIBUTES NOTHING ─────────────────────────────
 *
 * Clearing the amount box used to keep the macros exactly where they were, so
 * "6 oz chicken, 204 cal" became " oz chicken, 204 cal" and the draft total
 * never came down. That is the half of his report that reproduced:
 *
 *   Dustin, 11 Sep: *"it does adjust the calories on the plan that it does not
 *   remove when I remove it."*
 *
 * The three cases the old single guard ran together are now separate:
 *
 *   no baseline amount ("to taste", or a zero) → the macros ARE the item, so a
 *     typed amount cannot scale them and they stay put;
 *   a baseline, amount cleared → zero. There is no such thing as "some" of a
 *     food in a total;
 *   a baseline, an amount → scale.
 *
 * Zeroing mid-type is deliberate rather than a side effect: clear 6 to type 8
 * and the total dips for one keystroke, which is the honest reading of a box
 * that says nothing at that instant. It comes straight back, and it is the
 * only version where the printed total is never a number the plan is not.
 */
export function scaleItemTo(base: DraftItem, amount: number | null): DraftItem {
  const from = base.amount;
  if (from == null || from === 0) return { ...base, amount };
  if (amount == null) return zeroItem({ ...base, amount });
  const r = amount / from;
  return {
    ...base,
    amount,
    p: round1(base.p * r),
    c: round1(base.c * r),
    f: round1(base.f * r),
    kcal: Math.round((base.kcal || kcalOf(base.p, base.c, base.f)) * r),
    micros: scaleMicros(base.micros, r),
  };
}

function zeroItem(it: DraftItem): DraftItem {
  return { ...it, p: 0, c: 0, f: 0, kcal: 0, micros: scaleMicros(it.micros, 0) };
}

function scaleMicros(micros: DraftItem["micros"], r: number): DraftItem["micros"] {
  if (!micros) return micros;
  return Object.fromEntries(
    Object.entries(micros).map(([k, v]) => [k, v == null ? null : Math.round(v * r * 1000) / 1000]),
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** What the items actually come to. The only place a draft total is produced. */
export function sumDraft(meals: DraftMeal[]): { kcal: number; p: number; c: number; f: number } {
  const totals = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const m of meals) {
    for (const it of m.items) {
      totals.p += it.p || 0;
      totals.c += it.c || 0;
      totals.f += it.f || 0;
      totals.kcal += it.kcal || kcalOf(it.p || 0, it.c || 0, it.f || 0);
    }
  }
  return { kcal: Math.round(totals.kcal), p: round1(totals.p), c: round1(totals.c), f: round1(totals.f) };
}

/**
 * Totals and the target check, recomputed from the items after every edit.
 *
 * `planTargetDrift` is the SERVER's check, imported rather than reimplemented —
 * the same 3% on calories and 5g per macro the prompt demands. A second
 * tolerance invented here is how "within 3%" becomes 24%.
 */
export function recomputeDraft(d: PlanDraft): PlanDraft {
  const next: PlanDraft = { ...d, totals: sumDraft(d.meals) };
  const { ok, drift } = planTargetDrift(next as never);
  if (ok) {
    const { targetsMet: _t, drift: _d, ...clean } = next;
    return clean as PlanDraft;
  }
  return { ...next, targetsMet: false, drift };
}

/** Stamp a stable key on every item. Returns the draft and the baselines. */
export function keyDraft(plan: PlanDraft): { draft: PlanDraft; baseItems: Record<string, DraftItem> } {
  const baseItems: Record<string, DraftItem> = {};
  const keyed: PlanDraft = {
    ...plan,
    meals: plan.meals.map((m, mi) => ({
      ...m,
      items: m.items.map((it, ii) => {
        const _k = `${mi}:${ii}`;
        const withKey = { ...it, _k };
        baseItems[_k] = withKey;
        return withKey;
      }),
    })),
  };
  return { draft: recomputeDraft(keyed), baseItems };
}

/* ── the edits ──────────────────────────────────────────────────────────────
   Every one of them returns a recomputed draft. Dustin, 11 Sep: *"Make sure
   the logic, if I edit anything, the logic adjusts, auto adjusts everything."*
   Making that unconditional — even for a rename, which changes no macro —
   costs one no-op sum and means no future edit path can be the one that
   forgot, which is how the totals and the meals drift apart in the first
   place. */

export function patchItemAt(d: PlanDraft, mi: number, ii: number, next: DraftItem): PlanDraft {
  return recomputeDraft({
    ...d,
    meals: d.meals.map((m, i) => (i !== mi ? m : { ...m, items: m.items.map((it, j) => (j === ii ? next : it)) })),
  });
}

export function removeItemAt(d: PlanDraft, mi: number, ii: number): PlanDraft {
  return recomputeDraft({
    ...d,
    meals: d.meals.map((m, i) => (i !== mi ? m : { ...m, items: m.items.filter((_, j) => j !== ii) })),
  });
}

export function removeMealAt(d: PlanDraft, mi: number): PlanDraft {
  return recomputeDraft({ ...d, meals: d.meals.filter((_, i) => i !== mi) });
}

export function addItemTo(d: PlanDraft, mi: number, item: DraftItem): PlanDraft {
  return recomputeDraft({
    ...d,
    meals: d.meals.map((m, i) => (i === mi ? { ...m, items: [...m.items, item] } : m)),
  });
}

export function patchMealAt(d: PlanDraft, mi: number, field: "name" | "timing", value: string): PlanDraft {
  return recomputeDraft({ ...d, meals: d.meals.map((m, i) => (i === mi ? { ...m, [field]: value } : m)) });
}

export function setDraftTargets(d: PlanDraft, targets: PlanDraft["targets"]): PlanDraft {
  return recomputeDraft({ ...d, targets });
}

/**
 * IS THIS NUMBER CLOSE ENOUGH TO ITS TARGET?
 *
 * The same tolerance `planTargetDrift` applies — 3% or 30 kcal on calories,
 * whichever is larger, and 5g on each macro. Exported so the target boxes can
 * colour one field at a time without a second, looser idea of "close".
 */
export function onTarget(field: "kcal" | "p" | "c" | "f", actual: number, target: number): boolean {
  const tol = field === "kcal" ? Math.max(30, target * 0.03) : 5;
  return Math.abs(actual - target) <= tol;
}
