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

/**
 * "each", "serving", "whole" — a word that means ONE OF THEM and names nothing.
 *
 * Dustin, 28 Aug, having typed "thomas cinnamon swirl bagel w cream cheese":
 * the sheet came back reading **1 100 g**, 293 cal. The search was right — it
 * found Thomas' own row, brand and all. What went wrong is below it.
 *
 * The model is asked for the measure THEY named and, when they name none for a
 * countable food, it tends to answer with a placeholder: "each", "serving",
 * "whole". That is not a measure. But it is a non-empty string, so it took the
 * `unit` path, missed the row's "1 bagel (95 g)" (a bagel is not an "each"),
 * and fell through to the last-resort branch, which labels the portion with
 * `serving_desc` — the literal string "100 g" on 574,372 of 574,650 rows.
 *
 * Hence a screen that says "1 100 g" and charges 100 g of bagel for one bagel.
 *
 * These words are now read as what they mean: no unit was named, so give them
 * one of the thing. An unrecognised REAL unit ("2 cups" against a row with no
 * cup) still falls through to the honest weight fallback — counting bagels
 * because somebody said cups would be a guess wearing a number.
 */
const GENERIC_ONE = /^(each|serving|servings|portion|portions|piece|pieces|whole|item|items|unit|units|count|ct)$/i;

/** True when `unit` is a placeholder for "one of them" rather than a measure. */
export function isGenericUnit(unit: string | null | undefined): boolean {
  return !!unit && GENERIC_ONE.test(unit.trim());
}

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
 * A measure of volume rather than a thing you can hold.
 *
 * ⚠️ MY BUG, 26 AUG, AND IT DOUBLED PEOPLE'S CALORIES.
 *
 * The serving fix took the FIRST countable option on the row, and USDA stores
 * them alphabetically, so "cup" beats everything. Replayed against the real
 * catalogue on 28 Aug:
 *
 *     Bananas, raw      ->  1 cup, mashed = 225 g   (~200 kcal, not 105)
 *     Cheese, cheddar   ->  1 cup, diced  = 132 g   (533 kcal)
 *     Nuts, almonds     ->  1 cup, whole  = 143 g   (828 kcal)
 *
 * 59,477 catalogue rows of 298,392 auto-picked a cup. "Add a banana" charged
 * somebody a cup of mashed banana.
 *
 * A cup is still a real serving and stays available in the unit picker -- it is
 * only wrong as the DEFAULT, because nobody saying "a banana" means a cup of
 * mashed banana. Volume is the last resort, after every piece-like option.
 */
const VOLUME_ISH = /^(cup|tbsp|tablespoon|tsp|teaspoon|quart|pint|gallon|fl\s?oz|fluid\s?ounce|liter|litre)\b/i;

/**
 * The portion a person would actually name, or null when the row only knows
 * weights.
 *
 * ⚠️ MY BUG, 26 AUG, AND IT DOUBLED PEOPLE'S CALORIES. The first version took
 * the FIRST countable option, and USDA stores them alphabetically, so "cup"
 * won almost every time:
 *
 *     Bananas, raw     ->  1 cup, mashed  225 g   (200 kcal for "a banana")
 *     Cheese, cheddar  ->  1 cup, diced   132 g   (533 kcal)
 *     Nuts, almonds    ->  1 cup, whole   143 g   (828 kcal)
 *
 * 59,477 of 298,392 catalogue rows defaulted to a cup.
 *
 * ⚠️ AND MY FIRST FIX WAS ALSO WRONG, caught only by replaying it against the
 * REAL catalogue instead of rows I had invented. "Any piece beats a volume"
 * gave `Nuts, almonds -> 1 almond = 1 g` -- wrong in the other direction. My
 * invented rows had a "1 medium" banana and a "1 slice" cheddar; neither
 * exists on the real row. Test data you wrote yourself agrees with you.
 *
 * So: a real piece, else a volume. A piece under 5 g is not offered as the
 * default -- "1 almond" is a genuine option and stays in the unit picker, but
 * nobody logs one almond.
 *
 * ⚠️ DELIBERATELY NOT CHANGED: rows whose only options are "100 g" and "1 oz"
 * still return null and fall through to the existing weight default. Preferring
 * the ounce would change the default portion on tens of thousands of foods --
 * most verified USDA rows carry exactly those two options and nothing else --
 * and whether "add chicken breast" should mean 1 oz or 100 g is Dustin's call,
 * not a bug fix. It is in the review list.
 */
