import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MealPlanClient from "../../nutrition/MealPlanClient";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function ClientPreviewNutritionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email !== TRAINER_EMAIL) redirect("/nutrition");

  // Fetch Dustin's own client record
  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name")
    .eq("email", TRAINER_EMAIL)
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
  const today = new Date().toISOString().split("T")[0];

  const [mpRes, tlRes, mtRes, wlRes] = await Promise.all([
    supabase
      .from("meal_plans")
      .select("id, version_number, meals(id, name, timing, position, swaps, meal_items(id, food, amount, unit, is_unlimited, protein, carbs, fats, position))")
      .eq("client_id", clientId)
      .eq("status", "live")
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

  return (
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
  );
}
