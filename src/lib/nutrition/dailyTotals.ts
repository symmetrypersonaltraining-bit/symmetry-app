// ============================================================================
// Nutrition v3 — canonical daily-totals calculator.
//
// ONE function (computeDayTotals) computes a day's consumed macros from
// meal_adherence_logs + the live plan. EVERYTHING (macro bar, charts,
// averages strip, coach card, AI) must use this so the numbers always agree.
//
// meal_adherence_logs is the single write target. v3 persistence protocol
// (all additive — old rows keep working exactly as before):
//
//   • Plan meal logged:        adherence Full/3/4/1/2/1/4/Skipped, meal_id set,
//                              item_overrides = { [itemId]: {amount}, __added: [...] }
//   • Off-plan on a slot:      adherence "Off-plan", est_* fields, off_plan_details,
//                              photo_url, off_plan_macros jsonb.
//   • Day-custom meal          adherence "Off-plan", est_* = items total,
//     (swap/insert/copy/       item_overrides.__custom = CustomMeta (itemized),
//      composer/My Meals):     off_plan_details = meal name. Old UIs & the trainer
//                              rollup read est_* so totals agree everywhere.
//   • Unlogged placeholder:    adherence "Skipped" + __custom.unlogged=true (custom)
//                              or item_overrides.__unlogged=true (plan meal that only
//                              carries edits/ordering) → contributes 0 to totals.
//   • Deleted-for-today meal:  adherence "Skipped" + item_overrides.__removed=true.
//   • Display order:           item_overrides.__ord = index (drag reorder / move).
//   • Extras (quick-add):      meal_position 6/7 (NEVER 101), adherence "Off-plan",
//                              est_* fields (+ item_overrides.__custom for itemization).
//   • Inserted day meals:      meal_position 21–40 band, __custom set.
// ============================================================================

export interface PlanItem {
  id: string;
  food: string;
  amount: number | null;
  unit: string | null;
  is_unlimited: boolean;
  basis?: string | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  position: number;
}

export interface PlanMeal {
  id: string;
  name: string;
  timing: string | null;
  position: number;
  swaps?: string | null;
  meal_items: PlanItem[];
}

export interface CustomItem {
  n: string;            // food name
  a?: string | null;    // amount label ("6 oz cooked")
  p: number;
  c: number;
  f: number;
  k?: number;           // kcal (derived if missing)
  free?: boolean;       // unlimited / free add
  est?: boolean;        // AI-estimated
  db?: boolean;         // from food_catalog (verified-ish)
  food_id?: string | null;
  fac?: number;         // per-item multiplier (steppers)
}

export interface CustomMeta {
  name: string;
  time?: string | null;
  items: CustomItem[];
  unlogged?: boolean;
  kind?: "swap" | "insert" | "copy" | "slot" | "extra";
  sourceMealId?: string | null;
}

export interface AddedFood {
  food_id?: string | null;
  name: string;
  servings: number;
  p: number;
  c: number;
  f: number;
}

export type ItemOverrides = {
  [itemId: string]: { amount: number } | unknown;
} & {
  __added?: AddedFood[];
  __custom?: CustomMeta;
  __removed?: boolean;
  __unlogged?: boolean;
  __ord?: number;
};

export interface LogRow {
  id?: string;
  meal_id: string | null;
  meal_position: number;
  adherence: string | null;
  off_plan_details?: string | null;
  est_kcal?: number | null;
  est_protein?: number | null;
  est_carbs?: number | null;
  est_fats?: number | null;
  macros_pending?: boolean | null;
  item_overrides?: ItemOverrides | null;
  photo_url?: string | null;
  notes?: string | null;
  log_date?: string;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
}

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fats: 0 };

// Adherence → proration. Keep aligned with the DB CHECK constraint
// (Full / 3/4 / 1/2 / 1/4 / Partial / Off-plan / Skipped).
export const ADH_PCT: Record<string, number | null> = {
  "Full": 1,
  "3/4": 0.75,
  "1/2": 0.5,
  "1/4": 0.25,
  "Partial": 0.5,
  "Skipped": 0,
  "Off-plan": null, // uses est_* instead
};

export function adherencePct(key: string | null | undefined): number | null {
  if (!key) return null;
  const v = ADH_PCT[key];
  return v === undefined ? null : v;
}

export function kcalOf(p: number, c: number, f: number): number {
  return p * 4 + c * 4 + f * 9;
}

export const EXTRA_POSITIONS = [6, 7]; // extras band (never 101)
export const INSERT_POSITION_MIN = 21; // inserted day-custom meals band
export const INSERT_POSITION_MAX = 40;

export function isExtraLog(log: LogRow, planPositions: Set<number>): boolean {
  // Quick-add extras: position 6/7 with no plan meal there, or legacy ≥101 rows.
  if (log.meal_position >= 101) return true;
  return (
    EXTRA_POSITIONS.includes(log.meal_position) &&
    !log.meal_id &&
    !planPositions.has(log.meal_position) &&
    !log.item_overrides?.__custom
  );
}

// Macros for a plan meal with optional per-day item overrides + added foods.
export function planMealMacros(meal: PlanMeal, overrides?: ItemOverrides | null): Macros {
  let p = 0, c = 0, f = 0;
  const ov = overrides || null;
  const hasOv = !!(ov && Object.keys(ov).some((k) => !k.startsWith("__")));
  for (const item of meal.meal_items || []) {
    let scale = 1;
    if (hasOv) {
      const o = ov![item.id] as { amount?: number } | undefined;
      const oAmt = o?.amount;
      if (oAmt != null && item.amount) scale = oAmt / item.amount;
      else if (oAmt === 0) scale = 0;
    }
    p += (Number(item.protein) || 0) * scale;
    c += (Number(item.carbs) || 0) * scale;
    f += (Number(item.fats) || 0) * scale;
  }
  for (const ad of ov?.__added || []) {
    const sv = ad.servings || 1;
    p += (Number(ad.p) || 0) * sv;
    c += (Number(ad.c) || 0) * sv;
    f += (Number(ad.f) || 0) * sv;
  }
  return { kcal: kcalOf(p, c, f), protein: p, carbs: c, fats: f };
}

