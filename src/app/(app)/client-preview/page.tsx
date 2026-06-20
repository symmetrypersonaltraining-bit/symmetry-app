import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClientDashboard from "../home/ClientDashboard";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function ClientPreviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Only the trainer can access this preview
  if (user.email !== TRAINER_EMAIL) redirect("/home");

  // Fetch Dustin's own client record
  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name")
    .eq("email", TRAINER_EMAIL)
    .maybeSingle();

  if (!clientRecord) {
    return (
      <div className="p-6 text-center">
        <p style={{ color: "var(--brand-text-secondary)" }}>
          No client record found for your account. Ask Claude to create one.
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  const { data: todayWorkout } = await supabase
    .from("scheduled_workouts")
    .select("id, day_id, status, days(id, label, phase_id, phases(label, programs(name)))")
    .eq("client_id", clientRecord.id)
    .eq("scheduled_date", today)
    .maybeSingle();

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const { data: recentScheduled } = await supabase
    .from("scheduled_workouts")
    .select("id, day_id, scheduled_date, status")
    .eq("client_id", clientRecord.id)
    .gte("scheduled_date", sixtyDaysAgo.toISOString().split("T")[0])
    .lte("scheduled_date", today)
    .order("scheduled_date", { ascending: false });

  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const thirtyStr = thirtyAgo.toISOString().split("T")[0];
  const recent30 = (recentScheduled || []).filter((w: any) => w.scheduled_date >= thirtyStr);
  const totalScheduled = recent30.length;
  const completedCount = recent30.filter((w: any) => w.status === "completed").length;

  const sorted = [...(recentScheduled || [])].sort((a: any, b: any) =>
    b.scheduled_date.localeCompare(a.scheduled_date)
  );
  const seenDates = new Set<string>();
  for (const w of sorted as any[]) {
    if (w.status === "completed") seenDates.add(w.scheduled_date);
  }
  const completedDates = Array.from(seenDates).sort().reverse();
  let streakDays = 0;
  if (completedDates.length > 0) {
    const firstCompleted = completedDates[0];
    const daysDiff = Math.floor(
      (new Date(today).getTime() - new Date(firstCompleted).getTime()) / 86400000
    );
    if (daysDiff <= 1) {
      for (const d of completedDates) {
        const expected = new Date(completedDates[0]);
        expected.setDate(expected.getDate() - streakDays);
        if (streakDays === 0) { streakDays++; }
        else if (d === expected.toISOString().split("T")[0]) { streakDays++; }
        else break;
      }
    }
  }

  const todayDow = new Date().getDay();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - todayDow);
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const weekEndStr = new Date(weekStart.getTime() + 6 * 86400000).toISOString().split("T")[0];
  const weekWorkouts = (recentScheduled || [])
    .filter((w: any) => w.scheduled_date >= weekStartStr && w.scheduled_date <= weekEndStr)
    .map((w: any) => ({ date: w.scheduled_date, completed: w.status === "completed" }));

  const { data: metricsHistory } = await supabase
    .from("metrics")
    .select("metric_date, weight, body_fat_pct, lean_mass, fat_mass")
    .eq("client_id", clientRecord.id)
    .order("metric_date", { ascending: false })
    .limit(10);
  const metrics = (metricsHistory || []).reverse();

  const { data: recentWorkouts } = await supabase
    .from("scheduled_workouts")
    .select("id, day_id, scheduled_date, status, days(id, label)")
    .eq("client_id", clientRecord.id)
    .eq("status", "completed")
    .order("scheduled_date", { ascending: false })
    .limit(5);

  const allScheduled = (recentScheduled || []).map((w: any) => ({
    id: (w.day_id || w.id) as string,
    date: w.scheduled_date as string,
    completed: w.status === "completed",
  }));

  const firstName = (clientRecord.name || "").split(" ")[0];

  return (
    <ClientDashboard
      firstName={firstName}
      todayWorkout={todayWorkout as any}
      metrics={metrics as any[]}
      completedCount={completedCount}
      totalScheduled={totalScheduled}
      recentWorkouts={(recentWorkouts || []) as any[]}
      streakDays={streakDays}
      weekWorkouts={weekWorkouts}
      allScheduled={allScheduled}
    />
  );
}
