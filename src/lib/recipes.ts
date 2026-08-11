// Recipes — the shared shape and the arithmetic.
//
// Dustin: "build a recipe builder for everyone… they can save to their library
// and submit to me to be approved for a public library fid use by everyone."
//
// One module for the maths and the rules so the builder, the API and the
// library all agree. The recurring failure in this app is the same fact
// computed twice and drifting; a recipe has three places that want its macros
// (the card, the builder footer, the saved row) and they must never disagree.

import { kcalOf as canonicalKcalOf } from "@/lib/nutrition/dailyTotals";
import { COACH_FIRST_NAME } from "./trainer";

export type RecipeVisibility = "private" | "submitted" | "public" | "rejected";
export type IngredientSource = "manual" | "database" | "ai";

export interface RecipeIngredient {
  food: string;
  amount: number | null;
  unit: string | null;
  protein: number;
  carbs: number;
  fats: number;
  food_id?: string | null;
  source?: IngredientSource;
  note?: string | null;
}

export interface RecipeInput {
  id?: string;
  title: string;
  description?: string | null;
  servings: number;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  instructions: string[];
  image_url?: string | null;
  tags?: string[];
  ingredients: RecipeIngredient[];
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * 4/4/9. Calories are a function of the macros, never a separately typed number.
 *
 * Delegates to the canonical implementation in `nutrition/dailyTotals` so there
 * is one formula in the codebase, not seven. The rounding belongs to THIS
 * module (recipe totals are stored as whole calories) and stays here — the
 * shared helper is deliberately exact so callers choose their own precision.
 */
export const kcalOf = (p: number, c: number, f: number) => Math.round(canonicalKcalOf(p, c, f));

/** What the whole pot contains. */
export function recipeTotals(ingredients: RecipeIngredient[]): Macros {
  let p = 0, c = 0, f = 0;
  for (const i of ingredients || []) {
    p += num(i.protein);
    c += num(i.carbs);
    f += num(i.fats);
  }
  p = Math.round(p * 10) / 10;
  c = Math.round(c * 10) / 10;
  f = Math.round(f * 10) / 10;
  return { kcal: kcalOf(p, c, f), protein: p, carbs: c, fats: f };
}

/**
 * What one serving contains.
 *
 * This is the number people actually log, so servings of 0 — or a stray "" out
 * of a text input — must never become a division by zero and print Infinity
 * calories at somebody.
 */
export function perServing(ingredients: RecipeIngredient[], servings: number): Macros {
  const t = recipeTotals(ingredients);
  const s = num(servings) > 0 ? num(servings) : 1;
  const p = Math.round((t.protein / s) * 10) / 10;
  const c = Math.round((t.carbs / s) * 10) / 10;
  const f = Math.round((t.fats / s) * 10) / 10;
  return { kcal: kcalOf(p, c, f), protein: p, carbs: c, fats: f };
}

/**
 * Is this fit to save? Returns the problems in the order a person would fix
 * them, so the builder can show one honest sentence rather than "invalid".
 */
export function validateRecipe(r: Partial<RecipeInput>): string[] {
  const problems: string[] = [];
  if (!r.title || !r.title.trim()) problems.push("Give it a name.");
  const ings = (r.ingredients || []).filter((i) => i && i.food && i.food.trim());
  if (!ings.length) problems.push("Add at least one ingredient.");
  if (!(num(r.servings) > 0)) problems.push("Servings has to be more than zero.");
  if (r.title && r.title.length > 120) problems.push("That name is too long.");
  return problems;
}

/** Drop blank rows and blank steps — a recipe should not save its own scaffolding. */
export function cleanRecipe(r: RecipeInput): RecipeInput {
  return {
    ...r,
    title: r.title.trim(),
    description: r.description?.trim() || null,
    instructions: (r.instructions || []).map((s) => s.trim()).filter(Boolean),
    tags: (r.tags || []).map((s) => s.trim().toLowerCase()).filter(Boolean),
    ingredients: (r.ingredients || [])
      .filter((i) => i && i.food && i.food.trim())
      .map((i) => ({
        food: i.food.trim(),
        amount: i.amount == null || !Number.isFinite(Number(i.amount)) ? null : Number(i.amount),
        unit: i.unit?.trim() || null,
        protein: num(i.protein),
        carbs: num(i.carbs),
        fats: num(i.fats),
        food_id: i.food_id ?? null,
        source: i.source ?? "manual",
        note: i.note?.trim() || null,
      })),
  };
}

/** Wording for each state, written for the person who owns the recipe. */
export function visibilityLabel(v: RecipeVisibility): { text: string; tone: "muted" | "wait" | "good" | "warn" } {
  switch (v) {
    case "submitted": return { text: `Waiting on ${COACH_FIRST_NAME}`, tone: "wait" };
    case "public":    return { text: "In the shared library", tone: "good" };
    case "rejected":  return { text: "Not published — still yours", tone: "warn" };
    default:          return { text: "Only you", tone: "muted" };
  }
}
