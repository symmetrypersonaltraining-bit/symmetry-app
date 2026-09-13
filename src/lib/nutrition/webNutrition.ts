/**
 * WHEN A RESTAURANT IS NAMED, GO AND READ ITS NUMBERS.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * Dustin, 12 Sep 2026: *"that ai assistant needs to search actual numbers when
 * the restaurant is mentioned n needs to be able to determine the real numbers
 * exactly the way you do it. Check my lunch today, once again the ai is nowhere
 * even close. This cannot be released as a paid app."*
 *
 * Twice in two days a restaurant meal came out at roughly half of what it was:
 *
 *   11 Sep  "Beef fajitas from Rivera's … with flour tortillas and queso"
 *           → 634 kcal. The fajitas matched a PACKAGED grocery product at a
 *             78 g label serving; the queso matched a FROZEN taco bowl.
 *   12 Sep  lunch → a cheeseburger priced at 42 kcal as "1 slice".
 *
 * The 11 Sep fix carried the restaurant through to the row pick and the portion
 * question, which stopped the frozen-bowl class of error. It did not fix the
 * underlying problem: **food_catalog does not contain restaurant food.** It is
 * USDA plus grocery labels. Asking "which of these ten rows is a Rivera's
 * fajita plate" has no right answer, so every answer is wrong, and the portion
 * question is then asked about a row that was never the food.
 *
 * ── WHAT THIS DOES INSTEAD ───────────────────────────────────────────────────
 *
 * The same thing a person does: search the web, find the restaurant's own
 * published nutrition (or, failing that, the chain's PDF, an allergen sheet, a
 * reputable aggregator), read the numbers off the page, and write down where
 * they came from.
 *
 * **THIS IS NOT THE MODEL RECITING MACROS.** That distinction is the whole
 * architecture of this subsystem and it is not being softened here:
 *
 *   - The model is handed a SEARCH TOOL, not asked to remember.
 *   - Every item it returns must carry `source_url` — the page it read. A number
 *     with no page is rejected, not saved.
 *   - kcal is DERIVED from the macros by the app, exactly as everywhere else;
 *     the model's own kcal is used only as a cross-check, and an item whose
 *     stated calories disagree with its own macros by more than 15% is thrown
 *     away as unreadable rather than trusted.
 *   - An item it cannot source is returned `found: false` and falls through to
 *     the ordinary catalogue path. Not guessed.
 *
 * ── ONE CALL PER MEAL, NOT ONE PER FOOD ──────────────────────────────────────
 *
 * A restaurant meal is one search: the model opens the restaurant's nutrition
 * page once and reads every item off it. Three separate lookups would cost
 * three searches, take three times as long, and can disagree with each other
 * about the same menu.
 *
 * ── WHAT IT COSTS ────────────────────────────────────────────────────────────
 *
 * Roughly one Sonnet call with a handful of searches per restaurant meal
 * logged — single-digit cents, against the $95 monthly ceiling that has never
 * been near half spent. It runs ONLY when a restaurant or brand was actually
 * named. A plain "6 oz chicken and rice" never reaches this file.
 */

import Anthropic from "@anthropic-ai/sdk";
import { SONNET_MODEL } from "@/lib/ai/anthropic";
import { extractJson } from "@/lib/ai/nutrition-json";
import { logFailure } from "@/lib/ai/meter";

/**
 * Sonnet, deliberately, and not the Haiku the rest of the parse path uses.
 *
 * anthropic.ts sets the rule: Haiku for pulling a fixed shape out of short
 * text, Sonnet for anything where the model IS the product. Reading a
 * restaurant's nutrition page, matching a menu item to what somebody described
 * in their own words, and doing the portion arithmetic is the second kind. It
 * is also the exact judgement he said was "nowhere even close" twice running,
 * and it runs a few times a day rather than on every keystroke.
 *
 * web_search_20260209 is the current server-side search tool and is supported
 * on this model; the numbers come back from the pages it opens.
 */
const WEB_MODEL = SONNET_MODEL;

export interface WebFoodRequest {
  /** The food as the person described it: "beef fajitas", "queso with ground beef". */
  name: string;
  /** What they said they had, verbatim, or null: 2, "tortilla". */
  amount: number | null;
  unit: string | null;
}

