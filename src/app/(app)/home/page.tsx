import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrainerHomeClient from "./TrainerHomeClient";
import ClientDashboard from "./ClientDashboard";
import PwaInstallBanner from "@/components/PwaInstallBanner";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isTrainer = (user?.email ?? "") === TRAINER_EMAIL;

  if (isTrainer) {
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name")
      .order("name");

    // Today's supervised sessions (trainer-led only)
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const clientIds = (clients ?? []).map((c: any) => c.id);

    const { data: todaySessionsRaw } = await supabase
      .from("scheduled_workouts")
      .select("id, client_id, status, days(id, label), clients(id, name)")
      .eq("scheduled_date", todayStr)
      .eq("supervised", true)
      .in("client_id", clientIds)
      .order("status", { ascending: true });

    const todaySessions = (todaySessionsRaw ?? []).map((sw: any) => ({
      id: sw.id,
      clientId: sw.clients?.id ?? sw.client_id,
      clientName: sw.clients?.name ?? "",
      workoutLabel: sw.days?.label ?? "Session",
      dayId: sw.days?.id ?? "",
      status: sw.status ?? "scheduled",
    }));

    const loggedTodayCount = todaySessions.filter((s: any) => s.status === "completed").length;

    // Pending payment reminders (Needs Attention)
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const { data: remindersRaw } = await supabase
      .from("payment_reminders")
      .select("id, client_id, due_date, amount_due, clients(id, name)")
      .gte("due_date", todayStr)
      .lte("due_date", thirtyDays.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
      .eq("notification_status", "pending")
      .order("due_date");

    const reminders = (remindersRaw ?? []).map((r: any) => ({
      id: r.id,
      clientId: r.clients?.id ?? r.client_id,
      clientName: r.clients?.name ?? "Unknown",
      dueDate: r.due_date,
      amountDue: Number(r.amount_due),
    }));

    return (
      <TrainerHomeClient
        clients={clients ?? []}
        todaySessions={todaySessions}
        loggedTodayCount={loggedTodayCount}
        reminders={reminders}
        notifCount={reminders.length}
      />
    );
  }

  // ─── CLIENT DASHBOARD ──────────────────────────────────────────────────────
  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!clientRecord) {
    return (
      <div className="p-6 text-center">
        <p style={{ color: "var(--brand-text-secondary)" }}>Your account is being set up. Check back soon.</p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

  const { data: todayWorkout } = await supabase
    .from("scheduled_workouts")
    .select("id, status, days(label, phase_id, phases(label, programs(name)))")
    .eq("client_id", clientRecord.id)
    .eq("scheduled_date", today)
    .maybeSingle();

  // 60 days of history for week nav + streak
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyStr = sixtyDaysAgo.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const { data: recentScheduled } = await supabase
    .from("scheduled_workouts")
    .select("id, scheduled_date, status")
    .eq("client_id", clientRecord.id)
    .gte("scheduled_date", sixtyStr)
    .lte("scheduled_date", today)
    .order("scheduled_date", { ascending: false });

  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const thirtyStr = thirtyAgo.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const recent30 = (recentScheduled || []).filter((w: any) => w.scheduled_date >= thirtyStr);
  const totalScheduled = recent30.length;
  const completedCount = recent30.filter((w: any) => w.status === "completed").length;

  // Streak calc
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
    const daysDiff = Math.floor((new Date(today).getTime() - new Date(firstCompleted).getTime()) / 86400000);
    if (daysDiff <= 1) {
      for (let i = 0; i < completedDates.length; i++) {
        if (i === 0) { streakDays++; continue; }
        const prev = new Date(completedDates[i - 1] + "T00:00:00");
        const curr = new Date(completedDates[i] + "T00:00:00");
        const diff = Math.round((prev.getTime() - curr.getTime()) / 86400000);
        if (diff === 1) { streakDays++; } else { break; }
      }
    }
  }

  // Current week
  const todayDate = new Date();
  const todayDow = todayDate.getDay();
  const weekStart = new Date(todayDate);
  weekStart.setDate(weekStart.getDate() - todayDow);
  const weekStartStr = weekStart.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const weekWorkouts = (recentScheduled || [])
    .filter((w: any) => w.scheduled_date >= weekStartStr && w.scheduled_date <= weekEndStr)
    .map((w: any) => ({ date: w.scheduled_date, completed: w.status === "completed" }));

  const allScheduled = (recentScheduled || []).map((w: any) => ({
    id: w.id as string,
    date: w.scheduled_date as string,
    completed: w.status === "completed",
  }));

  // Metrics
  const { data: metricsHistory } = await supabase
    .from("metrics")
    .select("metric_date, weight, body_fat_pct, lean_mass, fat_mass")
    .eq("client_id", clientRecord.id)
    .order("metric_date", { ascending: false })
    .limit(30);
  const metrics = (metricsHistory || []).reverse();

  const { data: recentWorkouts } = await supabase
    .from("scheduled_workouts")
    .select("id, scheduled_date, status, days(label)")
    .eq("client_id", clientRecord.id)
    .eq("status", "completed")
    .order("scheduled_date", { ascending: false })
    .limit(5);

  // Payment notifications (show 1 week before due, persist until dismissed)
  const { data: notificationsRaw } = await supabase
    .from("client_notifications")
    .select("id, type, title, body, amount_due, due_date")
    .eq("client_id", clientRecord.id)
    .eq("type", "payment_due")
    .is("dismissed_at", null)
    .eq("is_read", false)
    .order("due_date", { ascending: true });

  const notifications = (notificationsRaw ?? []) as any[];

  const firstName = (clientRecord.name || "").split(" ")[0];

  return (
    <>
      <PwaInstallBanner />
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
        notifications={notifications}
      />
    </>
  );
}
