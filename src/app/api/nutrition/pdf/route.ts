// POST /api/nutrition/pdf — server-generated Grocery / Meal-Prep PDF.
//
// The Capacitor Android WebView has no native file/share plugins, so emitting a
// blob/File from inside the app is a silent no-op. Instead the server builds the
// PDF (jsPDF, Node runtime), uploads it to the public 'exports' storage bucket,
// and returns a public URL. The app then copies the link (clipboard works in his
// WebView) and opens it in the system browser.
//
// Body: { clientId, kind: 'grocery' | 'prep', days, startDate }
// Returns: { url } | { error }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlanMeal } from "@/lib/nutrition/dailyTotals";
import { PdfCtx } from "@/lib/nutrition/pdf";
import { buildAndUploadPdf, StorageLike } from "@/lib/nutrition/pdfExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const clientId = typeof body?.clientId === "string" ? body.clientId : "";
    const kind = body?.kind === "prep" ? "prep" : body?.kind === "grocery" ? "grocery" : null;
    if (!clientId || !kind) return NextResponse.json({ error: "Missing clientId or kind." }, { status: 400 });
    const days = Math.max(1, Math.min(14, parseInt(String(body?.days ?? 7), 10) || 7));
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const startISO = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.startDate || "")) ? String(body.startDate) : today;

    // Authorize: trainer, or the signed-in client viewing their own plan.
    const isTrainer = user.email === TRAINER_EMAIL;
    if (!isTrainer) {
      const { data: c } = await sb.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
      if (!c || (c as { id: string }).id !== clientId) {
        return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      }
    }

    // Service-role client for data + storage (bypasses RLS).
    const admin = createAdminClient();
    const [clientRes, planRes, targetRes] = await Promise.all([
      admin.from("clients").select("name").eq("id", clientId).maybeSingle(),
      admin
        .from("meal_plans")
        .select("id, version_number, effective_date, meals(id, name, timing, position, swaps, meal_items(id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position))")
        .eq("client_id", clientId).eq("status", "live").lte("effective_date", today)
        .order("effective_date", { ascending: false }).limit(1).maybeSingle(),
      admin.from("macro_targets").select("calories, protein, carbs, fats").eq("client_id", clientId)
        .lte("effective_date", today).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const clientName = (clientRes.data as { name?: string } | null)?.name || "Client";
    const plan = planRes.data as { id: string; version_number: number | null; meals: PlanMeal[] } | null;
    const target = targetRes.data as { calories: number; protein: number; carbs: number; fats: number } | null;
    const meals: PlanMeal[] = [...(plan?.meals || [])].sort((a, b) => a.position - b.position);

    const ctx: PdfCtx = {
      clientName,
      planLabel: plan ? `plan v${plan.version_number ?? "—"}` : "—",
      meals, target, startISO, days, todayISO: today,
    };

    const url = await buildAndUploadPdf(admin.storage as unknown as StorageLike, clientId, kind, ctx);
    return NextResponse.json({ url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("nutrition/pdf failed:", msg);
    return NextResponse.json({ error: `Couldn't build the PDF — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}
