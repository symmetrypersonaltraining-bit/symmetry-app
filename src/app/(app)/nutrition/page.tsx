import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import { cookies } from "next/headers";
import MealPlanClient from "./MealPlanClient";
import NutritionV3Client from "./v3/NutritionV3Client";
import NutritionAverages from "@/components/NutritionAverages";
import ClientSelector from "@/components/ClientSelector";
import { fetchLivePlans, pickPlanForDate } from "@/lib/nutrition/resolvePlan";
import { viewerIsTrainer } from "@/lib/auth/viewer";

async function isClientMode(asMarker?: string): Promise<boolean> {
  // Explicit ?as=client marker OR the cookie (marker wins on first render even
  // before the client-mode cookie propagates) — fixes intermittent trainer-UI
  // leak in Client View.
  if (asMarker === "client") return true;
  // ?as=trainer is the mirror of ?as=client, and it BEATS the cookie.
  //
  // Entering client view was deterministic — the marker forced the client
  // branch on the first server render whatever the cookie said. LEAVING it had
  // no marker at all: the toggle pushed a bare /home and relied entirely on
  // `document.cookie = "symmetry_client_mode=; max-age=0"` having propagated
  // before the RSC request went out. When it had not, the server read the
  // cookie as still set and rendered the CLIENT dashboard for a trainer who had
  // just asked for the trainer one.
  //
  // Dustin, 22 Aug: "my app is currently opening to client view when i hit
  // trainer toggle" — and again, the other way, as a hang: the wrong branch
  // renders the trainer's all-clients schedule query, which takes ~1.8s, so the
  // mistake shows up as a freeze rather than as a wrong screen.
  if (asMarker === "trainer") return false;
  const cookieStore = await cookies();
  return cookieStore.get("symmetry_client_mode")?.value === "1";
}

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; as?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");

  const isTrainer = await viewerIsTrainer(supabase, user);
  const sp = await searchParams;
  const inClientMode = await isClientMode(sp?.as);

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
  // Central, not UTC: derive the 7-day floor from the Central date, not Date.now() in UTC.
  const weekFloor = (() => {
    const [y, m, d] = today.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 7);
    return dt.toISOString().slice(0, 10);
  })();

  let mealPlan: any = null;
  let livePlans: any[] = [];
  let todayLogs: any[] = [];
  let macroTarget: any = null;
  let planLocked = false;
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

    const [lpRows, tlRes, mtRes, wlRes, lockRes] = await Promise.all([
      // Full live-plan SET (day-group tagged + everyday). resolveLivePlanForDate
      // logic: pickPlanForDate returns the right menu for a given date. For a
      // client with one null-day_group plan this is exactly today's behavior.
      fetchLivePlans(supabase, clientId, today),
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
      // Whether this client's plan is authored outside the app. It decides
      // whether the day's macro target is READ OFF THE PLAN or taken from the
      // macro_targets row — see the comment on dailyTarget in NutritionV3Client.
      supabase.from("clients").select("plan_locked").eq("id", clientId).maybeSingle(),
    ]);

    livePlans = lpRows || [];
    mealPlan = pickPlanForDate(livePlans, today); // today's governing menu
    todayLogs = tlRes.data || [];
    macroTarget = mtRes.data;
    planLocked = (lockRes.data as { plan_locked?: boolean } | null)?.plan_locked === true;
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
          livePlans={livePlans as any}
          incomingPlan={incomingPlan as any}
          todayLogs={todayLogs}
          macroTarget={macroTarget as any}
          planLocked={planLocked}
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
      {isTrainer && !nutritionV3 && (
        // v3 folds range averages + adherence + logging rate into the unified
        // summary card inside NutritionV3Client (shown for client AND trainer),
        // so no separate strip here. Non-v3 clients keep the legacy averages.
        <div className="mt-4">
          <NutritionAverages clientId={clientId!} today={today} />
        </div>
      )}
      </>
    </>
  );
}