export interface WebFoodResult {
  /** Echoes the requested name so the caller can match it back. */
  name: string;
  /** What the source calls it: "Beef Fajitas (Plate)". */
  matched: string;
  /** The portion actually eaten, in words: "1 plate", "2 tortillas". */
  portion: string;
  /** Grams of that portion, when the page says. Null is allowed. */
  grams: number | null;
  protein: number;
  carbs: number;
  fats: number;
  /** The model's own calorie figure — a CROSS-CHECK only; the app derives its own. */
  statedKcal: number | null;
  /** The page these numbers were read from. Required; an item without one is dropped. */
  sourceUrl: string;
  /** "official" = the restaurant's own page or PDF. "reference" = anything else. */
  basis: "official" | "reference";
}

const SYSTEM = `You price restaurant and branded food for a physique coach's app by READING PUBLISHED NUTRITION, never from memory.

You have a web search tool. Use it. For every request:

1. Search for the named restaurant or brand plus the item plus "nutrition". Prefer, in order: the restaurant's own nutrition page or PDF, its allergen/nutrition sheet, a franchise or corporate site, then a reputable nutrition aggregator that cites the restaurant.
2. Read the numbers off the page for the item and the portion the person actually ate. Scale honestly: half a bowl is half the bowl's published numbers; "2 tortillas" is twice one tortilla.
3. If the exact item is not published, use the closest PUBLISHED item at the SAME restaurant and say which in "matched" — a beef fajita plate at a Tex-Mex restaurant that publishes one, not a grocery product and not a frozen meal.
4. If the restaurant publishes nothing and no reputable source covers it, use published figures for that dish as served by comparable sit-down restaurants of the same cuisine, and set "basis":"reference".

HARD RULES:
- EVERY item you return must carry "source_url": the page you actually read. No page, no item.
- If you cannot source an item at all, return it with "found": false and no numbers. Never invent one. An honest gap is useful; a made-up number is the failure this whole app is built to prevent.
- Restaurant portions are NOT retail label servings. A sit-down entree is the plate as served. Do not return a 78 g packaged-product serving for a restaurant plate, and do not return a 17 g "slice" for a whole cheeseburger.
- Return protein, carbs and fat in grams for the WHOLE portion eaten, plus the calories the source states. The app derives its own calories from your macros and will discard any item where the two disagree, so do not adjust one to fit the other — report what the page says.

Respond with ONLY valid JSON — no markdown, no fences, no prose outside it:
{"items":[{"name":"<the name you were given, copied exactly>","found":true,"matched":"<what the source calls it>","portion":"<the portion eaten, in words>","grams":<grams or null>,"protein":<g>,"carbs":<g>,"fats":<g>,"kcal":<the source's calories for this portion>,"source_url":"https://…","basis":"official"|"reference"}]}`;

/** http(s) only: a bare "walmart.com" is not evidence that a page was read. */
function validUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  const s = u.trim();
  if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(s)) return null;
  return s.slice(0, 500);
}

/**
 * Read the reply, and refuse anything that is not a sourced, self-consistent row.
 *
 * The three gates, in the order they catch things:
 *   1. no source_url            → the model answered from memory. Drop it.
 *   2. macros absent or absurd  → nothing to derive calories from. Drop it.
 *   3. stated kcal disagrees with its own macros by >15% → the page was
 *      misread, or two different portions were mixed together. Drop it.
 *
 * Gate 3 is the one that earns its place. A recited number is self-consistent
 * by construction, so consistency alone proves nothing — but INconsistency is
 * proof of a misread, and it is the only automatic signal available that the
 * numbers on the page were not the numbers for this portion.
 */
