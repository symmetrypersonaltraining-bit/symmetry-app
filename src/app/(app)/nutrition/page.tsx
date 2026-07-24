import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import MealPlanClient from "./MealPlanClient";
import NutritionV3Client from "./v3/NutritionV3Client";
import NutritionAverages from "@/components/NutritionAverages";
import AveragesStrip from "@/components/nutrition/AveragesStrip";
import ClientSelector from "@/components/ClientSelector";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

async function isClientMode(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("symmetry_client_mode")?.value === "1";
}

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === TRAINER_EMAIL;
  const inClientMode = await isClientMode();
  const sp = await searchParams;

  let clientId: string | null = sp?.clientId ?? null;
  let clientName = "";
  let allClients: { id: string; name: string }[] = [];

  if (isTrainer) {
    // Fetch all clients for dropdown
    const { data: clientList } = await supabase
      .from("clients")
      .select("id, name")
      .order("name");
    allClients = clientList || [];

    if (!clientId) {
      if (inClientMode) {
        // Trainer is viewing their own client app — look up trainer's own client record by email
        const { data: clientRow } = await supabase
          .from("clients")
          .select("id, name")
          .eq("email", user.email!)
          .maybeSingle();
        clientId = clientRow?.id ?? null;
        clientName = clientRow?.name ?? "You";
      }
      // else: trainer NOT in client mode, no clientId from URL → show picker below
    } else {
      const found = allClients.find((c) => c.id === clientId);
      clientName = found?.name || "Client";
    }
  } else {
    // Regular client
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

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  let mealPlan: any = null;
  let todayLogs: any[] = [];
  let macroTarget: any = null;
  let weekLogs: any[] = [];
  let nutritionV3 = false;
  let incomingPlan: any = null;

  if (clientId) {
    // Feature flag: client_app_settings.nutrition_v3 → new one-tap logger.
    // Tolerates the column not existing yet (flag stays off, old UI renders).
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
        .select("id, version_number, meals(id, name, timing, position, swaps, meal_items(id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position))")
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

    mealPlan = mpRes.data;
    todayLogs = tlRes.data || [];
    macroTarget = mtRes.data;
    weekLogs = wlRes.data || [];

    if (nutritionV3) {
      // Staged/incoming plan (effective in the future) for the banner.
      const { data: inc } = await supabase
        .from("meal_plans")
        .select("id, version_number, effective_date, change_reason, title")
        .eq("client_id", clientId)
        .gt("effective_date", today)
        .order("effective_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      incomingPlan = inc || null;
    }
  }

  // Trainer NOT in client mode and no clientId from URL → show picker
  if (isTrainer && !inClientMode && !clientId) {
    return (
      <>
        <div style={{ background: "#0F4C81" }} className="px-4 py-4">
          <h1 className="text-white font-medium text-lg">Nutrition</h1>
          <div className="mt-2">
            <ClientSelector clients={allClients} selectedId={null} label="Client" />
          </div>
        </div>
        <div className="p-8 text-center" style={{ color: "var(--brand-text-secondary)" }}>
          Select a client above to view their meal plan.
        </div>
      </>
    );
  }

  if (!clientId) redirect("/home");

  return (
    <>
      {isTrainer && !inClientMode && (
        <div style={{ background: "#0F4C81" }} className="px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-white font-medium text-lg">Nutrition</h1>
            <ClientSelector clients={allClients} selectedId={clientId} label="Client" />
          </div>
        </div>
      )}
      <>
      {nutritionV3 ? (
        <NutritionV3Client
          clientId={clientId!}
          clientName={clientName}
          mealPlan={mealPlan as any}
          incomingPlan={incomingPlan as any}
          todayLogs={todayLogs}
          macroTarget={macroTarget as any}
          today={today}
          isTrainer={isTrainer}
        />
      ) : (
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
      )}
      {isTrainer && (
        <div className="mt-4">
          {nutritionV3 ? (
            // v3 clients: shared averages strip (canonical dailyTotals calc —
            // understands the v3 log protocol, so trainer numbers match the client's).
            <div className="px-4"><AveragesStrip clientId={clientId!} today={today} /></div>
          ) : (
            <NutritionAverages clientId={clientId!} today={today} />
          )}
        </div>
      )}
      </>
    </>
  );
}
