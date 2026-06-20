import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProgressCharts from "../../progress/ProgressCharts";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function ClientPreviewProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email !== TRAINER_EMAIL) redirect("/progress");

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

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [weightRes, countRes, setRes] = await Promise.all([
    supabase
      .from("metrics")
      .select("metric_date, weight, body_fat_pct, lean_mass, fat_mass")
      .eq("client_id", clientId)
      .gte("metric_date", ninetyDaysAgo.toISOString().split("T")[0])
      .order("metric_date", { ascending: true }),
    supabase
      .from("workout_logs")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("completed", true),
    supabase
      .from("set_logs")
      .select("weight_lbs, weight, reps, logged_at, prescribed_exercises(exercises(name))")
      .eq("client_id", clientId)
      .eq("completed", true)
      .order("weight_lbs", { ascending: false })
      .limit(100),
  ]);

  const weightLogs =
    (weightRes.data || []).map((r) => ({
      metric_date: r.metric_date,
      weight: parseFloat(r.weight) || 0,
      body_fat_pct: r.body_fat_pct ? parseFloat(r.body_fat_pct) : null,
      lean_mass: r.lean_mass ? parseFloat(r.lean_mass) : null,
      fat_mass: r.fat_mass ? parseFloat(r.fat_mass) : null,
    }));
  const totalWorkouts = countRes.count || 0;

  let recentPRs = [];
  if (setRes.data) {
    const prMap = new Map();
    for (const sl of setRes.data) {
      const name = sl.prescribed_exercises?.exercises?.name;
      if (!name) continue;
      const w = sl.weight_lbs ?? sl.weight ?? 0;
      if (!prMap.has(name) || w > prMap.get(name).weight) {
        prMap.set(name, { weight: w, reps: sl.reps, date: sl.logged_at?.split("T")[0] || "" });
      }
    }
    recentPRs = Array.from(prMap.entries())
      .map(([name, val]) => ({ exercise_name: name, ...val }))
      .slice(0, 5);
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
