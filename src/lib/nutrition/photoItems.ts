/**
 * THE ITEM LIST A PHOTO ANALYSIS COMES BACK WITH, AND WHEN TO TRUST IT.
 *
 * Dustin, 12 Sep 2026, having photographed a cheesecake and eaten four slices:
 * *"4 slices it says 1 slice. also I can't edit it, edit screen shows
 * originals."*
 *
 * Both halves of that were `/api/analyze-meal-photo` returning TOTALS ONLY:
 *
 *   - with no item list the estimate card has no per-item stepper, so the
 *     model's assumption of one slice was buried in a paragraph of prose and
 *     was final. There was no way to say "four of those";
 *   - and the client writes `item_overrides.__custom.items` from that list,
 *     which is what makes a saved row kind "custom". With none, the row stayed
 *     kind "plan" and Edit opened the PLAN's editor seeded from the meal
 *     plan's food — exactly Megan Gautreaux's 17 Aug report, *"when I click on
 *     edit it pulls up the list of original meal plan, not the meal I logged
 *     with the picture"*, which was fixed for the TYPED path (parseFoodText
 *     already returned items) and never for this one.
 *
 * ── THE TOTALS STAY AUTHORITATIVE ──────────────────────────────────────────
 *
 * The four top-level numbers are what is anchored to a chain's official
 * nutrition data. The items are a breakdown OF them, not a second opinion, so
 * they are accepted only when they agree: sum the items, and if they land more
 * than 10% (or 60 kcal, whichever is larger) away from the reported calories,
 * drop the list. A stepper that jumps the day's total the moment it is touched
 * is worse than no stepper, because the number it jumps to looks just as
 * official as the one it replaced.
 */

import { kcalOf } from "./dailyTotals";

export interface PhotoItem {
  n: string;
  /** The portion in words — "1 slice", "6 wings". Null when it named none. */
  a: string | null;
  p: number;
  c: number;
  f: number;
  k: number;
  est: true;
}

/** Caps: a plate has not got more than twenty distinct foods on it. */
const MAX_ITEMS = 20;
/** Below this the percentage is too tight to be meaningful. */
const MIN_KCAL_TOLERANCE = 60;
const KCAL_TOLERANCE = 0.1;

function num(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? Math.round(x * 10) / 10 : 0;
}

/** One raw entry from the model to a shape the log can store, or null. */
export function toPhotoItem(raw: unknown): PhotoItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const n = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
  if (!n) return null;
  const p = num(o.protein_g), c = num(o.carbs_g), f = num(o.fat_g ?? o.fats_g);
  return {
    n,
    a: typeof o.amount === "string" && o.amount.trim() ? o.amount.trim().slice(0, 60) : null,
    p, c, f,
    k: Math.round(num(o.calories) || kcalOf(p, c, f)),
    est: true,
  };
}

/**
 * The item list to send on, given what the model returned and the calorie
 * total already accepted from it. Empty means "could not be broken down",
 * which the estimate card renders exactly as it always did.
 */
export function photoItemsFor(raw: unknown, kcal: number): PhotoItem[] {
  const list = (Array.isArray(raw) ? raw : [])
    .map(toPhotoItem)
    .filter((x): x is PhotoItem => x !== null)
    .slice(0, MAX_ITEMS);
  if (!list.length || kcal <= 0) return [];
  const sum = list.reduce((a, it) => a + it.k, 0);
  const tolerance = Math.max(MIN_KCAL_TOLERANCE, kcal * KCAL_TOLERANCE);
  return Math.abs(sum - kcal) <= tolerance ? list : [];
}
