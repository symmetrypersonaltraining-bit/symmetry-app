// The canonical nutrient registry — what "full nutrients" means in this app.
//
// Dustin asked for full micronutrients, not just fibre/sugar/sodium, and for
// the AI paths to populate them properly (app_feedback 2c2df05f).
//
// WHY A REGISTRY AND NOT 31 COLUMNS
// ---------------------------------
// A wide table would mean 31 numeric columns duplicated across meal_items,
// foods, food_catalog, meal_adherence_logs, recipes and recipe_ingredients —
// ~180 columns, a migration per nutrient anyone ever wants to add, and six
// more places for the same fact to drift. This codebase's recurring failure is
// exactly that: the same number computed or stored twice and diverging. So
// nutrients live in a single `micros` jsonb per row, keyed by the keys below,
// and this file is the one place that says what a key means.
//
// STORAGE RULE — read this before writing any nutrient code
// ---------------------------------------------------------
// Four nutrients already had real columns before this registry existed:
// fiber, sugar, sodium and sat_fat, on `food_catalog` (flat) and
// `meal_adherence_logs` (as est_fiber/est_sugar/est_sodium/est_sat_fat).
// Those columns are STILL AUTHORITATIVE on those two tables and are still
// written by the existing code paths, unchanged.
//
// There is NO dual write. A nutrient is stored in exactly one place per row:
//   - on food_catalog / meal_adherence_logs, the four legacy keys live in
//     their flat columns and everything else lives in `micros`;
//   - everywhere else, all nutrients live in `micros`.
// `readNutrients()` below is the only thing that needs to know this. Use it,
// and never read `micros` directly.
//
// UNITS ARE PART OF THE KEY'S MEANING. Sodium is mg, fibre is g, vitamin D is
// mcg. A number without its unit is a bug waiting to be a wrong macro target.
//
// NULL MEANS UNKNOWN, NEVER ZERO. This is the rule the meal-photo prompt
// already states to the model ("a null is far more useful than a guess") and
// it holds throughout: a food we have no vitamin K figure for must not report
// 0 mcg, or every daily total silently understates.

export type NutrientUnit = "g" | "mg" | "mcg";

export type NutrientGroup = "carbohydrate" | "fat" | "mineral" | "vitamin" | "other";

export interface NutrientDef {
  /** Stable storage key. Never rename one of these — it is on-disk data. */
  key: string;
  label: string;
  unit: NutrientUnit;
  group: NutrientGroup;
  /**
   * True for the four that predate this registry and have real columns on
   * food_catalog / meal_adherence_logs. See the storage rule above.
   */
  legacyColumn?: boolean;
  /**
   * Adult daily reference value, in `unit`. Used only to render "% of daily"
   * hints. Deliberately a single general figure, NOT medical guidance and not
   * personalised — Dustin sets real targets per client in macro_targets.
   */
  dailyReference?: number;
}

