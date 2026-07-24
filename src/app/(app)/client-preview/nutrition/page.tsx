import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MealPlanClient from "../../nutrition/MealPlanClient";
import NutritionV3Client from "../../nutrition/v3/NutritionV3Client";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function ClientPreviewNutritionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email !== TRAINER_EMAIL) redirect("/nutrition");

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

  const [mpRes, tlRes, mtRes, wlRes] = await Promise.all([
    supabase
      .from("meal_plans")
      .select("id, version_number, title, meals(id, name, timing, position, swaps, meal_items(id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position))")
      .eq("client_id", clientId)
      .eq("status", "live")
      .lte("effective_date", today)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
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
      .gte("log_date", new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0])
      .order("log_date", { ascending: false }),
  ]);

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
        mealPlan={mpRes.data as any}
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
        mealPlan={mpRes.data as any}
        todayLogs={tlRes.data || []}
        macroTarget={mtRes.data as any}
        weekLogs={wlRes.data || []}
        today={today}
        isTrainer={false}
      />
    </>
  );
}
