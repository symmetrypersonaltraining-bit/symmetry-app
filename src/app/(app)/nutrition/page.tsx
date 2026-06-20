import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MealPlanClient from "./MealPlanClient";
import ClientSelector from "@/components/ClientSelector";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === TRAINER_EMAIL;
  const params = await searchParams;

  let clientId: string | null = null;
  let clientName = "";
  let allClients: { id: string; name: string }[] = [];

  if (isTrainer) {
    // Fetch all clients for dropdown
    const { data: clientList } = await supabase
      .from("clients")
      .select("id, name")
      .order("name");
    allClients = clientList || [];

    if (params.clientId) {
      const found = allClients.find((c) => c.id === params.clientId);
      clientId = params.clientId;
      clientName = found?.name || "Client";
    }
    // No default — trainer must pick a client
  } else {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    clientId = data?.id || null;
    clientName = data?.name || "You";

    if (!clientId) {
      return (
        <div className="p-6 text-center" style={{ color: "var(--brand-text-secondary)" }}>
          No client record found.
        </div>
      );
    }
  }

  const today = new Date().toISOString().split("T")[0];

  let mealPlan: any = null;
  let todayLogs: any[] = [];
  let macroTarget: any = null;
  let weekLogs: any[] = [];

  if (clientId) {
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

    mealPlan = mpRes.data;
    todayLogs = tlRes.data || [];
    macroTarget = mtRes.data;
    weekLogs = wlRes.data || [];
  }

  if (isTrainer && !clientId) {
    return (
      <>
        <div style={{ background: "#0F4C81" }} className="px-4 py-4">
          <h1 className="text-white font-medium text-lg">Nutrition</h1>
          <div className="mt-2">
            <ClientSelector clients={allClients} selectedId={null} label="Client" />
          </div>
        </div>
        <div className="card text-center py-16 mt-4">
          <i className="ti ti-salad" style={{ fontSize: 56, color: "var(--brand-border)", display: "block", marginBottom: 16 }} />
          <p className="font-semibold text-lg mb-2" style={{ color: "var(--brand-text)" }}>No client selected</p>
          <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
            Choose a client from the dropdown above to view their meal plan, macros, and adherence log.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {isTrainer && (
        <div style={{ background: "#0F4C81" }} className="px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-white font-medium text-lg">Nutrition</h1>
            <ClientSelector clients={allClients} selectedId={clientId} label="Client" />
          </div>
        </div>
      )}
      <MealPlanClient
        clientId={clientId!}
        clientName={clientName}
        mealPlan={mealPlan as any}
        todayLogs={todayLogs}
        macroTarget={macroTarget as any}
        weekLogs={weekLogs}
        today={today}
        isTrainer={isTrainer}
      />
    </>
  );
}
