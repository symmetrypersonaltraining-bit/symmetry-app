// Strict-JSON extraction + validation for the nutrition AI endpoints.
// PURE module (no imports) so it can be unit-tested in plain node.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Pull the first JSON object out of a model reply (tolerates ``` fences / stray prose). */
export function extractJson(text: string): any | null {
  if (!text || typeof text !== "string") return null;
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function num(x: unknown): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function kcalFromMacros(p: number, c: number, f: number): number {
  return Math.round(p * 4 + c * 4 + f * 9);
}

// ---------------------------------------------------------------------------
// /api/nutrition-ai/parse
// ---------------------------------------------------------------------------

export interface ParsedItem {
  name: string;
  amount: number | null;
  unit: string | null;
  kcal: number;
  p: number;
  c: number;
  f: number;
}

export interface ParseResult {
  items: ParsedItem[];
  totals: { kcal: number; p: number; c: number; f: number };
}

/**
 * Validate + normalize a parse reply. Returns null when the shape is unusable
 * (caller then retries once). Totals are ALWAYS recomputed from the items so
 * the numbers the client displays can never disagree with the line items.
 */
export function validateParseResult(raw: unknown): ParseResult | null {
  if (!raw || typeof raw !== "object") return null;
  const items = (raw as any).items;
  if (!Array.isArray(items) || items.length === 0) return null;

  const out: ParsedItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") return null;
    const name = typeof it.name === "string" ? it.name.trim() : "";
    if (!name) return null;
    const p = round1(num(it.p ?? it.protein ?? it.protein_g));
    const c = round1(num(it.c ?? it.carbs ?? it.carbs_g));
    const f = round1(num(it.f ?? it.fats ?? it.fat ?? it.fat_g));
    const kcalRaw = num(it.kcal ?? it.calories);
    const kcal = kcalRaw > 0 ? Math.round(kcalRaw) : kcalFromMacros(p, c, f);
    const amountRaw = it.amount;
    const amount = amountRaw == null ? null : Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null;
    const unit = typeof it.unit === "string" && it.unit.trim() ? it.unit.trim() : null;
    out.push({ name, amount, unit, kcal, p, c, f });
  }

  const totals = out.reduce(
    (t, it) => ({ kcal: t.kcal + it.kcal, p: t.p + it.p, c: t.c + it.c, f: t.f + it.f }),
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
  return {
    items: out,
    totals: { kcal: Math.round(totals.kcal), p: round1(totals.p), c: round1(totals.c), f: round1(totals.f) },
  };
}

// ---------------------------------------------------------------------------
// /api/nutrition-ai/coach
// ---------------------------------------------------------------------------

export interface CoachSuggestion {
  label: string;
  delta: { p: number; c: number; f: number; kcal: number };
}

export interface CoachReply {
  message: string;
  suggestions?: CoachSuggestion[];
}

export function validateCoachReply(raw: unknown): CoachReply | null {
  if (!raw || typeof raw !== "object") return null;
  const message = (raw as any).message;
  if (typeof message !== "string" || !message.trim()) return null;
  const reply: CoachReply = { message: message.trim() };
  const sugg = (raw as any).suggestions;
  if (Array.isArray(sugg)) {
    const cleaned: CoachSuggestion[] = [];
    for (const s of sugg) {
      if (!s || typeof s !== "object" || typeof s.label !== "string" || !s.label.trim()) continue;
      const d = s.delta || {};
      cleaned.push({
        label: s.label.trim(),
        delta: { p: round1(num(d.p)), c: round1(num(d.c)), f: round1(num(d.f)), kcal: Math.round(num(d.kcal)) },
      });
    }
    if (cleaned.length) reply.suggestions = cleaned;
  }
  return reply;
}

// ---------------------------------------------------------------------------
// /api/nutrition-ai/plan-build
// ---------------------------------------------------------------------------

export interface PlanMealItem {
  food: string;
  amount: number | null;
  unit: string | null;
  p: number;
  c: number;
  f: number;
  kcal: number;
}

export interface PlanMeal {
  name: string;
  timing: string | null;
  items: PlanMealItem[];
  subtotal: { kcal: number; p: number; c: number; f: number };
}

export interface PlanDraft {
  targets: { kcal: number; p: number; c: number; f: number };
  reasoning: string | null;
  meals: PlanMeal[];
  totals: { kcal: number; p: number; c: number; f: number };
}

/** Validate + normalize a plan-build reply; subtotals/totals recomputed from items. */
export function validatePlanDraft(raw: unknown): PlanDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any;
  const t = r.targets || r.recommended_targets;
  if (!t || typeof t !== "object") return null;
  const targets = {
    kcal: Math.round(num(t.kcal ?? t.calories)),
    p: round1(num(t.p ?? t.protein)),
    c: round1(num(t.c ?? t.carbs)),
    f: round1(num(t.f ?? t.fats)),
  };
  if (targets.kcal <= 0) return null;

  const rawMeals = r.meals;
  if (!Array.isArray(rawMeals) || rawMeals.length === 0) return null;

  const meals: PlanMeal[] = [];
  for (const m of rawMeals) {
    if (!m || typeof m !== "object") return null;
    const name = typeof m.name === "string" && m.name.trim() ? m.name.trim() : `Meal ${meals.length + 1}`;
    const itemsRaw = m.items;
    if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) return null;
    const items: PlanMealItem[] = [];
    for (const it of itemsRaw) {
      if (!it || typeof it !== "object") return null;
      const food = typeof it.food === "string" ? it.food.trim() : typeof it.name === "string" ? it.name.trim() : "";
      if (!food) return null;
      const p = round1(num(it.p ?? it.protein));
      const c = round1(num(it.c ?? it.carbs));
      const f = round1(num(it.f ?? it.fats ?? it.fat));
      const kcalRaw = num(it.kcal ?? it.calories);
      const amountRaw = it.amount;
      items.push({
        food,
        amount: amountRaw == null ? null : Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null,
        unit: typeof it.unit === "string" && it.unit.trim() ? it.unit.trim() : null,
        p,
        c,
        f,
        kcal: kcalRaw > 0 ? Math.round(kcalRaw) : kcalFromMacros(p, c, f),
      });
    }
    const subtotal = items.reduce(
      (s, it) => ({ kcal: s.kcal + it.kcal, p: s.p + it.p, c: s.c + it.c, f: s.f + it.f }),
      { kcal: 0, p: 0, c: 0, f: 0 }
    );
    meals.push({
      name,
      timing: typeof m.timing === "string" && m.timing.trim() ? m.timing.trim() : null,
      items,
      subtotal: { kcal: Math.round(subtotal.kcal), p: round1(subtotal.p), c: round1(subtotal.c), f: round1(subtotal.f) },
    });
  }

  const totals = meals.reduce(
    (s, m) => ({ kcal: s.kcal + m.subtotal.kcal, p: s.p + m.subtotal.p, c: s.c + m.subtotal.c, f: s.f + m.subtotal.f }),
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
  return {
    targets,
    reasoning: typeof r.reasoning === "string" && r.reasoning.trim() ? r.reasoning.trim() : null,
    meals,
    totals: { kcal: Math.round(totals.kcal), p: round1(totals.p), c: round1(totals.c), f: round1(totals.f) },
  };
}