export function householdServing(row: CatalogRow): Serving | null {
  return preferredServing((row.serving_options || []).map(parseServingOption));
}

/**
 * THE ONE PLACE THAT DECIDES WHICH SERVING IS "ONE OF THEM".
 *
 * Split out of `householdServing` on 4 Sep because there was a SECOND copy of
 * this decision in `lib/servingOptions.ts` — `defaultAmountFor` — and it was
 * the un-fixed version, still taking the first option in the list. That is the
 * 26 Aug bug, alive on the manual "Add from the food database" sheet the whole
 * time the AI path was correct. Measured against the live catalogue the same
 * day: 93,752 of the 223,237 rows carrying a named serving open on a VOLUME.
 *
 *   Bananas, raw     first named option -> "cup, mashed" 225 g   (200 cal)
 *                    what it should be  -> "small"       101 g   ( 90 cal)
 *   Nuts, almonds    first named option -> "cup, whole"  143 g   (828 cal)
 *   Cheese, cheddar  first named option -> "cup, diced"  132 g   (533 cal)
 *
 * Two copies of "which serving is one of them" is two screens disagreeing
 * about the same banana. There is now one, and both callers use it.
 */
export function preferredServing(list: (Serving | null)[]): Serving | null {
  let volume: Serving | null = null;
  let tiny: Serving | null = null;
  for (const s of list) {
    if (!s) continue;
    if (VOLUME_ISH.test(s.label)) { if (!volume) volume = s; continue; }
    // "1 almond" is a genuine option and stays in the picker. Nobody logs one.
    if (s.gramsEach < 5) { if (!tiny) tiny = s; continue; }
    return s;
  }
  return volume || tiny;
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
  /** Null when this did not come from a row — see `estimated`. */
  food_id: string | null;
  /** The row's name, shown on screen so a wrong CHOICE is visible and fixable. */
  name: string;
  verified: boolean;
  /**
   * TRUE WHEN THE NUMBERS CAME FROM THE MODEL, NOT FROM A ROW.
   *
   * Dustin, 28 Aug: *"That function needs to function as AI. It does not pull
   * foods just from my database... If I wanted to look up from the database, I
   * would click the button that says database."*
   *
   * He is right, and the previous design was too narrow. The box is labelled
   * "Just say what changed" and sits above a separate button labelled "Add from
   * the food database" — making the first one a second door to the second one
   * is two controls for one job, which is the same complaint he made on 26 Aug
   * about the search.
   *
   * So the catalogue is tried FIRST and still wins whenever it holds the food:
   * a real row beats recall, every time, and 574,650 rows cover most of what
   * anybody eats. But a miss is no longer a dead end. The model is asked for
   * the food directly, and what comes back is marked — visibly, on the row —
   * as an estimate.
   *
   * The mark is the whole point. His standard on 24 Aug was that the AI must
   * never be "a guess", and the failure that produced it was a guess DRESSED AS
   * A FACT: a fabricated row indistinguishable from a real one. An estimate
   * that says it is an estimate is not that failure. He estimates restaurant
   * meals himself — he did it here on 27 Aug for a plate of Texas barbecue.
   */
  estimated?: boolean;
  /**
   * TRUE WHEN THE MACROS CAME FROM A REAL ROW BUT THE PORTION WEIGHT DID NOT.
   *
   * A different thing from `estimated`, and the distinction is the whole point.
   * `estimated` means no row existed and every number is recall. This means the
   * row exists, its per-gram macros are USDA-checked and used exactly as
   * written — and the only thing asked of a model is how much ONE of the thing
   * a person counted weighs.
   *
   * That gap is real and it was silently wrong until 4 Sep. 574,372 of 574,650
   * catalogue rows carry nothing but "100 g" and "1 oz", so a row can hold
   * perfect numbers for pancakes and still not know what a pancake weighs.
   * "2 pancakes" then fell to the last branch below, which counts the row's
   * BASE portion — two hundred grams of pancake, 564 cal, on a screen reading
   * "2 100 g". Same meal: four scrambled eggs became 400 g (439 cal) and an
   * unstated amount of butter became 100 g (743 cal, 82 g of fat).
   *
   * Asking for one number nobody can look up, and multiplying it by figures
   * that ARE looked up, is strictly better than pretending a pancake weighs
   * 100 g because that is the column default.
   */
  portion_estimated?: boolean;
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
  /**
   * What one of the thing they counted weighs, when the ROW cannot say.
   *
   * Only ever reached after `servingByUnit` and `householdServing` have both
   * come back empty, so it can never override a real serving the row carries.
   * The caller marks the result — see `portion_estimated`.
   */
  fallbackServing?: Serving | null,
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
  // A placeholder unit is the same as no unit: one of whatever this row counts.
  const asked = isGenericUnit(unit) ? null : unit;
  const own = servingByUnit(row, asked) || (asked ? null : householdServing(row));
  // The row's own serving always wins. The fallback is only consulted when the
  // row has none — it is what a pancake weighs, not a correction to the row.
  const named = own || fallbackServing || null;
  if (named) {
    return {
      food_id: row.id, name: row.name, verified: !!row.verified,
      ...(own ? {} : { portion_estimated: true }),
      p: per1g.p * named.gramsEach,
      c: per1g.c * named.gramsEach,
      f: per1g.f * named.gramsEach,
      amount,
      unit: named.label,
      per_amount: 1,
      // The estimated portion joins the picker, so the weight behind it is one
      // tap away and correctable rather than buried in a payload.
      options: own ? choices : [...choices, named],
    };
  }

  // ── 3. LAST RESORT: NOBODY COULD SAY WHAT ONE WEIGHS ──────────────────────
  //
  // "2 cups of rice" where the row lists no cup and no portion weight came
  // back. This counts the row's own base portion rather than inventing one, and
  // it says so in the unit, so nobody reads it as cups.
  //
  // ⚠️ THIS BRANCH IS NOT A GOOD ANSWER AND MUST STAY RARE. It is how "2
  // pancakes" became 200 g on a screen reading "2 100 g": the label is honest
  // and the number is nonsense. Before 4 Sep every countable food on a
  // weight-only row landed here, which is most of the catalogue. The portion
  // question above exists to keep it empty.
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

// ─────────────────────────────────────────────────────────────────────────────
// WHEN THE CATALOGUE GENUINELY DOES NOT HAVE IT
// ─────────────────────────────────────────────────────────────────────────────

export const ESTIMATE_SYSTEM = `A food database has been searched and does not contain the food a person just said they ate. Give the nutrition for it yourself.

Answer for ONE of the thing, the way a person counts it — one bagel, one slice, one cup, one tablespoon — NOT per 100 g, unless the food is genuinely only ever weighed.

Respond with ONLY valid JSON — no markdown, no fences, no prose:
{"serving":"<what one is called, singular, lowercase>","grams":<what ONE weighs>,"p":<protein g in one>,"c":<carbs g in one>,"f":<fat g in one>,"confident":<true|false>}

Rules:
- "serving" is a countable word: bagel, slice, egg, cup, tbsp, bar, cookie, packet, piece, sandwich. Never "100 g". Never "serving" on its own if a better word exists.
- p, c and f are for ONE of them, in grams, and must be consistent with "grams". They are the nutrition-label numbers, not per 100 g.
- Do NOT return calories. The app derives them.
- "confident": true when this is a specific branded product whose label is well known, or a plain whole food (an egg, a banana, chicken breast). False when you are reasoning from a typical recipe — a restaurant dish, a homemade item, something regional.
- If you do not actually know this food, return {"unknown":true}. Say so rather than inventing. A number nobody can check is worse than no number.`;

export type FoodEstimate = { serving: string; grams: number; p: number; c: number; f: number; confident: boolean };

/**
 * Read the estimate reply, and refuse anything that is not arithmetically sane.
 *
 * The model is being trusted for a number here, which is exactly the thing this
 * file exists to avoid, so the reply is checked rather than believed: the
 * macros have to weigh less than the food does.
 */
export function validateEstimate(raw: unknown): FoodEstimate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.unknown === true) return null;
  const serving = typeof r.serving === "string" ? r.serving.trim().toLowerCase().slice(0, 24) : "";
  if (!serving || MASS_ONLY.test(serving)) return null;
  const grams = Number(r.grams);
  const p = Number(r.p), c = Number(r.c), f = Number(r.f);
  if (![grams, p, c, f].every((n) => Number.isFinite(n) && n >= 0)) return null;
  // A portion has to have a weight, and a plausible one. 5000 g is not a food.
  if (!(grams > 0) || grams > 5000) return null;
  // Protein, carbs and fat cannot outweigh the food they are in. This catches
  // the per-100 g answer given for a 30 g serving, which is the single most
  // likely way for this to be wrong.
  if (p + c + f > grams * 1.05) return null;
  return { serving, grams, p, c, f, confident: r.confident === true };
}