export const NUTRIENTS: readonly NutrientDef[] = [
  // ── Carbohydrate breakdown ────────────────────────────────────────────────
  { key: "fiber",            label: "Fiber",             unit: "g",   group: "carbohydrate", legacyColumn: true, dailyReference: 28 },
  { key: "sugar",            label: "Total sugars",      unit: "g",   group: "carbohydrate", legacyColumn: true },
  { key: "added_sugar",      label: "Added sugars",      unit: "g",   group: "carbohydrate", dailyReference: 50 },

  // ── Fat breakdown ─────────────────────────────────────────────────────────
  { key: "sat_fat",          label: "Saturated fat",     unit: "g",   group: "fat", legacyColumn: true, dailyReference: 20 },
  { key: "mono_fat",         label: "Monounsaturated",   unit: "g",   group: "fat" },
  { key: "poly_fat",         label: "Polyunsaturated",   unit: "g",   group: "fat" },
  { key: "trans_fat",        label: "Trans fat",         unit: "g",   group: "fat" },
  { key: "omega_3",          label: "Omega-3",           unit: "g",   group: "fat" },
  { key: "cholesterol",      label: "Cholesterol",       unit: "mg",  group: "fat", dailyReference: 300 },

  // ── Minerals ──────────────────────────────────────────────────────────────
  { key: "sodium",           label: "Sodium",            unit: "mg",  group: "mineral", legacyColumn: true, dailyReference: 2300 },
  { key: "potassium",        label: "Potassium",         unit: "mg",  group: "mineral", dailyReference: 4700 },
  { key: "calcium",          label: "Calcium",           unit: "mg",  group: "mineral", dailyReference: 1300 },
  { key: "iron",             label: "Iron",              unit: "mg",  group: "mineral", dailyReference: 18 },
  { key: "magnesium",        label: "Magnesium",         unit: "mg",  group: "mineral", dailyReference: 420 },
  { key: "zinc",             label: "Zinc",              unit: "mg",  group: "mineral", dailyReference: 11 },
  { key: "phosphorus",       label: "Phosphorus",        unit: "mg",  group: "mineral", dailyReference: 1250 },
  { key: "copper",           label: "Copper",            unit: "mg",  group: "mineral", dailyReference: 0.9 },
  { key: "manganese",        label: "Manganese",         unit: "mg",  group: "mineral", dailyReference: 2.3 },
  { key: "selenium",         label: "Selenium",          unit: "mcg", group: "mineral", dailyReference: 55 },

  // ── Vitamins ──────────────────────────────────────────────────────────────
  { key: "vitamin_a",        label: "Vitamin A",         unit: "mcg", group: "vitamin", dailyReference: 900 },
  { key: "vitamin_c",        label: "Vitamin C",         unit: "mg",  group: "vitamin", dailyReference: 90 },
  { key: "vitamin_d",        label: "Vitamin D",         unit: "mcg", group: "vitamin", dailyReference: 20 },
  { key: "vitamin_e",        label: "Vitamin E",         unit: "mg",  group: "vitamin", dailyReference: 15 },
  { key: "vitamin_k",        label: "Vitamin K",         unit: "mcg", group: "vitamin", dailyReference: 120 },
  { key: "thiamin",          label: "Thiamin (B1)",      unit: "mg",  group: "vitamin", dailyReference: 1.2 },
  { key: "riboflavin",       label: "Riboflavin (B2)",   unit: "mg",  group: "vitamin", dailyReference: 1.3 },
  { key: "niacin",           label: "Niacin (B3)",       unit: "mg",  group: "vitamin", dailyReference: 16 },
  { key: "pantothenic_acid", label: "Pantothenic (B5)",  unit: "mg",  group: "vitamin", dailyReference: 5 },
  { key: "vitamin_b6",       label: "Vitamin B6",        unit: "mg",  group: "vitamin", dailyReference: 1.7 },
  { key: "biotin",           label: "Biotin (B7)",       unit: "mcg", group: "vitamin", dailyReference: 30 },
  { key: "folate",           label: "Folate (B9)",       unit: "mcg", group: "vitamin", dailyReference: 400 },
  { key: "vitamin_b12",      label: "Vitamin B12",       unit: "mcg", group: "vitamin", dailyReference: 2.4 },
  { key: "choline",          label: "Choline",           unit: "mg",  group: "other",   dailyReference: 550 },
] as const;

export type NutrientKey = (typeof NUTRIENTS)[number]["key"];

/** A sparse bag of nutrient values. Missing key and null both mean UNKNOWN. */
export type NutrientMap = Record<string, number | null>;

export const NUTRIENT_BY_KEY: Readonly<Record<string, NutrientDef>> = Object.freeze(
  Object.fromEntries(NUTRIENTS.map((n) => [n.key, n])),
);

export const NUTRIENT_KEYS: readonly string[] = NUTRIENTS.map((n) => n.key);

/** The four with real columns on food_catalog / meal_adherence_logs. */
export const LEGACY_NUTRIENT_KEYS: readonly string[] = NUTRIENTS.filter((n) => n.legacyColumn).map((n) => n.key);

export const NUTRIENT_GROUP_ORDER: readonly NutrientGroup[] = [
  "carbohydrate",
  "fat",
  "mineral",
  "vitamin",
  "other",
];

export const NUTRIENT_GROUP_LABEL: Readonly<Record<NutrientGroup, string>> = Object.freeze({
  carbohydrate: "Carbohydrate",
  fat: "Fat",
  mineral: "Minerals",
  vitamin: "Vitamins",
  other: "Other",
});

export function isNutrientKey(k: string): boolean {
  return Object.prototype.hasOwnProperty.call(NUTRIENT_BY_KEY, k);
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Coerce anything (a jsonb blob, a model reply, a form) into a clean map.
 * Unknown keys are DROPPED rather than stored — an unrecognised key is either
 * a model hallucination or a typo, and letting it into the DB means it silently
 * never renders.
 */
export function sanitizeNutrients(raw: unknown): NutrientMap {
  const out: NutrientMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isNutrientKey(k)) continue;
    const n = numOrNull(v);
    // Negative nutrient values are always wrong; treat as unknown.
    if (n == null || n < 0) continue;
    out[k] = n;
  }
  return out;
}

/**
 * THE reader. Merges a row's legacy flat columns with its `micros` jsonb into
 * one map. Never read `micros` directly — the four legacy keys would be missed
 * on food_catalog and meal_adherence_logs.
 *
 * `flat` is whatever flat nutrient columns that row has, already renamed to
 * registry keys by the caller (est_fiber -> fiber, sat_fat -> sat_fat, ...).
 * Flat wins over jsonb, because on those two tables it is the authoritative
 * column and jsonb should never have carried it.
 */