// ---------------------------------------------------------------------------
// /api/nutrition-ai/act — "do-anything" chat actions
// The model returns {intent, params, confirmation, reply}. validateActReply
// normalizes the shape (null → the caller retries once); finalizeAct then
// resolves every meal reference against the day context (position first, then
// fuzzy name/label match) and DOWNGRADES to intent 'none' with a clarifying
// question whenever a reference is missing or ambiguous — never guesses.
// ---------------------------------------------------------------------------

export type ActIntent =
  | "swap_meal"
  | "move_meal"
  | "copy_meal"
  | "delete_meal"
  | "add_snack"
  | "log_meal"
  | "unlog_meal"
  | "none";

const ACT_INTENTS: ActIntent[] = ["swap_meal", "move_meal", "copy_meal", "delete_meal", "add_snack", "log_meal", "unlog_meal", "none"];

export type ActAdherence = "Full" | "3/4" | "1/2" | "1/4" | "Skipped";

/** A meal reference as extracted from the model — resolved later by finalizeAct. */
export interface ActMealRef {
  position: number | null;
  name: string | null;
}

export interface ActReply {
  intent: ActIntent;
  params: {
    meal?: ActMealRef;      // swap / delete / log / unlog target
    from?: ActMealRef;      // move / copy source
    to?: ActMealRef | null; // move target · copy insertion point (null = end of day)
    items?: ParsedItem[];   // swap_meal / add_snack
    name?: string | null;   // new meal / snack label
    adherence?: ActAdherence;
    clarify?: boolean;      // intent 'none': reply is a clarifying question, not a Q&A question
  };
  confirmation: string | null; // required for every action intent
  reply: string;
}

/** One meal of the day context the client sends ({position, name, logged state, macros}). */
export interface ActDayMeal {
  position: number;
  label?: string | null; // display label ("M1"… or slot name)
  name: string;
  logged?: boolean;
  kcal?: number;
  p?: number;
  c?: number;
  f?: number;
}

function actStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function actPos(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function actRef(p: any, posKeys: string[], nameKeys: string[]): ActMealRef {
  let position: number | null = null;
  for (const k of posKeys) {
    position = actPos(p?.[k]);
    if (position != null) break;
  }
  let name: string | null = null;
  for (const k of nameKeys) {
    name = actStr(p?.[k]);
    if (name) break;
  }
  return { position, name };
}

function actAdherence(v: unknown): ActAdherence {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "3/4" || s === "0.75" || s === "three quarters" || s === "most") return "3/4";
  if (s === "1/2" || s === "0.5" || s === "half") return "1/2";
  if (s === "1/4" || s === "0.25" || s === "quarter" || s === "some") return "1/4";
  if (s === "skipped" || s === "skip") return "Skipped";
  return "Full";
}

/** Items for swap_meal / add_snack — same normalization as the parse endpoint. */
function validateActItems(raw: unknown): ParsedItem[] | null {
  const r = validateParseResult({ items: raw });
  return r ? r.items : null;
}

export function validateActReply(raw: unknown): ActReply | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any;
  const intent = typeof r.intent === "string" ? (r.intent.trim() as ActIntent) : ("" as ActIntent);
  if (!ACT_INTENTS.includes(intent)) return null;

  const p = r.params && typeof r.params === "object" ? r.params : {};
  const replyText = actStr(r.reply) ?? actStr(r.message);
  const confirmation = actStr(r.confirmation);

  if (intent === "none") {
    if (!replyText) return null;
    return { intent: "none", params: { clarify: Boolean(p.clarify) }, confirmation: null, reply: replyText };
  }

  // Every action intent needs a human confirmation sentence — nothing mutates
  // without the client explicitly confirming it.
  if (!confirmation) return null;
  const reply = replyText ?? confirmation;

  switch (intent) {
    case "swap_meal": {
      const meal = actRef(p, ["position", "meal_position"], ["meal_name", "meal", "target"]);
      if (meal.position == null && !meal.name) return null;
      const items = validateActItems(p.items);
      if (!items) return null;
      const name = actStr(p.new_name) ?? actStr(p.name) ?? items.map((it) => it.name).join(" + ");
      return { intent, params: { meal, items, name }, confirmation, reply };
    }
    case "move_meal":
    case "copy_meal": {
      const from = actRef(p, ["from_position", "from", "position"], ["from_name", "meal_name", "meal"]);
      if (from.position == null && !from.name) return null;
      const to = actRef(p, ["to_position", "to"], ["to_name"]);
      if (intent === "move_meal" && to.position == null && !to.name) return null;
      const toRef = to.position == null && !to.name ? null : to; // copy: null → end of day
      return { intent, params: { from, to: toRef }, confirmation, reply };
    }
    case "delete_meal":
    case "unlog_meal": {
      const meal = actRef(p, ["position", "meal_position"], ["meal_name", "meal", "name"]);
      if (meal.position == null && !meal.name) return null;
      return { intent, params: { meal }, confirmation, reply };
    }
    case "log_meal": {
      const meal = actRef(p, ["position", "meal_position"], ["meal_name", "meal", "name"]);
      if (meal.position == null && !meal.name) return null;
      return { intent, params: { meal, adherence: actAdherence(p.adherence) }, confirmation, reply };
    }
    case "add_snack": {
      const items = validateActItems(p.items);
      if (!items) return null;
      const name = actStr(p.name) ?? actStr(p.snack_name) ?? items.map((it) => it.name).join(" + ");
      return { intent, params: { items, name }, confirmation, reply };
    }
    default:
      return null;
  }
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export interface RefResolution {
  position: number | null;
  /** Names of the candidate meals when the reference matched more than one. */
  ambiguous: string[];
}

/**
 * Resolve a meal reference against the day context: exact position first, then
 * label ("M3" / "meal 3" = 3rd meal in display order), then fuzzy name match
 * (exact → substring/token containment). Exactly one match resolves; zero or
 * several do not.
 */
