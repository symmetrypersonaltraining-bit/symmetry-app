import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MealPlanClient from "./MealPlanClient";
import ClientSelector from "@/components/ClientSelector";
import { isClientMode } from "@/lib/client-mode";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; viewAsClient?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === TRAINER_EMAIL;
  const params = await searchParams;

  const isInClientMode = await isClientMode(); // boolean
  let clientId: string | null = params?.clientId ?? null;
  let clientName = "";
  let allClients: { id: string; name: string }[] = [];

  if (!clientId) {
    if (isTrainer && isInClientMode) {
      // Trainer viewing their own client dashboard — look up their client record by email
      const { data: ownClient } = await supabase
        .from("clients")
        .select("id, name")
        .eq("email", user.email!)
        .maybeSingle();
      clientId = ownClient?.id ?? null;
      clientName = ownClient?.name ?? "You";
    } else if (isTrainer && !isInClientMode) {
      // Trainer in normal mode — fetch all clients for dropdown
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
      // Regular client — look up their client record by auth user id
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id, name")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      clientId = clientRow?.id ?? null;
      clientName = clientRow?.name ?? "You";

      if (!clientId) {
        return (
          <div className="p-6 text-center" style={{ color: "var(--brand-text-secondary)" }}>
            No client record found.
          </div>
        );
      }
    }
  } else {
    // clientId came from URL param — look up name
    if (isTrainer && !isInClientMode) {
      const { data: clientList } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      allClients = clientList || [];
      const found = allClients.find((c) => c.id === clientId);
      clientName = found?.name || "Client";
    }
  }

  // Only trainer without client mode and without URL param sees picker
  if (isTrainer && !isInClientMode && !clientId) {
    return (
      <>
        <div style={{ background: "var(--brand-primary)" }} className="px-4 py-4">
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

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

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

  return (
    <>
      {isTrainer && !isInClientMode && (
        <div style={{ background: "var(--brand-primary)" }} className="px-4 py-3">
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
        isTrainer={isTrainer && !isInClientMode}
      />
    </>
  );
}
