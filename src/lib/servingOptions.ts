// "1 egg", not "44 g".
//
// Dustin, 17 Aug: "when I try to add a food from library I need to be able to
// adjust it by unit of measurements. for exp 1 egg, 2 eggs etc."
//
// The handoff flagged this as needing a data addition and said to establish
// that before designing anything. Measured instead, and the data is already
// there. food_catalog carries serving_grams and a serving_options jsonb array,
// and 574,515 of 574,617 rows have both. The exact food from his screenshot:
//
//   HARD BOILED EGGS · serving_desc "100 g" · serving_grams 100
//   serving_options [ {desc "100 g", grams 100},
//                     {desc "1 oz", grams 28.35},
//                     {desc "1 EGG (44 g)", grams 44} ]
//
// FoodSearchSheet already fetches these rows with select("*"). mapRow simply
// dropped the column, and nothing in the app has ever read serving_options —
// it is written by the barcode importer and by lib/nutrition/off.ts and read
// nowhere. The unit dropdown showed grams only because unitsForServing()
// derives its list DIMENSIONALLY from the base serving string: "100 g" is a
// mass, so it offers masses. Nothing told it an egg weighs 44 grams.
//
// This module turns those options into named units the dropdown can offer.
//
// WHY grams-per-ONE-unit and not the raw number: the descriptions are not all
// singular. "2 Tbsp (30 g)" means two tablespoons weigh 30 g, so a tablespoon
// is 15. Taking 30 would silently double every tablespoon logged from an Open
// Food Facts row — the kind of wrong that never looks wrong on screen.

export interface NamedServing {
  /** What the dropdown shows, e.g. "egg". */
  label: string;
  /** Weight of ONE of them, in grams. */
  gramsPerUnit: number;
}

// Anything unitsForServing() already offers dimensionally. Repeating them here
// would put "g" in the list twice, and the dimensional versions convert
// properly between each other.
const PLAIN = new Set([
  "g", "gram", "grams", "kg", "mg", "oz", "ounce", "ounces", "lb", "lbs", "pound", "pounds",
  "ml", "l", "liter", "litre", "liters", "litres", "fl oz", "floz",
  // UN/ECE measurement codes that Open Food Facts emits raw. "ONZ" is an ounce
  // and "OZA" a fluid ounce; shown as-is they read as gibberish in a dropdown,
  // and both dimensions are already covered.
  "onz", "oza",
]);

/**
 * Strip an Open Food Facts serving description down to a unit name.
 *
 *   "1 EGG (44 g)"   -> "egg"
 *   "2 Tbsp (30 g)"  -> "tbsp"
 *   "1 sandwich"     -> "sandwich"
 *   "0.25 cup (30 g)"-> "cup"
 *
 * Returns null when nothing usable is left.
 */
export function unitLabelOf(desc: string): string | null {
  let s = desc.trim();
  s = s.replace(/\([^)]*\)/g, " ");          // drop the "(44 g)" gloss
  s = s.replace(/^\s*[\d.,/]+\s*/, "");       // drop the leading count
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  if (!s) return null;
  // Singularise only the plain trailing "s", and never on a two-letter word —
  // "oz" must not become "o".
  if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (PLAIN.has(s)) return null;
  if (!/[a-z]/.test(s)) return null;          // "1 (44 g)" leaves nothing to name
  return s;
}

/** How many of the thing the description names, e.g. 2 for "2 Tbsp (30 g)". */
export function countIn(desc: string): number {
  const m = desc.trim().match(/^\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/);
  if (!m) return 1;
  const a = parseFloat(m[1]);
  if (!isFinite(a) || a <= 0) return 1;
  if (m[2]) {
    const b = parseFloat(m[2]);
    if (isFinite(b) && b > 0) return a / b;   // "1/2 cup"
  }
  return a;
}

/**
 * The named units a food can be logged in, from its serving_options.
 *
 * Plain masses and volumes are left out — unitsForServing() already offers
 * those and converts between them properly. What comes back here is the part
 * it cannot know: that this particular food comes in eggs, or slices, or bars.
 *
 * Deliberately tolerant of the column's shape. It is jsonb written by two
 * different importers, so a malformed entry drops out rather than taking the
 * whole dropdown with it.
 */
export function namedServings(raw: unknown): NamedServing[] {
  if (!Array.isArray(raw)) return [];
  const out: NamedServing[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const desc = typeof o.desc === "string" ? o.desc : null;
    const grams = Number(o.grams);
    if (!desc || !isFinite(grams) || grams <= 0) continue;
    const label = unitLabelOf(desc);
    if (!label || seen.has(label)) continue;
    const per = grams / countIn(desc);
    // A serving that rounds to nothing is a data fault, not a unit. Offering it
    // would make the macros read as zero however many the client entered.
    if (!isFinite(per) || per <= 0) continue;
    seen.add(label);
    out.push({ label, gramsPerUnit: per });
  }
  return out;
}

/**
 * How many base servings is `amount × label`?
 *
 * The macros on the row are per base serving (serving_grams), so this is the
 * multiplier to apply to them. Returns null when the food has no known base
 * weight — the legacy `foods` table has no serving_grams at all, and guessing
 * one would mislabel every macro on the screen.
 */
export function multiplierForNamed(
  amount: number,
  label: string,
  named: NamedServing[],
  baseGrams: number | null | undefined,
): number | null {
  if (!isFinite(amount) || amount <= 0) return null;
  if (!baseGrams || !isFinite(baseGrams) || baseGrams <= 0) return null;
  const hit = named.find((x) => x.label === label);
  if (!hit) return null;
  return (amount * hit.gramsPerUnit) / baseGrams;
}

/**
 * What the amount box should open on.
 *
 * A food stored per 100 g opens on "100 g", which is correct and useless: it is
 * how the macros are stored, not how anyone eats. When the food knows what one
 * of itself weighs, open on ONE of those instead — "1 egg" rather than "100 g".
 *
 * Only when the base serving is a plain weight or volume. A food already
 * described as "1 bar" or "1 sandwich" is opening on a real portion, and
 * second-guessing that would be changing an answer that was already right.
 */
export function defaultAmountFor(
  baseServing: string | null | undefined,
  named: NamedServing[],
  baseGrams: number | null | undefined,
): { amount: number; unit: string } | null {
  if (!named.length || !baseGrams || !isFinite(baseGrams) || baseGrams <= 0) return null;
  const base = (baseServing || "").trim().replace(/^\s*[\d.,/]+\s*/, "").toLowerCase();
  if (!PLAIN.has(base)) return null;
  return { amount: 1, unit: named[0].label };
}
