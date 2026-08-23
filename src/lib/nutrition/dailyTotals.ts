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

// RELATIVE, not "@/lib/...", and deliberately so: scripts/test-nutrition-ai.cjs
// compiles this module standalone to CommonJS, and tsc's `paths` mapping is
// compile-time only — an "@/" specifier survives into the emitted require()
// and cannot resolve. Same reason nutrition-json.ts imports this file
// relatively. This cost a live outage once; do not "tidy" it.
import {
  readNutrients, addNutrients, scaleNutrients, type NutrientMap,
} from "./nutrients";

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
  // Added 2026-08-11. Plan meals used to carry macros and nothing else, which
  // is why a day built from the plan could not state its own sodium. The AI
  // plan builder now writes a full nutrient panel here.
  micros?: unknown;
}

// meals.rotation jsonb — structured rotation/alternation metadata (additive,
// null for non-rotating meals). Two shapes (see BUILD_NOTES):
//   • { type: "day_parity", even: {food, amount, unit}, odd: {food, amount, unit} }
//     — the meal's alternating item resolves to `even` on even day-of-month
//     dates and `odd` on odd dates. The grocery/prep engine COMPUTES with this
//     (exact per-item amounts per parity; string parsing becomes fallback).
//   • { type: "weekly", note: "Week 2 of 3" } — informational only; weekly
//     rotation is handled by plan versions + the auto-flip job.
export interface RotationEntry {
  food: string;
  amount: number | null;
  unit: string | null;
}
export interface MealRotation {
  type: "day_parity" | "weekly";
  even?: RotationEntry;
  odd?: RotationEntry;
  note?: string;
}

