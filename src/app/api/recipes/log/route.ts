// POST /api/recipes/log — eat what you cooked.
//
// A recipe nobody can log is a document. The macros were already in the right
// shape for this: the recipe stores what the whole pot contains, servings says
// how many it makes, and one serving is the thing a person actually eats.
//
// LOGGED AS ONE LINE, not as its ingredients. "Turkey chili — 1 serving" is
// what somebody wants to see in their day; the same entry expanded into "0.25
// onion, 0.13 tbsp olive oil, 4 oz ground turkey" is technically the same
// number and unreadable. The ingredients are a click away on the recipe itself.
//
// It lands in the same shape the manual "add an extra" flow writes — Off-plan
// with est_* macros and a __custom block — so the day total, the ring, the
// adherence percentage and the coach all treat it exactly like any other
// logged extra. A second write path that produced a slightly different row is
// how nutrition numbers start disagreeing with each other.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { perServing } from "@/lib/recipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const r0 = (n: number) => Math.round(Number(n) || 0);

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { recipeId?: string; servings?: number; date?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  if (!body.recipeId) return NextResponse.json({ error: "Missing recipeId" }, { status: 400 });

  // How much of it they ate. A blank or nonsense box means one serving rather
  // than zero — logging nothing is never what the button meant.
  const eaten = Number(body.servings);
  const howMany = Number.isFinite(eaten) && eaten > 0 ? Math.min(eaten, 20) : 1;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date! : CT_TODAY();

  let clientId: string | null = null;
  {
    const { data: c } = await sb.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
    clientId = (c as { id: string } | null)?.id ?? null;
    if (!clientId && user.email) {
      const { data: c2 } = await sb.from("clients").select("id").eq("email", user.email).maybeSingle();
      clientId = (c2 as { id: string } | null)?.id ?? null;
    }
  }
  if (!clientId) return NextResponse.json({ error: "No client profile" }, { status: 400 });

  const admin = createAdminClient();

  const { data: recRow } = await admin
    .from("recipes")
    .select("id, client_id, title, servings, visibility")
    .eq("id", body.recipeId)
    .maybeSingle();
  const rec = recRow as { id: string; client_id: string | null; title: string; servings: number; visibility: string } | null;
  if (!rec) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  // Yours, or in the shared library. Nothing else is readable, and logging is a
  // read of somebody's recipe.
  if (rec.visibility !== "public" && rec.client_id !== clientId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: ingRows } = await admin
    .from("recipe_ingredients").select("protein, carbs, fats, source").eq("recipe_id", rec.id);
  const ings = (ingRows as { protein: number; carbs: number; fats: number; source: string }[]) || [];
  if (!ings.length) return NextResponse.json({ error: "That recipe has no ingredients yet" }, { status: 400 });

  const per = perServing(ings.map((i) => ({ food: "", amount: null, unit: null, protein: Number(i.protein), carbs: Number(i.carbs), fats: Number(i.fats) })), Number(rec.servings));
  const p = Math.round(per.protein * howMany * 10) / 10;
  const c = Math.round(per.carbs * howMany * 10) / 10;
  const f = Math.round(per.fats * howMany * 10) / 10;
  const kcal = r0(p * 4 + c * 4 + f * 9);
  // If any ingredient was a model's estimate, so is this entry. The marker
  // rides along rather than being laundered out by the trip through a recipe.
  const est = ings.some((i) => i.source === "ai");

  // A free slot in the quick-log band. Plan meals live at 1..N, so 101+ can
  // never overwrite one — the same rule the in-app "add an extra" uses.
  const { data: dayLogs } = await admin
    .from("meal_adherence_logs").select("meal_position").eq("client_id", clientId).eq("log_date", date);
  const taken = new Set(((dayLogs as { meal_position: number }[]) || []).map((l) => l.meal_position));
  let position = 101;
  while (taken.has(position)) position++;

  const label = `${rec.title}${howMany === 1 ? "" : ` × ${howMany}`}`;
  const { error } = await admin.from("meal_adherence_logs").insert({
    client_id: clientId,
    log_date: date,
    meal_position: position,
    meal_id: null,
    adherence: "Off-plan",
    est_kcal: kcal, est_protein: r0(p), est_carbs: r0(c), est_fats: r0(f),
    off_plan_details: label,
    macros_pending: false,
    item_overrides: {
      __custom: {
        name: label,
        kind: "extra",
        items: [{
          n: rec.title,
          a: `${howMany} serving${howMany === 1 ? "" : "s"}`,
          p, c, f, k: kcal, est,
        }],
      },
    },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, date, position, macros: { kcal, protein: p, carbs: c, fats: f } });
}
