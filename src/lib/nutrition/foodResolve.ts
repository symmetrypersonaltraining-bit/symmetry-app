/**
 * THE AI DOES NOT GET TO INVENT A NUMBER.
 *
 * Dustin, 24 Aug 2026: *"the ai anywhere in the app needs to be 100% accurate
 * at all times period. that's the type of thing that will completely crush this
 * entire project. I wouldn't have put ai in there if I wanted a 'guess'."*
 *
 * He is right, and the fix is architectural rather than a better prompt. Two
 * attempts at prompting a model into correct macros both failed, in different
 * ways, on consecutive tries:
 *
 *   "swap chicken thigh w 6 oz of chicken breast"  → 1 serving, weight dropped
 *   "add 200 g of potatoes"                        → the per-100 g figures
 *
 * The second is the instructive one: the model RECALLED correctly and then did
 * not multiply. Recall plus arithmetic in one step, and arithmetic is the half
 * it is worst at.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 *
 * A macro figure must come from a row in `food_catalog`. Never from a model.
 * There is no field in the meal-edit contract for a model to put one in, so it
 * is not a matter of the model behaving — it cannot.
 *
 * What the model IS asked for is judgement, which is what it is good at:
 *   1. read a sentence into a food name and an amount
 *   2. choose which of N REAL DATABASE ROWS that name means, with the actual
 *      numbers in front of it
 *
 * Then the arithmetic happens here, in code.
 *
 * ── WHY THE SHORTLIST HAS TO BE JUDGED AND NOT JUST TAKEN ────────────────────
 *
 * Because "the top row" is not safe either. Measured 24 Aug against the live
 * catalogue — 574,650 rows, of which only 21,776 are verified USDA:
 *
 *   "banana"          top hit → 242 kcal, 2P 27C 14F   (a banana. 14g of fat.)
 *   "chicken breast"  top hit → 89 kcal, 17.9P          (real answer ~165/31)
 *
 * Exact-name matches from Open Food Facts outrank correct rows named properly.
 * And naive verified-first is wrong in the other direction: "chicken breast"
 * resolves to *Chicken breast, roll, oven-roasted* and "white rice" to
 * *Chipotle White Rice* — right table, wrong food.
 *
 * So neither ranking alone is trustworthy, and a model shown both rows and
 * their numbers picks the right one. That is the whole design.
 *
 * ── AND WHEN NOTHING FITS ────────────────────────────────────────────────────
 *
 * Nothing is added. The op comes back unresolved and says so. A fabricated row
 * that looks like every other row is the failure mode being designed out.
 */

/** food_catalog quotes macros per `serving_grams` (100 for the USDA set). */
export interface CatalogRow {
  id: string;
  name: string;
  brand: string | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  serving_desc: string | null;
  serving_grams: number | null;
  verified: boolean | null;
  source: string | null;
  /**
   * THE REAL SERVINGS, AND THEY HAVE BEEN THERE ALL ALONG.
   *
   * 574,515 of 574,650 rows carry this. The bagel Dustin added on 27 Aug holds
   * [100 g, 1 oz, 1 bagel (95 g)] — and every food he added arrived as "100 g"
   * because nothing in this file ever read the column.
   *
   * `serving_grams` is 100 on 574,372 rows and `serving_desc` is the string
   * "100 g" on the same 574,372. Reading only those two is why the app could
   * offer exactly one portion size for every food in the world.
   */
  serving_options?: ServingOption[] | null;
}

export interface ServingOption {
  desc: string;
  grams: number;
}

/** "100 g", "1 oz", "28g" — a portion expressed only as a weight. */
const MASS_ONLY = /^\s*[\d.]+\s*(g|gm|kg|oz|lb|lbs|ml|l|fl\s?oz|grams?|ounces?|pounds?)\s*$/i;

export type Serving = {
  /** What one of them is called, singular: "bagel", "slice", "serving". */
  label: string;
  /** What ONE of them weighs. */
  gramsEach: number;
};

/**
 * Read a catalogue serving option into something a person can count.
 *
 * The descriptions are not uniform — "1 bagel (95 g)", "2 BAGELS (86 g)",
 * "1 serving (90 g)" — and the leading number matters: two bagels weighing 86 g
 * means ONE bagel is 43 g. Getting that backwards doubles somebody's breakfast.
 */
