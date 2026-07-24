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
