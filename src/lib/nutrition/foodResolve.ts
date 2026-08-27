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

  const grams = toGrams(amount, unit);
  const perGrams = Number(row.serving_grams);

  // Mass in, mass on the row: exact, and the common case (the USDA set is all
  // per 100 g).
  if (grams != null && Number.isFinite(perGrams) && perGrams > 0) {
    return {
      food_id: row.id,
      name: row.name,
      verified: !!row.verified,
      p, c, f,
      amount: Math.round(grams * 100) / 100,
      unit: "g",
      per_amount: perGrams,
    };
  }

  // No usable mass — count the row's own servings instead. "2 cups of rice"
  // becomes 2 × whatever one serving of that row is, labelled with the row's
  // own wording so nobody reads it as grams.
  return {
    food_id: row.id,
    name: row.name,
    verified: !!row.verified,
    p, c, f,
    amount,
    unit: (row.serving_desc || "serving").slice(0, 16),
    per_amount: 1,
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
