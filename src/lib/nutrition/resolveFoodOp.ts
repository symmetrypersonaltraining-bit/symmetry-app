/**
 * One food name → one catalogue row → real macros. Shared by every AI surface
 * that puts food on a plate.
 *
 * Lives here rather than inside a route because there is more than one door:
 * /nutrition-ai/meal-edit (the Adjust sheet) and /nutrition-ai/parse (the
 * everyday "describe what you ate" logger, used by every client daily). Two
 * copies of "how a food becomes a number" would drift, and the drift would be
 * two screens disagreeing about the same dinner.
 *
 * See foodResolve.ts for WHY this exists at all. Short version: a model asked
 * for macros gets them wrong in ways that look right, and the app has 574,650
 * rows of real data sitting in food_catalog.
 */

import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import {
  CatalogRow, ResolvedFood, Serving, macrosFromRow, describeCandidates, PICK_SYSTEM, validatePick,
  TERMS_SYSTEM, validateTerms, householdServing, servingByUnit,
  ESTIMATE_SYSTEM, validateEstimate, estimatedFood, toGrams, isGenericUnit,
  PORTION_SYSTEM, validatePortion,
} from "@/lib/nutrition/foodResolve";

/** Enough rows to contain the right one; short enough that the whole list gets read. */
export const CANDIDATE_LIMIT = 10;

export type ResolveDeps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  apiKey: string;
  clientId: string | null;
};

/**
 * Resolve a described food to a catalogue row and scale it.
 *
 * Returns null when nothing in the catalogue IS that food — and null means the
 * food is NOT ADDED anywhere. That is the point of the whole design: a
 * near-miss becomes a wrong number in someone's log and is indistinguishable
 * from a right one.
 */
