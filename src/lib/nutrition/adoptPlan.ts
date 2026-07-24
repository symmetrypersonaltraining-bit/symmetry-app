// Nutrition v3 — adopt-plan core. Archives the client's current live plan(s)
// and installs a new one (meals + items + macro_targets), non-destructively:
// the old plan is only set status='archived' so it stays in the timeline and is
// restorable. Runs server-side with the service-role client (clients can't
// archive trainer-authored rows under RLS, which is why this goes through the
// server). Pure orchestration over an injectable DB adapter so it is unit-testable.

export interface AdoptItemInput {
  food: string;
  amount: number | null;
  unit: string | null;
  basis?: string | null;
  protein: number;
  carbs: number;
  fats: number;
  is_unlimited?: boolean;
}
export interface AdoptMealInput {
  name: string;
  timing: string | null;
  items: AdoptItemInput[];
}
export interface AdoptParams {
  clientId: string;
  title: string;
  effectiveDate: string; // YYYY-MM-DD
  targets: { calories: number; protein: number; carbs: number; fats: number };
  meals: AdoptMealInput[];
  source: "ai" | "manual";
}

// Minimal DB surface adoptPlan needs — implemented over the supabase admin
// client in the route, faked in tests.
export interface AdoptDb {
  archiveLivePlans(clientId: string): Promise<void>;
  maxVersion(clientId: string): Promise<number>;
  insertPlan(row: {
    client_id: string; version_number: number; effective_date: string; status: string;
    title: string; change_reason: string; created_by_client: boolean;
  }): Promise<string>; // returns new plan id
  insertMeal(row: { meal_plan_id: string; name: string; timing: string | null; position: number; swaps: string | null }): Promise<string>; // returns meal id
  insertMealItems(rows: Array<{
    meal_id: string; food: string; amount: number; unit: string; is_unlimited: boolean;
    basis: string | null; protein: number; carbs: number; fats: number; position: number;
  }>): Promise<void>;
  insertMacroTarget(row: { client_id: string; effective_date: string; calories: number; protein: number; carbs: number; fats: number; rationale: string }): Promise<void>;
}

const rnd = (n: number) => Math.round(Number(n) || 0);

// basis must be only 'cooked' / 'raw' / null — never an amount string.
export function sanitizeBasis(b: unknown): string | null {
  return b === "cooked" || b === "raw" ? b : null;
}

export async function adoptPlan(db: AdoptDb, params: AdoptParams): Promise<string> {
  const { clientId, title, effectiveDate, targets, meals, source } = params;
  if (!clientId) throw new Error("Missing clientId");
  if (!Array.isArray(meals) || meals.length === 0) throw new Error("Plan has no meals");

  // (a) archive current live plan(s) — preserved + restorable.
  await db.archiveLivePlans(clientId);

  // (b) insert the new live plan.
  const nextVersion = (await db.maxVersion(clientId)) + 1;
  const planId = await db.insertPlan({
    client_id: clientId,
    version_number: nextVersion,
    effective_date: effectiveDate,
    status: "live",
    title,
    change_reason: source === "ai" ? "Built by client with AI" : "Built by client",
    created_by_client: true,
  });

  // (c) insert meals + items.
  for (let i = 0; i < meals.length; i++) {
    const m = meals[i];
    const mealId = await db.insertMeal({
      meal_plan_id: planId,
      name: m.name || `Meal ${i + 1}`,
      timing: m.timing ?? null,
      position: i + 1,
      swaps: null,
    });
    const items = (m.items || []).map((it, j) => ({
      meal_id: mealId,
      food: it.food,
      amount: it.amount ?? 1,
      unit: it.unit || "serving",
      is_unlimited: !!it.is_unlimited,
      basis: sanitizeBasis(it.basis),
      protein: rnd(it.protein),
      carbs: rnd(it.carbs),
      fats: rnd(it.fats),
      position: j + 1,
    }));
    if (items.length) await db.insertMealItems(items);
  }

  // (d) insert macro_targets effective from the same date.
  await db.insertMacroTarget({
    client_id: clientId,
    effective_date: effectiveDate,
    calories: rnd(targets.calories),
    protein: rnd(targets.protein),
    carbs: rnd(targets.carbs),
    fats: rnd(targets.fats),
    rationale: "Client-built plan",
  });

  return planId;
}
