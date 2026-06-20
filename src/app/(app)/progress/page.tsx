import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProgressCharts from "./ProgressCharts";
import ClientSelector from "@/components/ClientSelector";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function ProgressPage({
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
  let clientName = "You";
  let allClients: { id: string; name: string }[] = [];

  if (isTrainer) {
    // Fetch all clients for dropdown
    const { data: clientList } = await supabase
      .from("clients")
      .select("id, name")
      .order("name");
    allClients = clientList || [];

    // Use selected client from query param, or default to Dustin
    if (params.clientId) {
      const found = allClients.find((c) => c.id === params.clientId);
      clientId = params.clientId;
      clientName = found?.name || "Client";
    } else {
      const dustin = allClients.find((c) => c.name.toLowerCase().includes("dustin"));
      clientId = dustin?.id || null;
      clientName = dustin?.name || "Select a client";
    }
  } else {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    clientId = data?.id || null;
    clientName = data?.name || "You";
  }

  // Body weight history (last 90 days)
  let weightLogs: { metric_date: string; weight: number; body_fat_pct: number | null; lean_mass: number | null; fat_mass: number | null }[] = [];
  if (clientId) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const { data } = await supabase
      .from("metrics")
      .select("metric_date, weight, body_fat_pct, lean_mass, fat_mass")
      .eq("client_id", clientId)
      .gte("metric_date", ninetyDaysAgo.toISOString().split("T")[0])
      .order("metric_date", { ascending: true });
    weightLogs = (data || []).map((r: any) => ({
      metric_date: r.metric_date,
      weight: parseFloat(r.weight) || 0,
      body_fat_pct: r.body_fat_pct ? parseFloat(r.body_fat_pct) : null,
      lean_mass: r.lean_mass ? parseFloat(r.lean_mass) : null,
      fat_mass: r.fat_mass ? parseFloat(r.fat_mass) : null,
    }));
  }

  // Workout log counts
  let totalWorkouts = 0;
  if (clientId) {
    const { count } = await supabase
      .from("workout_logs")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("completed", true);
    totalWorkouts = count || 0;
  }

  // Recent PRs
  let recentPRs: { exercise_name: string; weight: number; reps: number | null; date: string }[] = [];
  if (clientId) {
    const { data: setLogs } = await supabase
      .from("set_logs")
      .select("weight_lbs, weight, reps, logged_at, prescribed_exercises(exercises(name))")
      .eq("client_id", clientId)
      .eq("completed", true)
      .order("weight_lbs", { ascending: false })
      .limit(100);

    if (setLogs) {
      const prMap = new Map<string, { weight: number; reps: number | null; date: string }>();
      for (const sl of setLogs as any[]) {
        const name = sl.prescribed_exercises?.exercises?.name;
        if (!name) continue;
        const w = sl.weight_lbs ?? sl.weight ?? 0;
        if (!prMap.has(name) || w > prMap.get(name)!.weight) {
          prMap.set(name, {
            weight: w,
            reps: sl.reps,
            date: sl.logged_at?.split("T")[0] || "",
          });
        }
      }
      recentPRs = Array.from(prMap.entries())
        .map(([name, val]) => ({ exercise_name: name, ...val }))
        .slice(0, 5);
    }
  }

  return (
    <>
      <div style={{ background: "#0F4C81" }} className="px-4 py-4">
        <h1 className="text-white font-medium text-lg">Progress</h1>
        {isTrainer ? (
          <div className="mt-2">
            <ClientSelector
              clients={allClients}
              selectedId={clientId}
              label="Viewing"
            />
          </div>
        ) : (
          <p className="text-white/60 text-sm">{clientName}</p>
        )}
      </div>

      <div className="px-4 py-4">
        {clientId ? (
          <ProgressCharts
            weightLogs={weightLogs}
            totalWorkouts={totalWorkouts}
            recentPRs={recentPRs}
            clientId={clientId}
          />
        ) : (
          <p className="text-center py-12" style={{ color: "var(--brand-text-secondary)" }}>
            Select a client above to view their progress.
          </p>
        )}
      </div>
    </>
  );
}
