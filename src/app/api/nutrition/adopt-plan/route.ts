// POST /api/nutrition/adopt-plan — a v3 client adopts a self-built plan.
//
// Archives the client's current live plan(s) (non-destructive: status='archived',
// still in the timeline + restorable) and installs the new one (meals + items +
// macro_targets), marking it created_by_client=true. Used by BOTH the open-plan
// "save my built day" and the plan-client "switch to my AI plan" flows. Routed
// through the server with the service-role client because clients can't archive
// trainer-authored rows under RLS.
//
// Body: { clientId, title, effectiveDate?, targets:{calories,protein,carbs,fats},
//         meals:[{name,timing,items:[{food,amount,unit,basis,protein,carbs,fats,is_unlimited,kcal?,micros?}]}],
//         source:'ai'|'manual' }
// Returns: { planId } | { error }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adoptPlan, AdoptDb, AdoptMealInput } from "@/lib/nutrition/adoptPlan";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { planIsLocked, lockedPlanMessage } from "@/lib/nutrition/planLock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Supabase admin client → AdoptDb adapter.
function makeDb(admin: ReturnType<typeof createAdminClient>): AdoptDb {
  return {
    async archiveLivePlans(clientId) {
      // Only plans already IN FORCE. A client adopting a plan today does not
      // cancel one their trainer scheduled to start next Monday — that plan has
      // not begun, so there is nothing here for it to supersede. Without the
      // date bound, a single tap on "switch to my AI plan" quietly retired
      // every future plan booked for them, and the trainer would find out weeks
      // later when the menu never changed.
      const ctToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const { error } = await admin.from("meal_plans").update({ status: "archived" })
        .eq("client_id", clientId)
        .in("status", ["live", "pending"])
        .lte("effective_date", ctToday);
      if (error) throw new Error(error.message);
    },
    async maxVersion(clientId) {
      const { data } = await admin.from("meal_plans").select("version_number").eq("client_id", clientId).order("version_number", { ascending: false }).limit(1).maybeSingle();
      return (data as { version_number?: number } | null)?.version_number || 0;
    },
    async insertPlan(row) {
      const { data, error } = await admin.from("meal_plans").insert(row).select("id").single();
      if (error || !data) throw new Error(error?.message || "Plan insert failed");
      return (data as { id: string }).id;
    },
    async insertMeal(row) {
      const { data, error } = await admin.from("meals").insert(row).select("id").single();
      if (error || !data) throw new Error(error?.message || "Meal insert failed");
      return (data as { id: string }).id;
    },
    async insertMealItems(rows) {
      if (!rows.length) return;
      const { error } = await admin.from("meal_items").insert(rows);
      if (error) throw new Error(error.message);
    },
    async insertMacroTarget(row) {
      const { error } = await admin.from("macro_targets").insert(row);
      if (error) throw new Error(error.message);
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const clientId = typeof body?.clientId === "string" ? body.clientId : "";
    if (!clientId) return NextResponse.json({ error: "Missing clientId." }, { status: 400 });
    const meals = Array.isArray(body?.meals) ? (body.meals as AdoptMealInput[]) : [];
    if (!meals.length) return NextResponse.json({ error: "Plan has no meals." }, { status: 400 });
    const targets = body?.targets && typeof body.targets === "object" ? body.targets : null;
    if (!targets) return NextResponse.json({ error: "Missing targets." }, { status: 400 });

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.effectiveDate || "")) ? String(body.effectiveDate) : today;
    const title = (typeof body?.title === "string" && body.title.trim()) ? body.title.trim() : "My Plan";
    const source = body?.source === "manual" ? "manual" : "ai";

    // Authorize: trainer, or the signed-in client acting on their own record.
    const isTrainer = await viewerIsTrainer(sb, user);
    if (!isTrainer) {
      const { data: c } = await sb.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
      if (!c || (c as { id: string }).id !== clientId) {
        return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      }
    }

    const admin = createAdminClient();

    // A plan authored outside the app cannot be adopted over. The database
    // refuses it regardless; this turns the refusal into a readable answer.
    if (await planIsLocked(admin, clientId)) {
      return NextResponse.json({ error: lockedPlanMessage() }, { status: 409 });
    }
    const planId = await adoptPlan(makeDb(admin), {
      clientId, title, effectiveDate,
      targets: {
        calories: Number(targets.calories) || 0,
        protein: Number(targets.protein) || 0,
        carbs: Number(targets.carbs) || 0,
        fats: Number(targets.fats) || 0,
      },
      meals, source,
    });

    return NextResponse.json({ planId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("nutrition/adopt-plan failed:", msg);
    return NextResponse.json({ error: `Couldn't switch plans — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}