/** An estimate, shaped exactly like a resolved row so nothing downstream cares. */
export function estimatedFood(name: string, est: FoodEstimate, amount: number): ResolvedFood {
  return {
    food_id: null,
    name,
    verified: false,
    estimated: true,
    p: est.p, c: est.c, f: est.f,
    amount,
    unit: est.serving,
    per_amount: 1,
    options: [{ label: est.serving, gramsEach: est.grams }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ROW HAS THE NUMBERS. IT DOES NOT KNOW WHAT ONE OF THEM WEIGHS.
// ─────────────────────────────────────────────────────────────────────────────
//
// Dustin, 4 Sep, on the Edit custom meal sheet after typing "2 5 inch pancakes,
// 4 scrambled eggs w butter n cheese, 3 maple sausage links":
// *"its got all the same screw ups that we fixed on other features. these
// numbers r terrible."*
//
// He was right and the meal totalled 2,314 cal. Four of the five foods resolved
// to the correct USDA row and then got the wrong portion:
//
//   Pancakes, plain   "2 100 g"  559 cal   (two hundred grams of pancake)
//   Scrambled Eggs    "4 100 g"  439 cal   (four hundred grams of egg)
//   Butter, NFS       "100 g"    743 cal   (82 g of fat, for "w butter")
//   Cheese, NFS       "100 g"    382 cal
//   pork sausage      "3 link"   191 cal   ← correct, and the reason why
//
// The sausage row carries "1 link (28 g)" in serving_options. The other four
// carry "100 g" and "1 oz" and nothing else — which is true of 574,372 of the
// 574,650 rows. So the fix is not another row-reading trick; there is nothing
// left in the column to read.
//
// This asks for exactly ONE number, the one the database is missing: what one
// of the thing they counted weighs. Macros stay where they have always been —
// on the row, per gram, USDA-checked. Compare the alternatives:
//
//   ask for macros        the failure this whole file was built to remove
//   drop the food         a wrong total with nothing on screen saying why
//   charge 100 g          what it did, and what he is complaining about
//   ask for the weight    one checkable number against real per-gram macros
//
// The reply is validated the same way an estimate is, and the result is flagged
// `portion_estimated` so nothing downstream mistakes it for a row's own serving.

export const PORTION_SYSTEM = `A food database row has correct nutrition per gram but does not know what ONE of the thing a person counted weighs. Give that weight and nothing else.

You are told the database row's name, the words the person used, and the measure they counted in.

Respond with ONLY valid JSON — no markdown, no fences, no prose:
{"serving":"<the measure, singular, lowercase>","grams":<what ONE of them weighs>}

Rules:
- "grams" is the edible weight of ONE, as it is served. One large egg is about 50 g. One 5-inch pancake is about 77 g. One slice of processed cheese is about 21 g. One pat of butter is about 5 g. One slice of bread is about 28 g.
- Use the size they gave you. "5 inch pancake" and "silver dollar pancake" are not the same weight.
- If they named no measure at all, answer for one ordinary portion of that food as a person actually takes it, and give that portion its normal name: butter -> "pat", cheese -> "slice", peanut butter -> "tbsp", rice -> "cup".
- "serving" must be a countable word. Never "100 g". Never a weight.
- Do NOT return calories, protein, carbs or fat. The app reads all of those from the database row. You are being asked for a weight and only a weight.
- If you do not know what one of these weighs, return {"unknown":true}. Say so rather than inventing — a weight nobody can check is worse than no weight.`;

export type FoodPortion = { serving: string; grams: number };

/**
 * Read the portion reply, and refuse anything that is not a countable weight.
 *
 * Deliberately narrower than `validateEstimate`: there are no macros to check
 * against, so the only defences are that the word is countable and the weight
 * is in the range of a thing a person picks up.
 */
export function validatePortion(raw: unknown): FoodPortion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.unknown === true) return null;
  const serving = typeof r.serving === "string" ? r.serving.trim().toLowerCase().slice(0, 24) : "";
  // A weight is not an answer to "what does one weigh" — it is the question.
  if (!serving || MASS_ONLY.test(serving)) return null;
  const grams = Number(r.grams);
  if (!Number.isFinite(grams) || !(grams > 0) || grams > 5000) return null;
  return { serving, grams };
}