export function readNutrients(micros: unknown, flat?: Record<string, unknown> | null): NutrientMap {
  const out = sanitizeNutrients(micros);
  if (flat) {
    for (const [k, v] of Object.entries(flat)) {
      if (!isNutrientKey(k)) continue;
      const n = numOrNull(v);
      if (n == null || n < 0) continue;
      out[k] = n;
    }
  }
  return out;
}

/** Scale every known value by a fraction (adherence proration). */
export function scaleNutrients(n: NutrientMap, pct: number): NutrientMap {
  const out: NutrientMap = {};
  for (const [k, v] of Object.entries(n)) {
    if (v == null) continue;
    out[k] = v * pct;
  }
  return out;
}

/**
 * Add two maps. A key known in one and unknown in the other contributes what
 * is known — the alternative (poisoning the total to unknown) would mean one
 * unlabelled snack blanks an otherwise complete day.
 */
export function addNutrients(a: NutrientMap, b: NutrientMap): NutrientMap {
  const out: NutrientMap = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v == null) continue;
    const prev = out[k];
    out[k] = prev == null ? v : prev + v;
  }
  return out;
}

export function sumNutrients(maps: NutrientMap[]): NutrientMap {
  return maps.reduce<NutrientMap>((acc, m) => addNutrients(acc, m), {});
}

export function hasAnyNutrient(n: NutrientMap | null | undefined): boolean {
  if (!n) return false;
  return Object.values(n).some((v) => v != null);
}

export function countKnownNutrients(n: NutrientMap | null | undefined): number {
  if (!n) return 0;
  return Object.values(n).filter((v) => v != null).length;
}

/** Round for storage/display. Sub-milligram nutrients need real precision. */
export function roundNutrient(key: string, value: number): number {
  const def = NUTRIENT_BY_KEY[key];
  const dp = def && (def.dailyReference ?? 0) > 0 && def.dailyReference! < 5 ? 3 : 1;
  const m = Math.pow(10, dp);
  return Math.round(value * m) / m;
}

export function roundNutrients(n: NutrientMap): NutrientMap {
  const out: NutrientMap = {};
  for (const [k, v] of Object.entries(n)) {
    out[k] = v == null ? null : roundNutrient(k, v);
  }
  return out;
}

/** Nutrients in registry order, grouped, for rendering a full panel. */
export function groupedNutrients(n: NutrientMap): { group: NutrientGroup; label: string; rows: { def: NutrientDef; value: number | null }[] }[] {
  return NUTRIENT_GROUP_ORDER.map((group) => ({
    group,
    label: NUTRIENT_GROUP_LABEL[group],
    rows: NUTRIENTS.filter((d) => d.group === group).map((def) => ({ def, value: n[def.key] ?? null })),
  })).filter((g) => g.rows.length > 0);
}

/** "% of daily reference", or null when we have no figure or no reference. */
export function pctOfDaily(key: string, value: number | null): number | null {
  const def = NUTRIENT_BY_KEY[key];
  if (!def || value == null || !def.dailyReference) return null;
  return (value / def.dailyReference) * 100;
}

/**
 * The micronutrient contract handed to the model, GENERATED FROM THE REGISTRY.
 *
 * Hand-writing this list in each prompt is how the AI ends up returning keys
 * the database drops on the floor. Generating it means adding a nutrient above
 * teaches every AI endpoint about it at once, and the keys the model is asked
 * for are by construction the keys sanitizeNutrients() accepts.
 */
export function nutrientPromptSpec(): string {
  const byGroup = NUTRIENT_GROUP_ORDER.map((g) => {
    const rows = NUTRIENTS.filter((n) => n.group === g);
    if (!rows.length) return null;
    return `  ${NUTRIENT_GROUP_LABEL[g]}: ${rows.map((n) => `${n.key} (${n.unit})`).join(", ")}`;
  }).filter(Boolean);

  return [
    'Also return a "micros" object on EVERY item, using EXACTLY these keys and units:',
    ...byGroup,
    "",
    "RULES for micros — these matter more than completeness:",
    '- OMIT any nutrient you do not actually know. A missing key means "unknown".',
    "- NEVER write 0 for something you are unsure about. A null or omitted value is",
    "  far more useful than a guess: 0 is a claim the food contains none of it, and",
    "  it silently drags the client's daily total down.",
    "- Use the units above exactly. Sodium is mg, fibre is g, vitamin D is mcg.",
    "- Values are for the stated amount of that item, not per 100 g and not per serving",
    "  unless the stated amount IS one serving.",
    "- Do not invent keys. Anything not in the list above is discarded.",
  ].join("\n");
}

/** Compact "12.5 g" / "480 mg" for display. */
export function formatNutrient(key: string, value: number | null): string {
  const def = NUTRIENT_BY_KEY[key];
  if (!def) return "—";
  if (value == null) return "—";
  return `${roundNutrient(key, value)} ${def.unit}`;
}