// Macros for a day-custom (itemized) meal.
export function customMealMacros(meta: CustomMeta): Macros {
  let p = 0, c = 0, f = 0;
  for (const it of meta.items || []) {
    const fac = it.fac ?? 1;
    p += (Number(it.p) || 0) * fac;
    c += (Number(it.c) || 0) * fac;
    f += (Number(it.f) || 0) * fac;
  }
  return { kcal: kcalOf(p, c, f), protein: p, carbs: c, fats: f };
}

function estMacros(log: LogRow): Macros {
  const p = Number(log.est_protein) || 0;
  const c = Number(log.est_carbs) || 0;
  const f = Number(log.est_fats) || 0;
  const k = log.est_kcal != null ? Number(log.est_kcal) || 0 : kcalOf(p, c, f);
  return { kcal: k, protein: p, carbs: c, fats: f };
}

// What a single log row contributed to the day (0 for placeholders/removed/pending).
export function logConsumedMacros(
  log: LogRow,
  mealById: Map<string, PlanMeal>,
  mealByPos: Map<number, PlanMeal>
): Macros {
  const ov = log.item_overrides || null;
  if (ov?.__removed) return ZERO;
  if (ov?.__unlogged) return ZERO;
  if (ov?.__custom?.unlogged) return ZERO;
  if (log.macros_pending) return ZERO;

  if (log.adherence === "Off-plan" || (!log.adherence && (log.est_kcal != null || log.est_protein != null))) {
    // Off-plan / custom / extra: est_* is the source of truth; fall back to
    // itemized __custom if est_* was never written.
    if (log.est_kcal != null || log.est_protein != null || log.est_carbs != null || log.est_fats != null) {
      return estMacros(log);
    }
    if (ov?.__custom) return customMealMacros(ov.__custom);
    return ZERO;
  }

  const pct = adherencePct(log.adherence);
  if (pct === null) {
    // Unknown adherence value written by something else — count est_* if present, else 0.
    return log.est_kcal != null ? estMacros(log) : ZERO;
  }
  if (pct === 0) return ZERO;

  // Day-custom meal logged with a plan-style adherence (prorate its items).
  if (ov?.__custom) {
    const m = customMealMacros(ov.__custom);
    return { kcal: m.kcal * pct, protein: m.protein * pct, carbs: m.carbs * pct, fats: m.fats * pct };
  }

  // Plan meal: resolve by meal_id first (multi-option slots), fall back to position.
  const meal =
    (log.meal_id && mealById.get(log.meal_id)) ||
    (log.meal_position <= 100 ? mealByPos.get(log.meal_position) : undefined);
  if (!meal) {
    // Plan re-versioned since: est_* fallback keeps history contributing.
    return log.est_kcal != null ? estMacros(log) : ZERO;
  }
  const m = planMealMacros(meal, ov);
  return { kcal: m.kcal * pct, protein: m.protein * pct, carbs: m.carbs * pct, fats: m.fats * pct };
}

export interface DayTotals extends Macros {
  loggedCount: number;   // rows that represent an actual log (not placeholders)
  pendingCount: number;  // rows awaiting AI/trainer macros
}

// THE canonical function. logs = all meal_adherence_logs rows for one client+date;
// planMeals = the live plan's meals (may be empty for open-plan clients).
export function computeDayTotals(logs: LogRow[], planMeals: PlanMeal[]): DayTotals {
  const mealById = new Map<string, PlanMeal>();
  const mealByPos = new Map<number, PlanMeal>();
  for (const m of planMeals || []) {
    mealById.set(m.id, m);
    // First option at a position wins for the position fallback (multi-option slots).
    if (!mealByPos.has(m.position)) mealByPos.set(m.position, m);
  }
  let kcal = 0, protein = 0, carbs = 0, fats = 0;
  let loggedCount = 0, pendingCount = 0;
  for (const log of logs || []) {
    const ov = log.item_overrides || null;
    if (ov?.__removed) continue;
    const placeholder = !!(ov?.__unlogged || ov?.__custom?.unlogged);
    if (!placeholder) loggedCount++;
    if (log.macros_pending && !placeholder) pendingCount++;
    const m = logConsumedMacros(log, mealById, mealByPos);
    kcal += m.kcal; protein += m.protein; carbs += m.carbs; fats += m.fats;
  }
  return { kcal, protein, carbs, fats, loggedCount, pendingCount };
}

// Adherence score for a day: average proration across PLAN meal slots
// (extras/inserted meals don't dilute it). Returns null when nothing is logged.
export function dayAdherencePct(logs: LogRow[], planMeals: PlanMeal[]): number | null {
  const planPositions = new Set((planMeals || []).map((m) => m.position));
  if (!planPositions.size) return null;
  let sum = 0, n = 0;
  for (const pos of planPositions) {
    const log = (logs || []).find(
      (l) => l.meal_position === pos && !l.item_overrides?.__removed && !l.item_overrides?.__unlogged && !l.item_overrides?.__custom?.unlogged
    );
    if (!log) continue;
    n++;
    if (log.adherence === "Off-plan") sum += 0.75; // ate, but off plan
    else sum += adherencePct(log.adherence) ?? 0;
  }
  if (n === 0) return null;
  return (sum / planPositions.size) * 100;
}