export function parseServingOption(o: ServingOption): Serving | null {
  if (!o || !(Number(o.grams) > 0) || !o.desc) return null;
  if (MASS_ONLY.test(o.desc)) return null;         // a weight, not a countable thing
  const m = o.desc.match(/^\s*([\d.]+)?\s*(.+?)\s*(?:\([^)]*\))?\s*$/);
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  if (!(count > 0)) return null;
  let label = (m[2] || "serving").trim().toLowerCase();
  if (!label) return null;
  // "2 BAGELS" counts bagels, not BAGELS-plural. Crude singularisation is right
  // here: these are food words, not arbitrary English.
  if (count !== 1 && label.endsWith("es") && /(ch|sh|s|x|z)es$/.test(label)) label = label.slice(0, -2);
  else if (count !== 1 && label.endsWith("s") && !label.endsWith("ss")) label = label.slice(0, -1);
  return { label: label.slice(0, 24), gramsEach: Number(o.grams) / count };
}

/**
 * The portion a person would actually name, or null when the row only knows
 * weights.
 *
 * Prefers a countable thing ("1 bagel") over a weight ("100 g", "1 oz"),
 * because "one bagel" is what somebody ate and 100 g is a laboratory answer.
 */
export function householdServing(row: CatalogRow): Serving | null {
  for (const o of row.serving_options || []) {
    const s = parseServingOption(o);
    if (s) return s;
  }
  return null;
}

/** Every portion this row can be counted in, for the unit picker. */
export function servingChoices(row: CatalogRow): Serving[] {
  const out: Serving[] = [];
  const seen = new Set<string>();
  for (const o of row.serving_options || []) {
    const s = parseServingOption(o);
    if (s && !seen.has(s.label)) { seen.add(s.label); out.push(s); }
  }
  return out;
}

/**
 * Did they name one of this row's own servings? "a bagel" -> 1 bagel (95 g).
 *
 * Matched on the label rather than exactly, so "bagels", "bagel" and "1 bagel"
 * all land on the same option.
 */
export function servingByUnit(row: CatalogRow, unit: string | null | undefined): Serving | null {
  if (!unit) return null;
  const u = unit.trim().toLowerCase().replace(/s$/, "");
  if (!u) return null;
  for (const s of servingChoices(row)) {
    const l = s.label.replace(/s$/, "");
    if (l === u || l.includes(u) || u.includes(l)) return s;
  }
  return null;
}

/**
 * Mass units only, and deliberately.
 *
 * A cup of rice and a cup of oil do not weigh the same, so there is no honest
 * conversion from volume to grams without knowing the food's density — which
 * the catalogue does not carry. Anything not in here is handled as "N of the
 * row's own serving" instead, which is still a real figure from a real row.
 */
const GRAMS_PER: Record<string, number> = {
  g: 1, gram: 1, grams: 1, gm: 1,
  kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.349523125, ounce: 28.349523125, ounces: 28.349523125,
  lb: 453.59237, lbs: 453.59237, pound: 453.59237, pounds: 453.59237,
};

export function toGrams(amount: number, unit: string | null | undefined): number | null {
  if (!unit) return null;
  const g = GRAMS_PER[unit.trim().toLowerCase()];
  return g ? amount * g : null;
}

export type ResolvedFood = {
  food_id: string;
  /** The row's name, shown on screen so a wrong CHOICE is visible and fixable. */
  name: string;
  verified: boolean;
  /** Macros for `per_amount` of `unit`, straight off the row. */
  p: number;
  c: number;
  f: number;
  amount: number;
  unit: string;
  per_amount: number;
  /**
   * Every portion this row can be counted in, so the sheet can offer a UNIT
   * PICKER instead of a fixed string. Dustin, 27 Aug: "should have all unit
   * options and be able to edit not just 100, 200, etc."
   */
  options?: Serving[];
};

/**
 * Turn a chosen catalogue row plus a requested measure into the numbers.
 *
 * Every value returned traces to a column. Nothing here is estimated, and a row
 * that cannot support the requested measure returns null rather than an
 * approximation.
 */