export function resolveMealRef(ref: ActMealRef, day: ActDayMeal[]): RefResolution {
  if (ref.position != null && day.some((d) => d.position === ref.position)) {
    return { position: ref.position, ambiguous: [] };
  }
  if (!ref.name) return { position: null, ambiguous: [] };
  const q = normName(ref.name);
  if (!q) return { position: null, ambiguous: [] };

  // "M3" / "meal 3" → 3rd meal in display order.
  const mNum = q.match(/^m(?:eal)?\s*(\d+)$/);
  if (mNum) {
    const idx = Number(mNum[1]) - 1;
    if (idx >= 0 && idx < day.length) return { position: day[idx].position, ambiguous: [] };
  }

  const labelHit = day.filter((d) => d.label && normName(String(d.label)) === q);
  if (labelHit.length === 1) return { position: labelHit[0].position, ambiguous: [] };

  const exact = day.filter((d) => normName(d.name) === q);
  if (exact.length === 1) return { position: exact[0].position, ambiguous: [] };
  if (exact.length > 1) return { position: null, ambiguous: exact.map((d) => d.name) };

  const qTokens = q.split(" ");
  const fuzzy = day.filter((d) => {
    const n = normName(d.name);
    if (n.includes(q) || q.includes(n)) return true;
    const nTokens = n.split(" ");
    return qTokens.every((t) => nTokens.includes(t));
  });
  if (fuzzy.length === 1) return { position: fuzzy[0].position, ambiguous: [] };
  return { position: null, ambiguous: fuzzy.map((d) => d.name) };
}

function clarifyReply(ref: ActMealRef, res: RefResolution, day: ActDayMeal[]): string {
  const what = ref.name ? `“${ref.name}”` : ref.position != null ? `position ${ref.position}` : "that meal";
  if (res.ambiguous.length > 1) {
    return `I found more than one match for ${what} — did you mean ${res.ambiguous.slice(0, 4).join(" or ")}? Tell me which one.`;
  }
  const list = day.slice(0, 8).map((d, i) => `${d.label || "M" + (i + 1)} ${d.name}`).join(" · ");
  return `I couldn't find ${what} on today's list. Today you have: ${list}. Which one did you mean?`;
}

const CLARIFY = (reply: string): ActReply => ({ intent: "none", params: { clarify: true }, confirmation: null, reply });

/**
 * Resolve every meal reference in a validated act against the day context.
 * Any missing/ambiguous reference downgrades the whole act to intent 'none'
 * with a clarifying question — the coach asks instead of guessing.
 */
export function finalizeAct(act: ActReply, day: ActDayMeal[]): ActReply {
  if (act.intent === "none") return act;

  // position null → could not resolve; `reply` holds the clarifying question.
  const resolve = (ref: ActMealRef): { position: number | null; reply: string } => {
    const res = resolveMealRef(ref, day);
    if (res.position != null) return { position: res.position, reply: "" };
    return { position: null, reply: clarifyReply(ref, res, day) };
  };

  switch (act.intent) {
    case "swap_meal":
    case "delete_meal":
    case "log_meal":
    case "unlog_meal": {
      const r2 = resolve(act.params.meal!);
      if (r2.position == null) return CLARIFY(r2.reply);
      return { ...act, params: { ...act.params, meal: { position: r2.position, name: act.params.meal!.name } } };
    }
    case "move_meal":
    case "copy_meal": {
      const from = resolve(act.params.from!);
      if (from.position == null) return CLARIFY(from.reply);
      let to: ActMealRef | null = null;
      if (act.params.to) {
        const t = resolve(act.params.to);
        if (t.position == null) return CLARIFY(t.reply);
        if (act.intent === "move_meal" && t.position === from.position) {
          return CLARIFY("That meal is already in that spot — tell me where you'd like it instead.");
        }
        to = { position: t.position, name: act.params.to.name };
      } else if (act.intent === "move_meal") {
        return CLARIFY("Where should it go? Tell me which meal to place it before or after.");
      }
      return { ...act, params: { ...act.params, from: { position: from.position, name: act.params.from!.name }, to } };
    }
    default:
      return act; // add_snack — no meal references
  }
}

// ---------------------------------------------------------------------------
// /api/nutrition-ai/verify-food
// ---------------------------------------------------------------------------

export interface VerifyResult {
  plausible: boolean;
  confidence: "high" | "medium" | "low";
  corrected: { kcal: number; protein: number; carbs: number; fats: number };
  notes: string | null;
}

export function validateVerifyResult(raw: unknown): VerifyResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any;
  const c = r.corrected || r.macros;
  if (!c || typeof c !== "object") return null;
  const protein = round1(num(c.protein ?? c.p ?? c.protein_g));
  const carbs = round1(num(c.carbs ?? c.c ?? c.carbs_g));
  const fats = round1(num(c.fats ?? c.f ?? c.fat ?? c.fat_g));
  const kcalRaw = num(c.kcal ?? c.calories);
  const confidence = r.confidence === "high" || r.confidence === "medium" || r.confidence === "low" ? r.confidence : "low";
  return {
    plausible: Boolean(r.plausible),
    confidence,
    corrected: { kcal: kcalRaw > 0 ? Math.round(kcalRaw) : kcalFromMacros(protein, carbs, fats), protein, carbs, fats },
    notes: typeof r.notes === "string" && r.notes.trim() ? r.notes.trim() : null,
  };
}
