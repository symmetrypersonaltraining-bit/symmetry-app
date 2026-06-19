import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MealPlanClient from "./MealPlanClient";

export default async function NutritionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, first_name")
    .eq("email", user.email)
    .maybeSingle();

  if (!clientRecord) return (
    <div className="p-6 text-center" style={{ color: "var(--brand-text-secondary)" }}>
      No client record found.
    </div>
  );

  const today = new Date().toISOString().split("T")[0];

  // Active meal plan
  const { data: mealPlan } = await supabase
    .from("meal_plans")
    .select("id, version_number, meals(id, name, timing, position, swaps, meal_items(id, food, amount, unit, is_unlimited, protein, carbs, fats, position))")
    .eq("client_id", clientRecord.id)
    .eq("status", "active")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Today's adherence logs
  const { data: todayLogs } = await supabase
    .from("meal_adherence_logs")
    .select("*")
    .eq("client_id", clientRecord.id)
    .eq("log_date", today);

  // Latest macro targets
  const { data: macroTarget } = await supabase
    .from("macro_targets")
    .select("*")
    .eq("client_id", clientRecord.id)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Last 7 days adherence for summary
  const { data: weekLogs } = await supabase
    .from("meal_adherence_logs")
    .select("log_date, adherence")
    .eq("client_id", clientRecord.id)
    .gte("log_date", new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0])
    .order("log_date", { ascending: false });

  return (
    <MealPlanClient
      clientId={clientRecord.id}
      clientName={clientRecord.first_name}
      mealPlan={mealPlan as any}
      todayLogs={(todayLogs || []) as any[]}
      macroTarget={macroTarget as any}
      weekLogs={(weekLogs || []) as any[]}
      today={today}
    />
  );
}
