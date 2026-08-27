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
  CatalogRow, ResolvedFood, macrosFromRow, describeCandidates, PICK_SYSTEM, validatePick,
  TERMS_SYSTEM, validateTerms,
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

  // Nothing in the catalogue IS this food. Null means it is NOT ADDED anywhere:
  // a near-miss becomes a wrong number in someone's log and is indistinguishable
  // from a right one.
  if (!row) return null;

  const scaled = macrosFromRow(
    row,
    // No stated measure means one of the ROW's own servings — never an invented
    // portion. For the USDA set that is 100 g.
    amount ?? (row.serving_grams ? Number(row.serving_grams) : 1),
    unit ?? (row.serving_grams ? "g" : ""),
  );
  if (!scaled) return null;

  // Micronutrients ride along from the same row. They were being recalled by a
  // model too — thirty-three of them per food, which is thirty-three more
  // chances to be confidently wrong.
  return { ...scaled, micros: (row as CatalogRow & { micros?: unknown }).micros ?? null };
}
