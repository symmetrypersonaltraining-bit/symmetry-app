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
  parseServingOption,
  ESTIMATE_SYSTEM, validateEstimate, estimatedFood, toGrams, isGenericUnit,
  PORTION_SYSTEM, validatePortion,
} from "@/lib/nutrition/foodResolve";
import { unitHeUses } from "@/lib/nutrition/foodUnitDefaults";
import { readNutrients, scaleNutrients } from "@/lib/nutrition/nutrients";
import { searchUsdaOnline, cacheUsdaFood, usdaOnlineAvailable } from "@/lib/nutrition/usdaOnline";

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

  // ── THE CATALOGUE DOES NOT HAVE IT. GO AND GET IT. ────────────────────────
  //
  // Dustin, 9 Sep 2026: *"if it's not in the data base they need a way to
  // search in online through ai and get real numbers. again this is the whole
  // point of having a 'brain' in the app."*
  //
  // The brain is not the model reciting macros — that is the failure this
  // module exists to end, and it is undetectable, because a recited number is
  // self-consistent by construction. The brain is: go to USDA FoodData Central,
  // pull the real measured rows for this food, and let the model do here what
  // it does everywhere else in this file — CHOOSE between rows it can see.
  //
  // What comes back is written into food_catalog carrying its FDC id, so the
  // second client to eat the same thing gets it out of the catalogue with no
  // network at all. The database teaches itself, one miss at a time.
  if (!row && usdaOnlineAvailable()) {
    const online = await searchUsdaOnline(term, CANDIDATE_LIMIT);
    if (online.length) {
      // Shaped as candidate rows so the SAME pick prompt judges them, with the
      // same rule: the numbers are IN the list and the model picks one or says
      // none of these. Nothing here asks it for a figure.
      const asRows: CatalogRow[] = online.map((f) => ({
        id: `usda:${f.fdcId}`,
        name: f.description,
        brand: f.brand,
        kcal: f.kcal,
        protein: f.protein,
        carbs: f.carbs,
        fats: f.fats,
        serving_desc: "100 g",
        serving_grams: 100,
        // Branded is the manufacturer-submitted half of FDC and is not
        // measured. Saying so in the candidate list is what lets the model
        // prefer the laboratory row when both are offered.
        verified: f.dataType !== "Branded",
        source: `USDA ${f.dataType}`,
        serving_options:
          f.servingGrams && f.servingGrams > 0
            ? [{ desc: "100 g", grams: 100 }, { desc: f.servingLabel || "1 serving", grams: f.servingGrams }]
            : [{ desc: "100 g", grams: 100 }],
      }));
      const chosen = await pick(asRows);
      if (chosen) {
        const hit = online[asRows.indexOf(chosen)];
        // Only the CHOSEN row is written. Caching all ten would fill the
        // catalogue with near-misses that the next search then has to reject.
        const cached = hit ? await cacheUsdaFood(deps.db, hit) : null;
        if (cached) {
          row = cached as unknown as CatalogRow;
          rows = [row];
        }
      }
    }
  }

  // ── STILL NOTHING. ASK ANYWAY, AND MARK IT AS A GUESS. ────────────────────
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
    // Still nothing — the catalogue missed it, the alternate names missed it,
    // and USDA has no row for it either (or the network was down). NOT ADDED:
    // the model saying "I don't know this food" is an answer, and a better one
    // than a number nobody can check.
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

  // ── THE CATALOGUE FIRST, EVEN FOR THE PORTION ─────────────────────────────
  //
  // Added 5 Sep, after Dustin: "butter shouod measure in tablespoons i thought
  // we fixed all this." A row with no countable serving of its own can borrow
  // the household measures of the best-matching VERIFIED row for the same food
  // — USDA's "Butter, salted" has carried "1 tbsp (14.2 g)" all along. That is a
  // real number from a real row, so it beats asking a model for the weight, and
  // it costs a query instead of a call.
  // ── WHAT HE PROGRAMMES IT IN, BEFORE ANYTHING IS DERIVED ──────────────────
  //
  // Same record the food sheet reads: meal_items.unit, the unit Dustin wrote
  // down himself, once per food, every time he built a meal. If they named no
  // measure and he has one for this food, that is the measure — no borrow, no
  // model. And if he WEIGHS this food, a borrowed household unit would be the
  // wrong answer, so the borrow is skipped and the portion question asked.
  const hisUnit = unitHeUses(row.name);
  const heWeighsIt = !!hisUnit && /^(g|oz|grams?|oz cooked|oz dry)$/.test(hisUnit);
  if (!rowKnowsIt && !askedUnit && hisUnit && !heWeighsIt) {
    fallbackServing = servingByUnit(row, hisUnit) ?? null;
  }

  if (!rowKnowsIt && !fallbackServing && !heWeighsIt) {
    try {
      const { data } = await deps.db.rpc("borrowed_household_servings", {
        p_name: row.name, p_brand: (row as CatalogRow & { brand?: string | null }).brand ?? null,
      });
      const opts = Array.isArray(data) ? (data as { desc: string; grams: number }[]) : [];
      const parsed = opts.map(parseServingOption);

      // ⚠️ IT MAY ONLY ANSWER THE QUESTION IT WAS ASKED.
      //
      // The first version fell back to "whichever countable measure this
      // borrowed set happens to lead with". Dustin typed "6 tiffs treats
      // cookies" and got **6 bar — 1,815 cal**: the borrowed set for a
      // chocolate chip cookie contained a "bar", nothing matched the word he
      // used, and the chooser handed over the bar anyway. Six cookies became
      // six protein bars, 300 calories each.
      //
      // A borrowed serving is only ever an answer to "what does one X weigh".
      // If the set does not contain X, it does not know, and saying so is
      // correct — the portion question below asks the model that exact thing
      // and gets ~35 g for a cookie.
      const wanted = (askedUnit
        // He has a unit for this food; the borrow's one job is to find it.
        || hisUnit
        // No unit named: the food itself is what they counted. "6 tiffs treats
        // COOKIES" — their own last word, not the catalogue row's.
        || term.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 3).pop()
        || "").trim().toLowerCase().replace(/s$/, "");
      fallbackServing = wanted
        ? parsed.find((p) => {
            if (!p) return false;
            const l = p.label.replace(/s$/, "");
            return l === wanted || l.includes(wanted) || wanted.includes(l);
          }) || null
        : null;
    } catch {
      // A failed borrow just means the question below gets asked.
    }
  }

  if (!rowKnowsIt && !fallbackServing) {
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

/**
 * A LIST OF NAMES IN, A LIST OF PRICED FOODS OUT — the one implementation.
 *
 * /nutrition-ai/parse had this loop inline. When the coach chat was made to
 * stop inventing macros (9 Sep 2026) it needed exactly the same loop, and two
 * copies of "how a described food becomes a number" is how two screens end up
 * disagreeing about the same dinner — the reason resolveFood itself lives in
 * this file rather than in a route.
 *
 * A name that resolves to nothing is RETURNED SEPARATELY and contributes
 * nothing to any total. It is not zeroed, not guessed at, and not silently
 * dropped: the caller shows it by name so the person can find it themselves.
 * A fabricated food looks identical to a real one on the screen that follows,
 * and that is the failure this whole module exists to design out.
 */
export async function priceNamedFoods(
  deps: ResolveDeps,
  named: { name: string; amount: number | null; unit: string | null }[],
): Promise<{ items: PricedItem[]; unresolved: string[] }> {
  const items: PricedItem[] = [];
  const unresolved: string[] = [];
  for (const n of named) {
    let got: Awaited<ReturnType<typeof resolveFood>> = null;
    try {
      got = await resolveFood(deps, n.name, n.amount, n.unit);
    } catch {
      // A lookup that fell over is not licence to invent one.
      got = null;
    }
    if (!got) { unresolved.push(n.name); continue; }
    const scale = got.per_amount > 0 ? got.amount / got.per_amount : 1;
    const r1 = (x: number) => Math.round(x * 10) / 10;
    items.push({
      // The ROW's name, so a wrong choice is visible and correctable. A wrong
      // name you can see beats a wrong number you cannot.
      name: got.name,
      amount: got.amount,
      unit: got.unit,
      p: r1(got.p * scale),
      c: r1(got.c * scale),
      f: r1(got.f * scale),
      kcal: Math.round(got.p * scale * 4 + got.c * scale * 4 + got.f * scale * 9),
      // SCALED, like every other number on the row. The loop this replaced
      // did `scaleNutrients(readNutrients(...), scale)`; returning the row's
      // raw micros would quote 100 g of sodium for 30 g of cheese, and the
      // whole nutrient panel is built on those totals.
      micros: got.micros ? scaleNutrients(readNutrients(got.micros), scale) : null,
      food_id: got.food_id,
      verified: got.verified,
      estimated: got.estimated === true,
    });
  }
  return { items, unresolved };
}

export interface PricedItem {
  name: string;
  amount: number | null;
  unit: string | null;
  p: number;
  c: number;
  f: number;
  kcal: number;
  micros: unknown;
  /** The food_catalog row every figure came from. Null only for an estimate. */
  food_id: string | null;
  verified: boolean;
  /** True when no row existed anywhere and the last-resort estimate produced it. */
  estimated: boolean;
}