export function validateWebFoods(raw: unknown): WebFoodResult[] | null {
  if (!raw || typeof raw !== "object") return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;

  const out: WebFoodResult[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (o.found === false) continue;

    const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
    if (!name) continue;

    const sourceUrl = validUrl(o.source_url);
    if (!sourceUrl) continue;

    const protein = Number(o.protein);
    const carbs = Number(o.carbs);
    const fats = Number(o.fats);
    if (![protein, carbs, fats].every((n) => Number.isFinite(n) && n >= 0)) continue;
    if (protein + carbs + fats <= 0) continue;
    // Nothing a person eats in one sitting carries 500 g of a single macro.
    if (protein > 500 || carbs > 800 || fats > 500) continue;

    const derived = protein * 4 + carbs * 4 + fats * 9;
    const statedRaw = Number(o.kcal);
    const stated = Number.isFinite(statedRaw) && statedRaw > 0 ? statedRaw : null;
    if (stated != null && Math.abs(stated - derived) > derived * 0.15) continue;

    const gramsRaw = Number(o.grams);
    const grams = Number.isFinite(gramsRaw) && gramsRaw > 0 && gramsRaw <= 5000 ? gramsRaw : null;

    out.push({
      name,
      matched: typeof o.matched === "string" && o.matched.trim() ? o.matched.trim().slice(0, 160) : name,
      portion: typeof o.portion === "string" && o.portion.trim() ? o.portion.trim().slice(0, 60) : "1 serving",
      grams,
      protein,
      carbs,
      fats,
      statedKcal: stated,
      sourceUrl,
      basis: o.basis === "official" ? "official" : "reference",
    });
  }
  return out.length ? out : null;
}

/**
 * Every text block, in order — the JSON lands AFTER the search blocks, not first.
 *
 * Shared, because getting this wrong is silent and total: the moment a tool is
 * declared, `content[0]` is a `server_tool_use` block, so any caller still
 * reading `content[0].text` parses nothing and reports the feature as broken
 * for every client at once.
 */
export function textFromBlocks(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/**
 * Price one restaurant's worth of food by reading its published numbers.
 *
 * Returns only the items it could actually source. Anything missing is the
 * caller's problem to resolve the ordinary way — deliberately, so a gap here
 * degrades to today's behaviour rather than to a guess.
 */
export async function lookupRestaurantFoods(opts: {
  apiKey: string;
  clientId: string | null;
  /** "Rivera's in Princeton, Texas (Tex-Mex)" — whatever the client said. */
  place: string;
  items: WebFoodRequest[];
}): Promise<WebFoodResult[]> {
  if (!opts.items.length) return [];
  const client = new Anthropic({ apiKey: opts.apiKey });

  const asked = opts.items
    .map((i) => {
      const qty = i.amount != null ? `${i.amount}${i.unit ? " " + i.unit : ""}` : "(no amount given)";
      return `- ${i.name} — they had: ${qty}`;
    })
    .join("\n");

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        `WHERE THEY ATE: ${opts.place}\n\n` +
        `WHAT THEY HAD:\n${asked}\n\n` +
        `Search for this restaurant's published nutrition and price each item for the portion eaten.`,
    },
  ];

  try {
    let resp = await client.messages.create({
      model: WEB_MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages,
    });

    // A long search run pauses rather than failing. Hand the turn straight back
    // once; a second pause means the search is not converging and the caller's
    // ordinary path is a better use of the client's waiting.
    if (resp.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: resp.content });
      resp = await client.messages.create({
        model: WEB_MODEL,
        max_tokens: 4000,
        system: SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
        messages,
      });
    }

    const parsed = extractJson(textFromBlocks(resp.content));
    return parsed == null ? [] : (validateWebFoods(parsed) ?? []);
  } catch (e) {
    // A failed lookup is not licence to invent one. Record it and let the
    // caller fall through to the catalogue exactly as it did before this file.
    await logFailure(opts.clientId, "food_parse", WEB_MODEL, e, {
      latencyMs: 0,
      startedAt: new Date(),
      tokensIn: 0,
      tokensOut: 0,
    });
    return [];
  }
}

/**
 * Does this context name a PLACE, rather than describe a preparation?
 *
 * `context` was added on 11 Sep and already carries "restaurant dish, as served
 * at Rivera's (Tex-Mex)" or "homemade" or null. Only the first kind is worth a
 * search: there is no page on the internet for somebody's own kitchen.
 */
export function placeFromContext(context: string | null | undefined): string | null {
  if (!context) return null;
  const c = context.trim();
  if (!c || /^homemade\b/i.test(c)) return null;
  if (!/restaurant|takeout|take-out|drive|chain|cafe|café|diner|grill|bar\b|brand/i.test(c)) return null;
  // Everything after "at " is the place; failing that the whole line is context
  // enough for a search ("restaurant dish" alone is not, and is filtered above).
  const at = c.match(/\bat\s+(.+)$/i);
  const place = (at ? at[1] : c).trim();
  return place.length > 1 ? place.slice(0, 160) : null;
}
