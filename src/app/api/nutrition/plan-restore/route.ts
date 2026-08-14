// POST /api/nutrition/plan-restore — put an archived plan version back.
//
// The version timeline has said "restorable anytime" since it was built, and it
// was not true: there was no button and no route. Claudine found the gap the
// hard way on 13 Aug — one tap on a recipe replaced a meal in her plan for
// good, and there was no way back to the version she had five seconds earlier.
// A promise in UI copy is a promise.
//
// It archives the live plan(s) it displaces rather than deleting anything, so
// restore is itself undoable: the version you just left is now the archived one
// sitting directly above it in the list.
//
// Only plans WITH THE SAME day_group are displaced. A client on a weekday /
// weekend split has two live plans at once, and restoring last month's weekday
// menu must not take their Saturday menu down with it.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTrainerEmail } from "@/lib/trainer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same weekday coverage? null and [] both mean "everyday". */
function sameDayGroup(a: number[] | null | undefined, b: number[] | null | undefined): boolean {
  const norm = (x: number[] | null | undefined) => [...(x || [])].sort((p, q) => p - q).join(",");
  return norm(a) === norm(b);
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { planId?: string };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
    if (!body.planId) return NextResponse.json({ error: "Missing planId" }, { status: 400 });

    let ownClientId: string | null = null;
    {
      const { data: c } = await sb.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
      ownClientId = (c as { id: string } | null)?.id ?? null;
      if (!ownClientId && user.email) {
        const { data: c2 } = await sb.from("clients").select("id").eq("email", user.email).maybeSingle();
        ownClientId = (c2 as { id: string } | null)?.id ?? null;
      }
    }
    const isTrainer = isTrainerEmail(user.email);

    const admin = createAdminClient();
    const { data: p } = await admin
      .from("meal_plans")
      .select("id, client_id, status, day_group, version_number")
      .eq("id", body.planId)
      .maybeSingle();
    const plan = p as { id: string; client_id: string; status: string; day_group: number[] | null; version_number: number | null } | null;
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    if (!isTrainer && plan.client_id !== ownClientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (plan.status === "live") return NextResponse.json({ ok: true, alreadyLive: true });

    // Archive first would be wrong for the same reason it is wrong in
    // plan-edit: a failure between the two writes must not leave somebody with
    // no live plan. Promote, then displace.
    const { error: upErr } = await admin
      .from("meal_plans")
      .update({ status: "live", change_reason: "Restored by client" })
      .eq("id", plan.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: others } = await admin
      .from("meal_plans")
      .select("id, day_group")
      .eq("client_id", plan.client_id)
      .eq("status", "live")
      .neq("id", plan.id);
    const displace = ((others as { id: string; day_group: number[] | null }[] | null) || [])
      .filter((o) => sameDayGroup(o.day_group, plan.day_group))
      .map((o) => o.id);
    if (displace.length) {
      await admin.from("meal_plans").update({ status: "archived" }).in("id", displace);
    }

    return NextResponse.json({ ok: true, planId: plan.id, displaced: displace.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed" }, { status: 500 });
  }
}
