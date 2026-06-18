import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProgressCharts from "./ProgressCharts";

export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = user.email === "symmetrypersonaltraining@gmail.com";

  let clientId: string | null = null;
  let clientName = "You";

  if (isTrainer) {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .ilike("name", "%Dustin%")
      .maybeSingle();
    clientId = data?.id || null;
    clientName = data?.name || "Dustin";
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
  let weightLogs: { logged_at: string; weight_lbs: number }[] = [];
  if (clientId) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const { data } = await supabase
      .from("body_weight_logs")
      .select("logged_at, weight_lbs")
      .eq("client_id", clientId)
      .gte("logged_at", ninetyDaysAgo.toISOString().split("T")[0])
      .order("logged_at", { ascending: true });
    weightLogs = data || [];
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

  // Recent PRs (highest weight per exercise)
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
        <p className="text-white/60 text-sm">{clientName}</p>
      </div>

      <div className="px-4 py-4">
        <ProgressCharts
          weightLogs={weightLogs}
          totalWorkouts={totalWorkouts}
          recentPRs={recentPRs}
          clientId={clientId}
        />
      </div>
    </>
  );
}
