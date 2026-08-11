import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MealPlanClient from "../../nutrition/MealPlanClient";
import NutritionV3Client from "../../nutrition/v3/NutritionV3Client";
import { fetchLivePlans, pickPlanForDate } from "@/lib/nutrition/resolvePlan";
import { isTrainerEmail } from "@/lib/trainer";

export default async function ClientPreviewNutritionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isTrainerEmail(user.email)) redirect("/nutrition");

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name")
    .ilike("name", "%Dustin%")
    .maybeSingle();

  if (!clientRecord) {
    return (
      <div className="p-6 text-center" style={{ color: "var(--brand-text-secondary)" }}>
        No client record found for your account.
      </div>
    );
  }

  const clientId = clientRecord.id;
  const clientName = clientRecord.name || "Dustin";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  // Central, not UTC: derive the 7-day floor from the Central date, not Date.now() in UTC.
  const weekFloor = (() => {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 7);
    return dt.toISOString().slice(0, 10);
  })();

  // Feature flag: client_app_settings.nutrition_v3 → new one-tap logger (same as /nutrition).
  let nutritionV3 = false;
  try {
    const { data: settings } = await supabase
      .from("client_app_settings")
      .select("nutrition_v3")
      .eq("client_id", clientId)
      .maybeSingle();
    nutritionV3 = (settings as any)?.nutrition_v3 === true;
  } catch { nutritionV3 = false; }

  const [livePlans, tlRes, mtRes, wlRes] = await Promise.all([
    // Full live-plan SET (day-group tagged + everyday). pickPlanForDate resolves
    // the governing menu; one null-day_group plan → today's behavior unchanged.
    // lookahead 0 — the preview renders a single day, so there is no reason to
        // ship it eight weeks of plans it will filter straight back out.
        fetchLivePlans(supabase, clientId, today, undefined, 0),
    supabase
      .from("meal_adherence_logs")
      .select("*")
      .eq("client_id", clientId)
      .eq("log_date", today),
    supabase
      .from("macro_targets")
      .select("*")
      .eq("client_id", clientId)
      .lte("effective_date", today)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meal_adherence_logs")
      .select("log_date, adherence")
      .eq("client_id", clientId)
      .gte("log_date", weekFloor)
      .order("log_date", { ascending: false }),
  ]);

  const mealPlanToday = pickPlanForDate(livePlans, today);

  if (nutritionV3) {
    const { data: inc } = await supabase
      .from("meal_plans")
      .select("id, version_number, effective_date, change_reason, title")
      .eq("client_id", clientId)
      .gt("effective_date", today)
      .order("effective_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    return (
      <NutritionV3Client
        clientId={clientId}
        clientName={clientName}
        mealPlan={mealPlanToday as any}
        livePlans={livePlans as any}
        incomingPlan={(inc || null) as any}
        todayLogs={tlRes.data || []}
        macroTarget={mtRes.data as any}
        today={today}
        isTrainer={false}
      />
    );
  }

  return (
    <>
      <div style={{ background: "var(--brand-primary)" }} className="px-4 py-4">
        <h1 className="text-white font-semibold text-lg">Nutrition</h1>
        <p className="text-white/60 text-sm">{clientName}</p>
      </div>
      <MealPlanClient
        clientId={clientId}
        clientName={clientName}
        mealPlan={mealPlanToday as any}
        todayLogs={tlRes.data || []}
        macroTarget={mtRes.data as any}
        weekLogs={wlRes.data || []}
        today={today}
        isTrainer={false}
      />
    </>
  );
}