export interface PlanMeal {
  id: string;
  name: string;
  timing: string | null;
  position: number;
  swaps?: string | null;
  rotation?: MealRotation | null;
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
  // Nutrients beyond the macros. Short keys to match the existing style — these
  // ride inside item_overrides.__custom jsonb on every log row, so the names are
  // paid for on every write. Units follow food_catalog exactly: sodium in
  // MILLIGRAMS, everything else in GRAMS. Undefined means unknown, which is a
  // different fact from zero and has to survive the round trip.
  fi?: number | null;   // fiber, g
  su?: number | null;   // sugar, g
  so?: number | null;   // sodium, mg
  sf?: number | null;   // saturated fat, g
  // The other 29. Full registry keys, not short ones — this bag is written by
  // the AI and read by the registry, and inventing a second naming scheme for
  // it would just be a mapping table nobody maintains. The legacy four above
  // stay where they are so existing rows keep working.
  mi?: Record<string, number | null> | null;
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
  // Nutrients. Sodium in mg, the rest in g. NULL = unknown, never zero.
  est_fiber?: number | null;
  est_sugar?: number | null;
  est_sodium?: number | null;
  est_sat_fat?: number | null;
  // The full panel, added by migration `add_micronutrient_storage`. The four
  // est_* columns above remain authoritative for their own nutrients; this
  // carries the other 29. readNutrients() merges the two and is the only thing
  // that should know the split.
  est_micros?: unknown;
  macros_pending?: boolean | null;
  item_overrides?: ItemOverrides | null;
  photo_url?: string | null;
  notes?: string | null;
  log_date?: string;
  trainer_macro_override?: { kcal?: number | null; protein?: number | null; carbs?: number | null; fats?: number | null } | null;
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
/**
 * THE DAY'S PRESCRIBED TARGET — the sum of the plan governing that date.
 *
 * Dustin, 23 Aug: "whatever I set for the meal plan, the macros on the day
 * chart in the food logger read what the actual plan is for that day... If I
 * change my meal plan each day, it needs to pick up what I'm actually at."
 *
 * The target used to come from `macro_targets` — a separate hand-kept row —
 * which meant the bar at the top of the food logger and the food listed
 * underneath it were two independent numbers that had to be kept in step by
 * hand. Change a week's plan and the bar still measured against the old row;
 * page forward to next week and the bar still showed today's.
 *
 * Now it is derived. The plan IS the target, so they cannot disagree, and a
 * plan scheduled for a future Monday brings its own numbers with it.
 *
 * NO OVERRIDES are applied, deliberately: this is the PRESCRIPTION. What the
 * client actually ate — adjusted portions, added foods, off-plan meals — is
 * computeDayTotals' job, and it is the other side of the same bar.
 *
 * One meal per position (the first option at that slot), matching
 * computeDayTotals' own fallback, so a rotation plan's target and its totals
 * count the same meal.
 *
 * Returns null when there is no plan to read — an open-plan client, or a date
 * before any plan started. The caller falls back to macro_targets there, which
 * is the only thing those clients have.
 */
export function planDayTarget(planMeals: PlanMeal[] | null | undefined): Macros | null {
  const meals = planMeals || [];
  if (!meals.length) return null;
  const byPos = new Map<number, PlanMeal>();
  for (const m of [...meals].sort((a, b) => a.position - b.position)) {
    if (!byPos.has(m.position)) byPos.set(m.position, m);
  }
  let kcal = 0, protein = 0, carbs = 0, fats = 0;
  for (const m of byPos.values()) {
    const mm = planMealMacros(m);
    kcal += mm.kcal; protein += mm.protein; carbs += mm.carbs; fats += mm.fats;
  }
  // A plan whose items carry no macros at all is not a target of zero — it is
  // no target. Zero would draw a full red bar over the first bite of food.
  if (kcal === 0 && protein === 0 && carbs === 0 && fats === 0) return null;
  return { kcal, protein, carbs, fats };
}

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

// ─── Nutrients beyond the macros ─────────────────────────────────────────────
//
// food_catalog has carried fiber, sugar, sodium and saturated fat since the
// Open Food Facts / USDA import, but nothing ever displayed them and
// meal_adherence_logs did not persist them, so they were discarded at log time.
//
// The hard part is not the arithmetic, it is honesty about coverage. Reporting
// an unknown as 0 mg would be a lie the UI could not detect, so every accessor
// here returns null for unknown and the day total carries a count of how many
// logged meals actually contributed.
//
// UPDATED 2026-08-11. The line that used to stand here — "a plan meal has NO
// nutrient source at all" — is no longer true. `meal_items.micros` carries the
// full 33-nutrient panel from the AI plan builder, so a day assembled from plan
// meals can now report its own sodium where the builder knew it. See
// planMealNutrients below. Items predating the panel still have no micros, and
// those stay null rather than becoming zero.

export interface Nutrients {
  fiber: number | null;   // g
  sugar: number | null;   // g
  sodium: number | null;  // mg
  satFat: number | null;  // g
}

export const NUTRIENTS_UNKNOWN: Nutrients = { fiber: null, sugar: null, sodium: null, satFat: null };

export function hasAnyNutrient(n: Nutrients | null | undefined): boolean {
  if (!n) return false;
  return n.fiber != null || n.sugar != null || n.sodium != null || n.satFat != null;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function estNutrients(log: LogRow): Nutrients {
  return {
    fiber: numOrNull(log.est_fiber),
    sugar: numOrNull(log.est_sugar),
    sodium: numOrNull(log.est_sodium),
    satFat: numOrNull(log.est_sat_fat),
  };
}

// The four legacy nutrients for a custom (itemised) meal.
//
// A PROJECTION of customMealNutrientMap, not a second calculation — the same
// relationship planMealNutrients has to planMealNutrientMap, for the same
// reason. This used to read `it.fi/su/so/sf` directly and ignore `it.mi`, which
// meant an item whose fibre arrived in the full bag rather than the four short
// keys reported no fibre HERE while the full panel reported it correctly. That
// is not cosmetic: NutritionV3Client.upsertLog derives the est_fiber /
// est_sugar / est_sodium / est_sat_fat columns from this function, so the
// stored row disagreed with the meal it was stored from.
//
// Every AI-parsed item is exactly that case — the parse route returns a
// `micros` bag, never the short keys.
export function customMealNutrients(meta: CustomMeta): Nutrients {
  const m = customMealNutrientMap(meta);
  const pick = (k: string) => (m[k] == null ? null : Number(m[k]));
  return { fiber: pick("fiber"), sugar: pick("sugar"), sodium: pick("sodium"), satFat: pick("sat_fat") };
}

// The full nutrient panel for a plan meal, honouring per-day item overrides and
// added foods exactly as planMealMacros does. Returns a sparse NutrientMap:
// a key is present only when at least one item knew that nutrient.
export function planMealNutrientMap(meal: PlanMeal, overrides?: ItemOverrides | null): NutrientMap {
  const ov = overrides || null;
  const hasOv = !!(ov && Object.keys(ov).some((k) => !k.startsWith("__")));
  let out: NutrientMap = {};
  for (const item of meal.meal_items || []) {
    let scale = 1;
    if (hasOv) {
      const o = ov![item.id] as { amount?: number } | undefined;
      const oAmt = o?.amount;
      if (oAmt != null && item.amount) scale = oAmt / item.amount;
      else if (oAmt === 0) scale = 0;
    }
    const n = readNutrients(item.micros);
    if (Object.keys(n).length === 0) continue;
    out = addNutrients(out, scaleNutrients(n, scale));
  }
  // __added foods carry macros only (the quick-add sheet never collected
  // micros), so they contribute nothing here rather than a false zero.
  return out;
}

// The four legacy nutrients for a plan meal, for the existing day panel.
// Derived from the same map so the panel and the full 33-nutrient view can
// never disagree.
export function planMealNutrients(meal: PlanMeal, overrides?: ItemOverrides | null): Nutrients {
  const m = planMealNutrientMap(meal, overrides);
  const pick = (k: string) => (m[k] == null ? null : Number(m[k]));
  return { fiber: pick("fiber"), sugar: pick("sugar"), sodium: pick("sodium"), satFat: pick("sat_fat") };
}

// ─── The full 33-nutrient panel ──────────────────────────────────────────────
//
// Everything above deals in the legacy four because the day panel and the
// charts were built around them. These functions are the same logic over the
// whole registry, and the four are a projection of this, never a second
// calculation. If the two ever disagree it is a bug in the projection.

/**
 * Exported so the composer can show the panel it is ABOUT to log, using the
 * identical calculation the day total will use on it a second later. A sheet
 * that adds up its own nutrients is how a screen and a total end up disagreeing
 * about the same meal.
 */
export function customMealNutrientMap(meta: CustomMeta): NutrientMap {
  let out: NutrientMap = {};
  for (const it of meta.items || []) {
    const fac = it.fac ?? 1;
    // The legacy short keys and the full bag merge here; short keys win,
    // because that is where the food database writes and it is the more
    // trustworthy of the two.
    const n = readNutrients(it.mi, {
      fiber: it.fi, sugar: it.su, sodium: it.so, sat_fat: it.sf,
    });
    if (Object.keys(n).length === 0) continue;
    out = addNutrients(out, scaleNutrients(n, fac));
  }
  return out;
}

/** The full panel a single log row contributed. Mirrors logConsumedNutrients'
 *  precedence exactly, so the two can never credit different rows. */
export function logConsumedNutrientMap(
  log: LogRow,
  mealById?: Map<string, PlanMeal>,
  mealByPos?: Map<number, PlanMeal>
): NutrientMap {
  const ov = log.item_overrides || null;
  if (ov?.__removed || ov?.__unlogged || ov?.__custom?.unlogged) return {};
  if (log.macros_pending) return {};

  const fromCols = readNutrients(log.est_micros, {
    fiber: log.est_fiber, sugar: log.est_sugar,
    sodium: log.est_sodium, sat_fat: log.est_sat_fat,
  });

  // A custom meal's ITEMS know up to 33 nutrients; est_fiber/sugar/sodium/
  // sat_fat are only ever four columns DERIVED from those same items. So the
  // columns must not shadow the items — that turned a meal that knew thirty-
  // three nutrients into a four-nutrient meal the moment it was logged, and
  // did it silently, because four real numbers look like a working panel.
  //
  // Merged rather than picked, with the columns winning per key: that is the
  // precedence readNutrients already uses for flat-vs-jsonb, and it keeps a
  // hand-corrected column authoritative over the item it came from.
  const fromCustom = ov?.__custom ? customMealNutrientMap(ov.__custom) : {};
  const merged = Object.keys(fromCustom).length > 0 ? { ...fromCustom, ...fromCols } : fromCols;

  if (Object.keys(merged).length > 0) {
    if (log.adherence === "Off-plan" || !log.adherence) return merged;
    const pct = adherencePct(log.adherence);
    return pct == null ? merged : scaleNutrients(merged, pct);
  }

  // A custom meal that knows nothing contributes nothing. It must NOT fall
  // through to the plan-meal lookup below — the meal in that slot is not what
  // was eaten, and crediting its nutrients would invent a panel out of nowhere.
  if (ov?.__custom) return {};

  const meal =
    (log.meal_id && mealById?.get(log.meal_id)) ||
    (log.meal_position <= 100 ? mealByPos?.get(log.meal_position) : undefined);
  if (!meal) return {};
  const n = planMealNutrientMap(meal, ov);
  if (Object.keys(n).length === 0) return {};
  const pct = adherencePct(log.adherence);
  return pct == null ? n : scaleNutrients(n, pct);
}

// What a single log row contributed in nutrients. Mirrors logConsumedMacros'
// precedence so the two can never disagree about which row counted.
//
// The plan-meal maps are optional so existing callers that only have a log row
// keep working; without them a plan meal resolves to unknown, as it always did.
export function logConsumedNutrients(
  log: LogRow,
  mealById?: Map<string, PlanMeal>,
  mealByPos?: Map<number, PlanMeal>
): Nutrients {
  // A PROJECTION of the full map, not a second calculation. The two used to be
  // written out separately, which is exactly how a panel and a chart end up
  // disagreeing about the same day.
  const m = logConsumedNutrientMap(log, mealById, mealByPos);
  const pick = (k: string) => (m[k] == null ? null : Number(m[k]));
  return { fiber: pick("fiber"), sugar: pick("sugar"), sodium: pick("sodium"), satFat: pick("sat_fat") };
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

  // Trainer's manual correction always wins (matches DailyMacrosRing).
  const tmo = log.trainer_macro_override;
  if (tmo && (tmo.protein != null || tmo.carbs != null || tmo.fats != null)) {
    const p = Number(tmo.protein) || 0, c = Number(tmo.carbs) || 0, f = Number(tmo.fats) || 0;
    return { kcal: tmo.kcal != null ? Number(tmo.kcal) || 0 : kcalOf(p, c, f), protein: p, carbs: c, fats: f };
  }

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
  nutrients: Nutrients;  // fiber/sugar/satFat in g, sodium in mg; null = unknown
  // How many of the day's logged meals actually carried nutrient data. The UI
  // MUST show this next to the numbers: "820 mg sodium" from 2 of 5 meals is a
  // very different statement from 820 mg for the day, and without the
  // denominator a partial total reads as a complete one.
  nutrientKnownCount: number;
  // The whole registry. `nutrients` above is a projection of four of these,
  // kept because the macro card and the charts were built on it. A key is
  // present only when at least one meal knew it — absent still means UNKNOWN.
  nutrientMap: NutrientMap;
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
  let loggedCount = 0, pendingCount = 0, nutrientKnownCount = 0;
  let nutrientMap: NutrientMap = {};
  for (const log of logs || []) {
    const ov = log.item_overrides || null;
    if (ov?.__removed) continue;
    const placeholder = !!(ov?.__unlogged || ov?.__custom?.unlogged);
    if (!placeholder) loggedCount++;
    if (log.macros_pending && !placeholder) pendingCount++;
    const m = logConsumedMacros(log, mealById, mealByPos);
    kcal += m.kcal; protein += m.protein; carbs += m.carbs; fats += m.fats;
    // Accumulate the WHOLE registry once; the legacy four fall out of it below.
    // Counting a meal as "known" now means it knew ANY nutrient, not just one
    // of the original four — a meal that only knows its iron still counted.
    const nm = logConsumedNutrientMap(log, mealById, mealByPos);
    if (Object.keys(nm).length > 0) { nutrientMap = addNutrients(nutrientMap, nm); nutrientKnownCount++; }
  }
  const pick = (k: string) => (nutrientMap[k] == null ? null : Number(nutrientMap[k]));
  const nutrients: Nutrients = {
    fiber: pick("fiber"), sugar: pick("sugar"), sodium: pick("sodium"), satFat: pick("sat_fat"),
  };
  return { kcal, protein, carbs, fats, loggedCount, pendingCount, nutrients, nutrientKnownCount, nutrientMap };
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