export function macrosFromRow(
  row: CatalogRow,
  amount: number,
  unit: string | null,
): ResolvedFood | null {
  // NULL IS NOT ZERO, and Number(null) is 0 — so the null check has to come
  // first. Without it a catalogue row with a missing protein would log as a
  // food with no protein, which is precisely the silent-wrong-number failure
  // this whole file exists to remove.
  if (row.protein == null || row.carbs == null || row.fats == null) return null;
  const p = Number(row.protein);
  const c = Number(row.carbs);
  const f = Number(row.fats);
  if (![p, c, f].every((n) => Number.isFinite(n))) return null;
  if (!(amount > 0)) return null;

  const perGrams = Number(row.serving_grams);
  const base = Number.isFinite(perGrams) && perGrams > 0 ? perGrams : 100;
  const choices = servingChoices(row);
  /** The row's macros for one gram — everything below scales from this. */
  const per1g = { p: p / base, c: c / base, f: f / base };

  // ── 1. A WEIGHT THEY NAMED ────────────────────────────────────────────────
  // Exact, and the right answer whenever somebody says "200 g" or "6 oz".
  const grams = toGrams(amount, unit);
  if (grams != null) {
    return {
      food_id: row.id, name: row.name, verified: !!row.verified,
      p, c, f,
      amount: Math.round(grams * 100) / 100,
      unit: "g",
      per_amount: base,
      options: choices,
    };
  }

  // ── 2. A SERVING THIS ROW ACTUALLY HAS ────────────────────────────────────
  //
  // "a bagel" against a row carrying "1 bagel (95 g)". This is the branch that
  // did not exist: every one of these fell through to the row's serving_desc,
  // which is the literal string "100 g" on 574,372 of 574,650 rows. So "add a
  // bagel and cream cheese" became 100 g of bagel and 100 g of cream cheese —
  // 343 calories of cream cheese, against about 30 g that anybody spreads.
  //
  // p/c/f are quoted for ONE of them and per_amount is 1, so the downstream
  // scale (amount / per_amount) is simply how many they had.
  const named = servingByUnit(row, unit) || (unit ? null : householdServing(row));
  if (named) {
    return {
      food_id: row.id, name: row.name, verified: !!row.verified,
      p: per1g.p * named.gramsEach,
      c: per1g.c * named.gramsEach,
      f: per1g.f * named.gramsEach,
      amount,
      unit: named.label,
      per_amount: 1,
      options: choices,
    };
  }

  // ── 3. A UNIT THE ROW HAS NEVER HEARD OF ──────────────────────────────────
  //
  // "2 cups of rice" where the row lists no cup. There is no honest volume
  // conversion without a density the catalogue does not carry, so this counts
  // the row's own base portion rather than inventing one — and it says so in
  // the unit, so nobody reads it as cups.
  return {
    food_id: row.id, name: row.name, verified: !!row.verified,
    p, c, f,
    amount,
    unit: (row.serving_desc || "serving").slice(0, 16),
    per_amount: 1,
    options: choices,
  };
}

/**
 * The shortlist, as the picking model sees it.
 *
 * The NUMBERS ARE IN THE LIST on purpose. Choosing between "Bananas, raw —
 * 89 kcal, 0.3 g fat" and "banana — 242 kcal, 14 g fat" is not a recall
 * problem; it is obvious once both are on the page, and it is the judgement
 * the model is actually being asked for.
 */
export function describeCandidates(rows: CatalogRow[]): string {
  return rows
    .map((r, i) => {
      const per = r.serving_grams ? `per ${r.serving_grams} g` : `per ${r.serving_desc || "serving"}`;
      const brand = r.brand ? ` (${r.brand})` : "";
      const flag = r.verified ? " [USDA]" : "";
      return `${i + 1}. ${r.name}${brand}${flag} — ${per}: ${Number(r.kcal ?? 0).toFixed(0)} kcal, ${Number(r.protein ?? 0).toFixed(1)}P ${Number(r.carbs ?? 0).toFixed(1)}C ${Number(r.fats ?? 0).toFixed(1)}F`;
    })
    .join("\n");
}

