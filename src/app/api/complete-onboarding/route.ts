import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();

    // Use user's session to look up their client record (avoid admin PostgREST 403 issues)
    const { data: clientRec, error: lookupErr } = await supabase
      .from("clients")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
    if (!clientRec) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const updates: Record<string, any> = { onboarding_complete: true };
    if (body.phone) updates.phone = body.phone;
    if (body.date_of_birth) updates.date_of_birth = body.date_of_birth;
    if (body.primary_goal) updates.primary_goal = body.primary_goal;
    if (body.experience_level) updates.experience_level = body.experience_level;
    if (body.training_frequency) updates.training_frequency = Number(body.training_frequency);
    if (body.injuries_limitations) updates.injuries_limitations = body.injuries_limitations;
    if (body.current_weight) updates.current_weight = Number(body.current_weight);
    if (body.current_body_fat_pct) updates.current_body_fat_pct = Number(body.current_body_fat_pct);

    // Use supabase (user session) for UPDATE — covered by app_anon_all policy
    const { error: updateErr } = await supabase
      .from("clients")
      .update(updates)
      .eq("id", clientRec.id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    if (body.current_weight || body.current_body_fat_pct) {
      const w = body.current_weight ? Number(body.current_weight) : null;
      const bf = body.current_body_fat_pct ? Number(body.current_body_fat_pct) : null;
      const lean = (w && bf) ? +(w * (1 - bf / 100)).toFixed(1) : null;
      const fat = (w && bf) ? +(w * (bf / 100)).toFixed(1) : null;
      const admin = createAdminClient();
      await admin.from("metrics").insert({
        client_id: clientRec.id,
        metric_date: new Date().toISOString().split("T")[0],
        weight: w, body_fat_pct: bf, lean_mass: lean, fat_mass: fat,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
