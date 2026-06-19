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

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [weightRes, countRes, setRes] = await Promise.all([
    supabase
      .from("body_weight_logs")
      .select("logged_at, weight_lbs")
      .eq("client_id", clientId)
      .gte("logged_at", ninetyDaysAgo.toISOString().split("T")[0])
      .order("logged_at", { ascending: true }),
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

  const weightLogs = weightRes.data || [];
  const totalWorkouts = countRes.count || 0;

  let recentPRs: { exercise_name: string; weight: number; reps: number | null; date: string }[] = [];
  if (setRes.data) {
    const prMap = new Map<string, { weight: number; reps: number | null; date: string }>();
    for (const sl of setRes.data as any[]) {
      const name = sl.prescribed_exercises?.exercises?.name;
      if (!name) continue;
      const w = sl.weight_lbs ?? sl.weight ?? 0;
      if (!prMap.has(name) || w > prMap.get(name)!.weight) {
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