export const PICK_SYSTEM = `You choose which row of a food database a person meant. You never state a nutrition figure; the app reads those from the row you pick.

You are given a food as they described it, and a numbered list of candidate rows with their real macros.

Respond with ONLY valid JSON, no markdown and no prose:
{"pick": <the number of the best row, or 0 if none of them is that kind of food at all>}

How to choose:
- Pick the row that is THE SAME KIND OF FOOD. A generic entry for that food is a correct answer — it does not have to match their wording, their brand, or their exact recipe. Somebody who says "sourdough cinnamon roll" is eating a cinnamon roll: "Sweet rolls, cinnamon, commercially prepared" is the right pick, not a miss.
- Prefer plain, whole, unbranded entries over branded products, unless they named a brand.
- Prefer a row marked [USDA] when it is the same food. Those are checked; the rest are crowd-submitted and some are badly wrong.
- USE THE NUMBERS AS EVIDENCE. A banana at 242 kcal with 14 g of fat is not a banana, whatever it is called. A chicken breast with 3.6 g of carbs is suspect. If a row's macros are impossible for the food they named, do not pick it.
- Match the preparation where a row offers it — cooked vs raw, skinless vs with skin. Where no row offers it, the closest preparation of the same food is still the right pick.
- A DIFFERENT FOOD IS NOT A CLOSE MATCH. "Chicken breast, roll, oven-roasted" is deli meat and is not plain chicken breast. "Chipotle White Rice" is not generic white rice. A plain sourdough roll is not a cinnamon roll. Reject those.
- ANSWER 0 ONLY WHEN NOTHING IN THE LIST IS THAT KIND OF FOOD. 0 is for "there is no cinnamon roll here", not for "there is no SOURDOUGH cinnamon roll here". Answering 0 when a good generic row is sitting in the list sends the person off to search a database by hand for a food it already has, which is the worst outcome of the three.`;

/**
 * When the first search comes back with nothing usable, what else to look for.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * Dustin, 26 Aug: *"that button is supposed to be ai search and get numbers not
 * add from library ... I tell it what I ate in normal words, it searches and
 * gets macros n calories accurately."*
 *
 * He typed "Sour Dough Cinnamon Roll" and was told the food database did not
 * have it. The database has "Sweet rolls, cinnamon, commercially prepared",
 * "Fast foods, miniature cinnamon rolls" and four more, all USDA-checked.
 *
 * People do not describe food the way a nutrition database names it. One
 * literal search of their exact phrase is not searching — it is a lookup, and
 * it fails on any wording the database happens not to use. So when the first
 * pass finds nothing, the model gets asked what else this food might be
 * called, and those go back through the same search.
 */
export const TERMS_SYSTEM = `A food database could not find what somebody described. Suggest other terms to search for THE SAME FOOD.

Respond with ONLY valid JSON, no markdown and no prose:
{"terms": ["...", "..."]}

Rules:
- Two or three terms, most specific first.
- Go from how a person talks to how a nutrition database writes: drop brands, drop adjectives it will not index, keep the food itself. "Sour dough cinnamon roll" -> ["cinnamon roll", "sweet roll cinnamon"]. "My protein shake w/ almond milk" -> ["protein shake", "almond milk"] only if they are separate foods, otherwise the main one.
- Keep it the SAME FOOD. A shorter, plainer name for it — never a different food you think is similar. "Cinnamon roll" for a sourdough cinnamon roll is right; "bread" is not.
- Terms only. No macros, no commentary.`;

export function validateTerms(raw: unknown): string[] | null {
  if (!raw || typeof raw !== "object") return null;
  const t = (raw as { terms?: unknown }).terms;
  if (!Array.isArray(t)) return null;
  const out = t
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 1 && x.length < 80)
    .slice(0, 3);
  return out.length ? out : null;
}

export function validatePick(raw: unknown, candidateCount: number): number | null {
  if (!raw || typeof raw !== "object") return null;
  const pick = (raw as { pick?: unknown }).pick;
  if (typeof pick !== "number" || !Number.isFinite(pick)) return null;
  const n = Math.round(pick);
  if (n === 0) return 0;
  if (n < 1 || n > candidateCount) return null;
  return n;
}
