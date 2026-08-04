// POST /api/nutrition/plan-edit — a client makes one of their plan edits stick.
//
// Dustin: "can clients edit current meal plans to be saved? if not lets make
// that happen so he can edit and save what he wants."
//
// Until now "Adjust / edit this meal" only ever wrote item_overrides onto that
// day's log. Tomorrow the plan said the same thing it said yesterday, so anyone
// whose real breakfast differs from the prescription re-typed it every single
// morning. Jerry did, for two weeks, before asking for egg whites to be added.
//
// TWO CASES, and the difference is who authored the plan:
//
//   Already theirs (created_by_client) → edit the meal in place. A new version
//   for every tweak would bury the timeline in noise.
//
//   The trainer's → CLONE the whole plan first, mark the copy created_by_client,
//   archive the original, and apply the edit to the copy. Dustin's prescription
//   is never mutated and never lost; it stays in the timeline, restorable, and
//   the client's version is clearly badged BUILT BY YOU.
//
// The clone copies meals with their POSITIONS intact, which is the reason this
// is not just a call to adoptPlan(): that function renumbers meals 1..N, and a
// rotation plan (Jerry has five options at each of five slots — 24 meals across
// 5 positions) would come out the other side as 24 separate meals of the day.
//
// Runs with the service-role client because a client cannot archive
// trainer-authored rows under RLS, and cannot write meal rows on a plan that is
// not already theirs. Every write here is still scoped to the caller's own
// client id, verified from the session below.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveEditedItems, PlanItemLike } from "@/lib/nutrition/planEdit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { mealId?: string; overrides?: Record<string, unknown> | null; items?: { food: string; amount?: number | null; unit?: string | null; protein?: number; carbs?: number; fats?: number }[] };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
    const mealId = body.mealId;
    if (!mealId) return NextResponse.json({ error: "Missing mealId" }, { status: 400 });

    // Whose account is this. Never taken from the body.
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

    // The meal, its plan, and the check that the plan is actually theirs.
    const { data: mealRow } = await admin
      .from("meals")
      .select("id, meal_plan_id, name, timing, position, meal_plan:meal_plans(id, client_id, created_by_client, status, title, version_number)")
      .eq("id", mealId)
      .maybeSingle();
    const meal = mealRow as {
      id: string; meal_plan_id: string; name: string; timing: string | null; position: number;
      meal_plan: { id: string; client_id: string; created_by_client: boolean | null; status: string | null; title: string | null; version_number: number | null };
    } | null;
    if (!meal || !meal.meal_plan) return NextResponse.json({ error: "Meal not found" }, { status: 404 });
    if (meal.meal_plan.client_id !== clientId) return NextResponse.json({ error: "Not your plan" }, { status: 403 });

    // What the meal becomes, computed from the plan's own rows — never from
    // numbers the browser sent.
    const { data: itemRows } = await admin
      .from("meal_items")
      .select("id, food, amount, unit, basis, protein, carbs, fats, is_unlimited, position")
      .eq("meal_id", meal.id)
      .order("position");
    // A recipe replaces the meal outright: its own ingredients ARE the new
    // items, so there is nothing to fold overrides into. Everything else
    // (the day's adjustments) goes through resolveEditedItems.
    const edited = Array.isArray(body.items) && body.items.length
      ? body.items.slice(0, 40).map((i) => ({
          food: String(i.food || "").slice(0, 120),
          amount: i.amount == null || !Number.isFinite(Number(i.amount)) ? null : Number(i.amount),
          unit: i.unit ? String(i.unit).slice(0, 24) : null,
          basis: null,
          protein: Math.round(Number(i.protein) || 0),
          carbs: Math.round(Number(i.carbs) || 0),
          fats: Math.round(Number(i.fats) || 0),
          is_unlimited: false,
        })).filter((i) => i.food)
      : resolveEditedItems((itemRows as PlanItemLike[]) || [], body.overrides || null);
    if (!edited.length) return NextResponse.json({ error: "That would leave the meal empty" }, { status: 400 });

    let targetPlanId = meal.meal_plan_id;
    let targetMealId = meal.id;
    let cloned = false;

    if (!meal.meal_plan.created_by_client) {
      // ── Clone the trainer's plan, positions and all ──────────────────────
      const { data: maxRow } = await admin
        .from("meal_plans").select("version_number").eq("client_id", clientId)
        .order("version_number", { ascending: false }).limit(1).maybeSingle();
      const nextVersion = ((maxRow as { version_number?: number } | null)?.version_number || 0) + 1;

      const { data: newPlan, error: planErr } = await admin.from("meal_plans").insert({
        client_id: clientId,
        version_number: nextVersion,
        effective_date: CT_TODAY(),
        status: "live",
        title: meal.meal_plan.title,
        change_reason: "Edited by client",
        created_by_client: true,
      }).select("id").single();
      if (planErr || !newPlan) return NextResponse.json({ error: planErr?.message || "Could not save" }, { status: 500 });
      targetPlanId = (newPlan as { id: string }).id;
      cloned = true;

      const { data: allMeals } = await admin
        .from("meals").select("id, name, timing, position, swaps, rotation")
        .eq("meal_plan_id", meal.meal_plan_id).order("position");
      const src = (allMeals as { id: string; name: string; timing: string | null; position: number; swaps: string | null; rotation: unknown }[]) || [];

      for (const m of src) {
        const { data: copy } = await admin.from("meals").insert({
          meal_plan_id: targetPlanId,
          name: m.name, timing: m.timing, position: m.position, swaps: m.swaps, rotation: m.rotation,
        }).select("id").single();
        const copyId = (copy as { id: string } | null)?.id;
        if (!copyId) continue;
        if (m.id === meal.id) targetMealId = copyId;

        if (m.id === meal.id) {
          await admin.from("meal_items").insert(edited.map((it, i) => ({ meal_id: copyId, ...it, position: i + 1 })));
        } else {
          const { data: its } = await admin
            .from("meal_items").select("food, amount, unit, basis, protein, carbs, fats, is_unlimited, position")
            .eq("meal_id", m.id).order("position");
          const rows = (its as Record<string, unknown>[]) || [];
          if (rows.length) await admin.from("meal_items").insert(rows.map((r) => ({ ...r, meal_id: copyId })));
        }
      }

      // Only once the copy is whole. An archive that ran first and then failed
      // would leave the client with no live plan at all.
      await admin.from("meal_plans").update({ status: "archived" })
        .eq("client_id", clientId).eq("status", "live").neq("id", targetPlanId);
    } else {
      // ── Already their plan: replace this meal's items in place ───────────
      await admin.from("meal_items").delete().eq("meal_id", targetMealId);
      const { error: insErr } = await admin
        .from("meal_items").insert(edited.map((it, i) => ({ meal_id: targetMealId, ...it, position: i + 1 })));
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, planId: targetPlanId, mealId: targetMealId, cloned, items: edited.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed" }, { status: 500 });
  }
}