export async function resolveFood(
  deps: ResolveDeps,
  name: string,
  amount: number | null | undefined,
  unit: string | null | undefined,
): Promise<(ResolvedFood & { micros: unknown }) | null> {
  if (!name || !name.trim()) return null;
  const term = name.trim();

  // match_food_for_ai, NOT search_food_catalog. The latter matches the whole
  // phrase as one substring — "white potatoes, boiled" returns zero rows — and
  // ranks an exact lowercase name first, which is how "banana" resolves to a
  // crowd-submitted row reading 242 kcal and 14 g of fat.
  const search = async (q: string): Promise<CatalogRow[]> => {
    const { data } = await deps.db.rpc("match_food_for_ai", {
      p_term: q,
      p_client_id: deps.clientId,
      p_limit: CANDIDATE_LIMIT,
    });
    return ((data as (CatalogRow & { micros?: unknown })[] | null) || []).filter(
      (r) => r && r.protein != null && r.carbs != null && r.fats != null,
    );
  };

  // The judgement call, and the only thing the model is asked for: which of
  // these real rows is the food. The numbers are IN the list, because telling
  // "Bananas, raw — 89 kcal" from "banana — 242 kcal, 14 g fat" is obvious once
  // both are on the page.
  const pick = async (rows: CatalogRow[]): Promise<CatalogRow | null> => {
    if (!rows.length) return null;
    const picked = await callClaudeJson({
      meter: { clientId: deps.clientId, feature: "food_parse" },
      apiKey: deps.apiKey,
      model: HAIKU_MODEL,
      system: PICK_SYSTEM,
      maxTokens: 60,
      messages: [
        { role: "user", content: `THEY ASKED FOR:\n${term}\n\nCANDIDATE ROWS:\n${describeCandidates(rows)}` },
      ],
      validate: (raw) => {
        const n = validatePick(raw, rows.length);
        return n === null ? null : { n };
      },
    });
    if (!picked.value || picked.value.n === 0) return null;
    return rows[picked.value.n - 1];
  };

  let rows = await search(term);
  let row = await pick(rows);

  // ── SEARCH AGAIN BEFORE GIVING UP ──────────────────────────────────────────
  //
  // Dustin, 26 Aug: "that button is supposed to be ai search and get numbers
  // not add from library ... I tell it what I ate in normal words, it searches
  // and gets macros n calories accurately."
  //
  // He typed "Sour Dough Cinnamon Roll" and the app told him the food database
  // did not have it — then pointed him at a manual search button directly
  // underneath, which is two controls for one job and the wrong one doing it.
  //
  // The database was never the problem. It holds "Sweet rolls, cinnamon,
  // commercially prepared", "Fast foods, miniature cinnamon rolls" and four
  // more, every one USDA-checked. Two of them were even IN the candidate list.
  // It failed at the pick, because the prompt had been tuned after the banana
  // incident to answer 0 on anything short of an exact match — so "no SOURDOUGH
  // cinnamon roll" came back as "no cinnamon roll".
  //
  // That is now fixed in PICK_SYSTEM. This is the other half: one literal
  // search of somebody's exact phrase is a lookup, not a search, and it fails
  // on any wording the database happens not to use. So a miss asks what else
  // this food might be called and searches again.
  if (!row) {
    const alts = await callClaudeJson({
      meter: { clientId: deps.clientId, feature: "food_parse" },
      apiKey: deps.apiKey,
      model: HAIKU_MODEL,
      system: TERMS_SYSTEM,
      maxTokens: 80,
      messages: [{ role: "user", content: term }],
      validate: (raw) => {
        const t = validateTerms(raw);
        return t === null ? null : { t };
      },
    });
    for (const alt of alts.value?.t || []) {
      if (alt.toLowerCase() === term.toLowerCase()) continue;   // already tried
      const more = await search(alt);
      if (!more.length) continue;
      // Judged against what THEY said, not against the term we invented — the
      // alternate term is a way of finding rows, never a redefinition of the
      // food. Otherwise "cinnamon roll" would start matching anything the
      // second search dragged in.
      row = await pick(more);
      if (row) { rows = more; break; }
    }
  }

  // ── THE CATALOGUE DOES NOT HAVE IT. ASK ANYWAY. ───────────────────────────
  //
  // Dustin, 28 Aug: "That function needs to function as AI. It does not pull
  // foods just from my database... If I say I ate one Thomas cinnamon swirl
  // bagel, that's what it needs to log, one bagel... If I wanted to look up
  // from the database, I would click the button that says database."
  //
  // He is right. The box says "Just say what changed" and there is a separate
  // button underneath saying "Add from the food database" — a miss that sends
  // him to that button is two controls doing one job, which is the same
  // complaint he made about the search on 26 Aug.
  //
  // The catalogue still goes first and still wins whenever it holds the food;
  // a real row beats recall every time. This is only what happens after it
  // does not, and what comes back is MARKED as an estimate rather than being
  // laid down among the real rows looking identical to them.
  if (!row) {
    const est = await callClaudeJson({
      meter: { clientId: deps.clientId, feature: "food_parse" },
      apiKey: deps.apiKey,
      model: HAIKU_MODEL,
      system: ESTIMATE_SYSTEM,
      maxTokens: 120,
      messages: [{ role: "user", content: term }],
      validate: (raw) => {
        const e = validateEstimate(raw);
        return e === null ? null : { e };
      },
    });
    // Still nothing. NOT ADDED — the model saying "I don't know this food" is
    // an answer, and a better one than a number nobody can check.
    if (!est.value) return null;
    const e = est.value.e;

    // A weight they named is still a weight: 60 g of it is 60/grams of one.
    const g = isGenericUnit(unit) ? null : toGrams(amount ?? 1, unit);
    const n = g != null ? g / e.grams : (amount ?? 1);
    return { ...estimatedFood(term, e, Math.round(n * 1000) / 1000), micros: null };
  }

  // ── WHAT "NO AMOUNT GIVEN" SHOULD MEAN ─────────────────────────────────────
  //
  // It used to mean `serving_grams`, which is 100 on 574,372 of 574,650 rows.
  // So "add a bagel and cream cheese" put 100 g of each on the plate: a bagel
  // and a bit, and 343 calories of cream cheese against the ~30 g anybody
  // actually spreads. Dustin, 27 Aug: "everything in ai 'just say what changed'
  // only gives 100 gram increments."
  //
  // It now means ONE of the thing — the row's own countable serving, which for
  // that bagel is "1 bagel (95 g)" and has been sitting in serving_options the
  // whole time. Only a row that knows nothing but weights falls back to 100 g,
  // and that is an honest fallback rather than a default.
  const hh = householdServing(row);
  let amt = amount ?? null;
  let un = unit ?? null;
  if (amt == null && un == null) {
    // One of them. `null` unit rather than a made-up one — if the row has no
    // countable serving, the portion question below is what answers this.
    amt = 1;
    un = hh ? hh.label : null;
  } else if (amt == null) {
    amt = 1;                       // "in grams" with no number is one of them
  } else if (un == null) {
    // A bare number. Count the row's own servings rather than reading it as
    // grams — "2" after "add 2 bagels" is two bagels, not two grams.
    un = hh ? hh.label : null;
  }

  // ── AND WHEN THE ROW CANNOT EXPRESS THE MEASURE THEY USED ─────────────────
  //
  // Dustin, 4 Sep: *"its got all the same screw ups that we fixed on other
  // features. these numbers r terrible."* — the Edit custom meal sheet, showing
  // "2 100 g" of pancake (559 cal), "4 100 g" of egg (439 cal) and 100 g of
  // butter (743 cal) for "2 5 inch pancakes, 4 scrambled eggs w butter n
  // cheese". Every one of those resolved to the RIGHT USDA row; every one then
  // got charged the row's base portion because the row carries only "100 g" and
  // "1 oz" — as 574,372 of the 574,650 rows do.
  //
  // The one item that came out right, "3 link" of sausage, is the proof: its
  // row happens to carry "1 link (28 g)". There is nothing else left in the
  // column to read for the other four.
  //
  // So the missing number is asked for, and ONLY the missing number: what one
  // of the thing they counted weighs. The macros still come from the row, per
  // gram, exactly as written. See PORTION_SYSTEM for why this is the least-bad
  // of the four available answers.
  const askedUnit = isGenericUnit(un) ? null : un;
  const rowKnowsIt =
    toGrams(1, askedUnit) != null              // a weight — exact, no question needed
    || !!servingByUnit(row, askedUnit)         // the row's own countable serving
    || (!askedUnit && !!hh);                   // no measure named, and the row has one
  let fallbackServing: Serving | null = null;
  if (!rowKnowsIt) {
    const portion = await callClaudeJson({
      meter: { clientId: deps.clientId, feature: "food_parse" },
      apiKey: deps.apiKey,
      model: HAIKU_MODEL,
      system: PORTION_SYSTEM,
      maxTokens: 60,
      messages: [{
        role: "user",
        content: `DATABASE ROW: ${row.name}\nTHEY SAID: ${term}\nTHEY COUNTED IN: ${askedUnit || "(no measure given)"}`,
      }],
      validate: (raw) => {
        const v = validatePortion(raw);
        return v === null ? null : { v };
      },
    });
    const v = portion.value?.v;
    if (v) fallbackServing = { label: v.serving, gramsEach: v.grams };
  }

  const scaled = macrosFromRow(row, amt, un, fallbackServing);
  if (!scaled) return null;

  // Micronutrients ride along from the same row. They were being recalled by a
  // model too — thirty-three of them per food, which is thirty-three more
  // chances to be confidently wrong.
  return { ...scaled, micros: (row as CatalogRow & { micros?: unknown }).micros ?? null };
}
